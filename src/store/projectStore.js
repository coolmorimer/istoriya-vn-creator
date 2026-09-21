import { create } from "zustand";
import { defaultProject, createId } from "../data/defaultProject.js";
import { createProject } from "../domain/projectFactory.js";
import { connectScenes, updateExit, removeExit, renumberScenes } from "../domain/storyGraph.js";
import { materializeTimeline, timelineClips, roundTime, canSplitClip } from '../../runtime/timeline-model.mjs';

const STORAGE_KEY = "istoriya-project-v2";
const LIBRARY_KEY = "istoriya-project-library-v1";
const DRAFT_KEY = "istoriya-project-recovery-v1";
const CURRENT_SCHEMA = 2;
const projectStorage = globalThis.window?.istoriya?.storage ?? globalThis.localStorage;
// Keep existing browser-backed desktop projects when upgrading to disk storage.
if (globalThis.window?.istoriya?.storage && globalThis.localStorage) {
  for (const key of [STORAGE_KEY, LIBRARY_KEY, DRAFT_KEY]) {
    if (!projectStorage.getItem(key)) {
      const previous = localStorage.getItem(key);
      if (previous) projectStorage.setItem(key, previous);
    }
  }
}

export function normalizeProject(source) {
  if (!source || typeof source !== "object" || !source.scenes || typeof source.scenes !== "object") {
    throw new Error("Файл не похож на проект «История».");
  }
  const project = structuredClone(source);
  // Old browser projects used root-relative URLs, which point outside the app in file:// builds.
  const migrateAssets = (value) => {
    for (const [key, child] of Object.entries(value)) {
      if (typeof child === "string" && child.startsWith("/assets/")) value[key] = `.${child}`;
      else if (child && typeof child === "object") migrateAssets(child);
    }
  };
  migrateAssets(project);
  project.schemaVersion = CURRENT_SCHEMA;
  project.id ||= createId("project");
  project.meta = {
    ...structuredClone(defaultProject.meta),
    ...(project.meta ?? {}),
    resolution: {
      ...defaultProject.meta.resolution,
      ...(project.meta?.resolution ?? {}),
    },
    cursorHotspot: {
      ...defaultProject.meta.cursorHotspot,
      ...(project.meta?.cursorHotspot ?? {}),
    },
    android: {
      ...defaultProject.meta.android,
      ...(project.meta?.android ?? {}),
      permissions: Array.isArray(project.meta?.android?.permissions)
        ? project.meta.android.permissions
        : [...defaultProject.meta.android.permissions],
    },
  };
  project.ui = {
    ...structuredClone(defaultProject.ui),
    ...(project.ui ?? {}),
    mainMenuButtons: { ...defaultProject.ui.mainMenuButtons, ...(project.ui?.mainMenuButtons ?? {}) },
    quickMenuButtons: { ...defaultProject.ui.quickMenuButtons, ...(project.ui?.quickMenuButtons ?? {}) },
  };
  project.editor = { ...structuredClone(defaultProject.editor), ...(project.editor ?? {}) };
  project.resources = Array.isArray(project.resources) ? project.resources : [];
  project.gallery = {
    ...structuredClone(defaultProject.gallery),
    ...(project.gallery ?? {}),
    sections: Array.isArray(project.gallery?.sections) ? project.gallery.sections : structuredClone(defaultProject.gallery.sections),
  };
  project.variables = Array.isArray(project.variables) ? project.variables : [];
  project.flags = Array.isArray(project.flags) ? project.flags : [];
  project.characters = (Array.isArray(project.characters) ? project.characters : []).map((character) => ({
    internalName: character.name?.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, "_") || "character",
    defaultPosition: "center",
    sprites: [],
    ...character,
    sprites: Array.isArray(character.sprites) ? character.sprites : [],
  }));
  project.chapters = Array.isArray(project.chapters) ? project.chapters : [];
  if (!Object.keys(project.scenes).length) throw new Error("В файле проекта нет сцен.");
  const placed = new Set();
  for (const chapter of project.chapters) chapter.scenes = (chapter.scenes ?? []).filter((id) => { if (!project.scenes[id] || placed.has(id)) return false; placed.add(id); return true; });
  if (!project.chapters.length) project.chapters.push({ id: createId("chapter"), title: "Глава 1", scenes: [] });
  for (const id of Object.keys(project.scenes)) if (!placed.has(id)) project.chapters[0].scenes.push(id);
  for (const scene of Object.values(project.scenes)) {
    scene.actions = (Array.isArray(scene.actions) ? scene.actions : []).map((action) => ({
      ...action,
      options: action.type === "choice" ? (action.options ?? []).map((option) => ({ ...option, effects: (option.effects ?? []).map((effect) => ({ id: effect.id || createId("effect"), kind: effect.kind || (effect.flagId ? "flag" : "variable"), ...effect })) })) : action.options,
    }));
    scene.characters = (Array.isArray(scene.characters) ? scene.characters : []).map((layer, index) => ({
      id: layer.id || createId("layer"),
      name: `Персонаж ${index + 1}`,
      spriteId: null,
      x: layer.position === "left" ? 25 : layer.position === "right" ? 75 : 50,
      y: 100,
      scale: 100,
      rotation: 0,
      opacity: 100,
      visible: true,
      locked: false,
      flip: false,
      ...layer,
    }));
  }
  return project;
}

function loadProject() {
  try {
    const raw = projectStorage.getItem(STORAGE_KEY);
    const stored = raw ? JSON.parse(raw) : createProject();
    const recoveryRaw = projectStorage.getItem(DRAFT_KEY);
    if (recoveryRaw) {
      const recovery = JSON.parse(recoveryRaw);
      const storedTime = Date.parse(stored.meta?.modifiedAt ?? 0) || 0;
      if (Date.parse(recovery.savedAt) > storedTime && window.confirm("Обнаружена более новая автоматически сохранённая версия проекта. Восстановить её?")) return normalizeProject(recovery.project);
      projectStorage.removeItem(DRAFT_KEY);
    }
    return normalizeProject(stored);
  } catch {
    return normalizeProject(createProject());
  }
}

function loadLibrary() {
  try {
    const raw = projectStorage.getItem(LIBRARY_KEY);
    if (raw) return JSON.parse(raw).map(normalizeProject);
  } catch {
    // A damaged library must not prevent the editor from opening.
  }
  return [];
}

function persistProject(project) {
  const saved = structuredClone(project);
  saved.meta.modifiedAt = new Date().toISOString();
  projectStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  const library = loadLibrary().filter((item) => item.id !== saved.id);
  const nextLibrary = [saved, ...library];
  projectStorage.setItem(LIBRARY_KEY, JSON.stringify(nextLibrary));
  return nextLibrary;
}

function withHistory(set, recipe) {
  set((state) => {
    const next = structuredClone(state.project);
    recipe(next);
    return {
      project: next,
      past: [...state.past.slice(-49), state.project],
      future: [],
      saveState: "saving",
    };
  });
}

function selectionFor(project) {
  const activeSceneId = project.chapters.flatMap((chapter) => chapter.scenes).find((id) => project.scenes[id]) ?? Object.keys(project.scenes)[0];
  return { activeSceneId, activeActionId: null, activeLayerId: null, selectedCharacterId: project.characters[0]?.id ?? null, selectedResourceId: project.resources[0]?.id ?? null, activeSection: "scenes", inspectorTab: "properties", bottomTab: "scenario" };
}
const initialProject = loadProject();
export const useProjectStore = create((set, get) => ({
  project: initialProject,
  projects: loadLibrary(),
  activeSection: "scenes",
  ...selectionFor(initialProject),
  inspectorTab: "properties",
  bottomTab: "scenario",
  timelineTime: 0,
  setTimelineTime: (timelineTime) => set({timelineTime:Math.max(0,timelineTime)}),
  editClip: (sceneId,actionId,patch) => withHistory(set,project=>{
    const scene=project.scenes[sceneId];materializeTimeline(scene);
    const action=scene.actions.find(a=>a.id===actionId);if(!action)return;
    Object.assign(action.timeline,patch);
    action.timeline.start=roundTime(Math.max(0,action.timeline.start));
    action.timeline.duration=roundTime(Math.max(.1,action.timeline.duration));
    scene.actions.sort((a,b)=>a.timeline.start-b.timeline.start);
  }),
  splitClip: (sceneId,actionId,time) => withHistory(set,project=>{
    const scene=project.scenes[sceneId];materializeTimeline(scene);
    const action=scene.actions.find(a=>a.id===actionId);if(!action)return;
    if(action.timeline.locked || !canSplitClip(action))return;
    const t=action.timeline;if(time<=t.start+.1||time>=t.start+t.duration-.1)return;
    const copy=structuredClone(action);copy.id=createId('act');copy.timeline.start=roundTime(time);copy.timeline.duration=roundTime(t.start+t.duration-time);t.duration=roundTime(time-t.start);
    if(['dialogue','narration'].includes(action.type))t.waitForClick=false;
    if(copy.options)copy.options=copy.options.map(o=>({...o,id:createId('choice')}));
    scene.actions.push(copy);scene.actions.sort((a,b)=>a.timeline.start-b.timeline.start);
  }),
  setTimelineTrack: (sceneId,track,key,value) => withHistory(set,project=>{
    const scene=project.scenes[sceneId];materializeTimeline(scene);
    for(const clip of timelineClips(scene))if(clip.track===track)clip.action.timeline[key]=value;
  }),
  zoom: 100,
  saveState: "saved",
  past: [],
  future: [],

  setActiveSection: (activeSection) => set({ activeSection }),
  setActiveScene: (activeSceneId) => set((state) => ({ activeSceneId, activeActionId: null, activeLayerId: state.project.scenes[activeSceneId]?.characters?.[0]?.id ?? null, activeSection: "scenes" })),
  setActiveAction: (activeActionId) => set({ activeActionId, activeLayerId: null, inspectorTab: "properties" }),
  setActiveLayer: (activeLayerId) => set({ activeLayerId, activeActionId: null, inspectorTab: "properties" }),
  setSelectedCharacter: (selectedCharacterId) => set({ selectedCharacterId }),
  setSelectedResource: (selectedResourceId) => set({ selectedResourceId }),
  setInspectorTab: (inspectorTab) => set({ inspectorTab }),
  setBottomTab: (bottomTab) => set({ bottomTab }),
  setZoom: (zoom) => set({ zoom: Math.max(50, Math.min(150, zoom)) }),

  newProject: (configuration = "empty") => {
    if (get().saveState !== "saved") get().saveNow();
    const project = normalizeProject(createProject(configuration));
    set({ project, ...selectionFor(project), past: [], future: [], saveState: "saving" });
    get().saveNow();
    return project;
  },

  openProject: (projectId) => {
    if (get().saveState !== "saved") get().saveNow();
    const project = get().projects.find((item) => item.id === projectId);
    if (!project) return false;
    const normalized = normalizeProject(project);
    set({ project: normalized, ...selectionFor(normalized), past: [], future: [], saveState: "saved" });
    return true;
  },

  updateMeta: (patch) => withHistory(set, (project) => Object.assign(project.meta, patch)),
  updateUi: (patch) => withHistory(set, (project) => {
    Object.assign(project.ui,patch);
    for(const [legacy,key] of [['dialogueFontSize','size'],['dialogueTextColor','color'],['textSpeed','speed']]) {
      if(legacy in patch && project.ui.textStyle) project.ui.textStyle[key]=patch[legacy];
      if(patch.textStyle?.[key]!=null) project.ui[legacy]=patch.textStyle[key];
    }
  }),
  updateEditor: (patch) => withHistory(set, (project) => Object.assign(project.editor, patch)),
  updateScene: (sceneId, patch) => withHistory(set, (project) => Object.assign(project.scenes[sceneId], patch)),
  updateAction: (sceneId, actionId, patch) => withHistory(set, (project) => {
    const action = project.scenes[sceneId].actions.find((item) => item.id === actionId);
    if (action) { Object.assign(action, patch); if(action.timeline && patch.duration != null) action.timeline.duration=Math.max(.1,Number(patch.duration)||.1); }
  }),

  addResource: (resource) => withHistory(set, (project) => {
    project.resources.push({ id: createId("res"), importedAt: new Date().toISOString(), ...resource });
  }),

  updateResource: (resourceId, patch) => withHistory(set, (project) => {
    const resource = project.resources.find((item) => item.id === resourceId);
    if (resource) Object.assign(resource, patch);
  }),

  replaceResource: (resourceId, replacement) => withHistory(set, (project) => {
    const resource = project.resources.find((item) => item.id === resourceId);
    if (!resource) return;
    const previousSource = resource.source;
    Object.assign(resource, replacement, { id: resourceId, replacedAt: new Date().toISOString() });
    for (const scene of Object.values(project.scenes)) {
      if (scene.backgroundResourceId === resourceId || scene.background === previousSource) { scene.backgroundResourceId = resourceId; scene.background = resource.source; }
    }
    for (const character of project.characters) {
      if (character.portraitResourceId === resourceId || character.portrait === previousSource) { character.portraitResourceId = resourceId; character.portrait = resource.source; }
      for (const sprite of character.sprites) if (sprite.resourceId === resourceId || sprite.source === previousSource) { sprite.resourceId = resourceId; sprite.source = resource.source; }
    }
    if (project.ui.dialogueBackgroundResourceId === resourceId || project.ui.dialogueBackground === previousSource) project.ui.dialogueBackground = resource.source;
    if (project.ui.mainMenuBackgroundResourceId === resourceId || project.ui.mainMenuBackground === previousSource) project.ui.mainMenuBackground = resource.source;
  }),

  removeResource: (resourceId) => withHistory(set, (project) => {
    const resource = project.resources.find((item) => item.id === resourceId);
    project.resources = project.resources.filter((item) => item.id !== resourceId);
    for (const scene of Object.values(project.scenes)) {
      if (scene.backgroundResourceId === resourceId || scene.background === resource?.source) { scene.backgroundResourceId = null; scene.background = null; }
      for (const action of scene.actions) {
        if (action.assetId === resourceId) action.assetId = null;
        if (action.voiceAssetId === resourceId) action.voiceAssetId = null;
      }
    }
    for (const character of project.characters) {
      if (character.portraitResourceId === resourceId || character.portrait === resource?.source) { character.portraitResourceId = null; character.portrait = null; }
      for (const sprite of character.sprites) if (sprite.resourceId === resourceId || sprite.source === resource?.source) { sprite.resourceId = null; sprite.source = null; }
    }
    for (const section of project.gallery.sections) section.items = section.items.filter((item) => item.resourceId !== resourceId);
    if (project.ui.dialogueBackgroundResourceId === resourceId || project.ui.dialogueBackground === resource?.source) { project.ui.dialogueBackgroundResourceId = null; project.ui.dialogueBackground = null; }
    if (project.ui.mainMenuBackgroundResourceId === resourceId || project.ui.mainMenuBackground === resource?.source) { project.ui.mainMenuBackgroundResourceId = null; project.ui.mainMenuBackground = null; }
  }),

  addCharacter: () => {
    const id = createId("char");
    withHistory(set, (project) => {
      project.characters.push({ id, internalName: `hero_${project.characters.length + 1}`, name: "Новый персонаж", color: "#8fdcf0", portrait: null, defaultPosition: "center", sprites: [] });
    });
    set({ selectedCharacterId: id, activeSection: "characters" });
  },

  updateCharacter: (characterId, patch) => withHistory(set, (project) => {
    const character = project.characters.find((item) => item.id === characterId);
    if (character) Object.assign(character, patch);
  }),

  removeCharacter: (characterId) => {
    const state = get();
    if (state.project.characters.length < 1) return false;
    const used = Object.values(state.project.scenes).some((scene) => scene.characters?.some((layer) => layer.characterId === characterId) || scene.actions?.some((action) => action.speakerId === characterId || action.characterId === characterId));
    if (used) return false;
    withHistory(set, (project) => { project.characters = project.characters.filter((item) => item.id !== characterId); });
    set({ selectedCharacterId: get().project.characters.find((item) => item.id !== characterId)?.id ?? null });
    return true;
  },

  addCharacterSprite: (characterId, sprite) => withHistory(set, (project) => {
    const character = project.characters.find((item) => item.id === characterId);
    if (character) {
      const added = { id: createId("sprite"), name: "Новое состояние", ...sprite };
      character.sprites.push(added);
      if (!character.defaultSpriteId) character.defaultSpriteId = added.id;
    }
  }),

  removeCharacterSprite: (characterId, spriteId) => {
    const used = Object.values(get().project.scenes).some((scene) => scene.characters?.some((layer) => layer.characterId === characterId && layer.spriteId === spriteId) || scene.actions?.some((action) => (action.speakerId === characterId || action.characterId === characterId) && action.spriteId === spriteId));
    if (used) return false;
    withHistory(set, (project) => {
      const character = project.characters.find((item) => item.id === characterId);
      if (character) {
        character.sprites = character.sprites.filter((item) => item.id !== spriteId);
        if (character.defaultSpriteId === spriteId) character.defaultSpriteId = character.sprites[0]?.id ?? null;
      }
    });
    return true;
  },

  addSceneCharacter: (sceneId, characterId) => {
    const layerId = createId("layer");
    withHistory(set, (project) => {
      const character = project.characters.find((item) => item.id === characterId);
      const x = character?.defaultPosition === "left" ? 25 : character?.defaultPosition === "right" ? 75 : 50;
      project.scenes[sceneId].characters ||= [];
      project.scenes[sceneId].characters.push({ id: layerId, characterId, spriteId: null, name: character?.name ?? "Персонаж", x, y: 100, scale: 100, rotation: 0, opacity: 100, visible: true, locked: false, flip: false });
    });
    set({ activeLayerId: layerId, activeActionId: null });
  },

  updateSceneCharacter: (sceneId, layerId, patch) => withHistory(set, (project) => {
    const layer = project.scenes[sceneId].characters?.find((item) => item.id === layerId);
    if (layer) Object.assign(layer, patch);
  }),

  removeSceneCharacter: (sceneId, layerId) => withHistory(set, (project) => {
    project.scenes[sceneId].characters = (project.scenes[sceneId].characters ?? []).filter((item) => item.id !== layerId);
  }),

  moveSceneCharacter: (sceneId, layerId, direction) => withHistory(set, (project) => {
    const layers = project.scenes[sceneId].characters ?? [];
    const index = layers.findIndex((item) => item.id === layerId);
    const target = direction === "up" ? index + 1 : index - 1;
    if (index >= 0 && target >= 0 && target < layers.length) [layers[index], layers[target]] = [layers[target], layers[index]];
  }),

  addVariable: (type = "number") => withHistory(set, (project) => {
    project.variables.push({ id: createId("var"), name: "Новая переменная", type, initial: type === "number" ? 0 : type === "boolean" ? false : "" });
  }),

  updateVariable: (variableId, patch) => withHistory(set, (project) => {
    const variable = project.variables.find((item) => item.id === variableId);
    if (variable) Object.assign(variable, patch);
  }),

  removeVariable: (variableId) => {
    const used = Object.values(get().project.scenes).some((scene) => scene.actions?.some((action) => action.variableId === variableId || action.options?.some((option) => option.condition?.variableId === variableId || option.effects?.some((effect) => effect.variableId === variableId))));
    if (used) return false;
    withHistory(set, (project) => { project.variables = project.variables.filter((item) => item.id !== variableId); });
    return true;
  },

  addFlag: () => withHistory(set, (project) => {
    project.flags.push({ id: createId("flag"), name: "Новое событие", initial: false });
  }),

  updateFlag: (flagId, patch) => withHistory(set, (project) => {
    const flag = project.flags.find((item) => item.id === flagId);
    if (flag) Object.assign(flag, patch);
  }),

  removeFlag: (flagId) => {
    const used = Object.values(get().project.scenes).some((scene) => scene.actions?.some((action) => action.flagId === flagId || action.options?.some((option) => option.effects?.some((effect) => effect.flagId === flagId))));
    if (used) return false;
    withHistory(set, (project) => { project.flags = project.flags.filter((item) => item.id !== flagId); });
    return true;
  },

  addGallerySection: () => withHistory(set, (project) => {
    project.gallery.sections.push({ id: createId("gallery"), title: "Новый раздел", items: [] });
  }),

  updateGallerySection: (sectionId, patch) => withHistory(set, (project) => {
    const section = project.gallery.sections.find((item) => item.id === sectionId);
    if (section) Object.assign(section, patch);
  }),

  removeGallerySection: (sectionId) => withHistory(set, (project) => {
    if (project.gallery.sections.length > 1) project.gallery.sections = project.gallery.sections.filter((item) => item.id !== sectionId);
  }),

  addGalleryItem: (sectionId, resourceId) => withHistory(set, (project) => {
    const section = project.gallery.sections.find((item) => item.id === sectionId);
    const resource = project.resources.find((item) => item.id === resourceId);
    if (section && resource && !section.items.some((item) => item.resourceId === resourceId)) section.items.push({ id: createId("gallery_item"), resourceId, title: resource.name, unlockMode: "seen" });
  }),

  updateGalleryItem: (sectionId, itemId, patch) => withHistory(set, (project) => {
    const item = project.gallery.sections.find((section) => section.id === sectionId)?.items.find((entry) => entry.id === itemId);
    if (item) Object.assign(item, patch);
  }),

  removeGalleryItem: (sectionId, itemId) => withHistory(set, (project) => {
    const section = project.gallery.sections.find((item) => item.id === sectionId);
    if (section) section.items = section.items.filter((item) => item.id !== itemId);
  }),

  addChapter: () => {
    const id = createId("chapter");
    withHistory(set, (project) => project.chapters.push({ id, title: `Глава ${project.chapters.length + 1}`, scenes: [] }));
    return id;
  },

  updateChapter: (chapterId, patch) => withHistory(set, (project) => {
    const chapter = project.chapters.find((item) => item.id === chapterId);
    if (chapter) Object.assign(chapter, patch);
  }),

  moveChapter: (chapterId, direction) => withHistory(set, (project) => {
    const index = project.chapters.findIndex((item) => item.id === chapterId);
    const target = direction === "up" ? index - 1 : index + 1;
    if (index >= 0 && target >= 0 && target < project.chapters.length) [project.chapters[index], project.chapters[target]] = [project.chapters[target], project.chapters[index]];
  }),

  removeChapter: (chapterId) => withHistory(set, (project) => {
    const chapter = project.chapters.find((item) => item.id === chapterId);
    if (!chapter || chapter.scenes.length || project.chapters.length < 2) return;
    project.chapters = project.chapters.filter((item) => item.id !== chapterId);
  }),

  addScene: (chapterId, { open = true } = {}) => {
    const id = createId("scene");
    withHistory(set, (project) => {
      if (!project.chapters.length) project.chapters.push({ id: createId("chapter"), title: "Глава 1", scenes: [] });
      const chapter = project.chapters.find((item) => item.id === chapterId) ?? project.chapters[project.chapters.length - 1];
      const chapterIndex = project.chapters.findIndex((item) => item.id === chapter.id);
      const sceneNumber = `${chapterIndex + 1}.${chapter.scenes.length + 1}`;
      project.scenes[id] = {
        id,
        number: sceneNumber,
        title: "Новая сцена",
        description: "Добавьте описание сцены",
        background: null,
        transition: "fade",
        duration: 1,
        characters: [],
        actions: [],
      };
      chapter.scenes.push(id);
    });
    set({ activeSceneId: id, activeActionId: null, activeLayerId: null, activeSection: open ? "scenes" : get().activeSection });
    return id;
  },

  connectScenes: (from, to) => withHistory(set, (project) => connectScenes(project, from, to)),
  updateExit: (edge, patch) => withHistory(set, (project) => updateExit(project, edge, patch)),
  removeExit: (edge) => withHistory(set, (project) => removeExit(project, edge)),
  moveSceneToChapter: (sceneId, chapterId) => withHistory(set, (project) => {
    const target = project.chapters.find((chapter) => chapter.id === chapterId);
    if (!target || !project.scenes[sceneId]) return;
    for (const chapter of project.chapters) chapter.scenes = chapter.scenes.filter((id) => id !== sceneId);
    target.scenes.push(sceneId); renumberScenes(project);
  }),
  arrangeMap: () => withHistory(set, (project) => {
    let row = 0;
    for (const chapter of project.chapters) {
      const lanes = [...new Set(chapter.scenes.map(id=>project.scenes[id]?.storyline || chapter.storyline || 'Основная линия'))];
      for(const lane of lanes) {
        const ids=chapter.scenes.filter(id=>(project.scenes[id]?.storyline || chapter.storyline || 'Основная линия')===lane);
        ids.forEach((id,index)=>{if(project.scenes[id])project.scenes[id].mapPosition={x:50+index*300,y:50+row*200};});
        row++;
      }
    }
  }),

  removeScene: (sceneId) => {
    const project = get().project;
    if (Object.keys(project.scenes).length < 2) return false;
    const referenced = Object.values(project.scenes).some((scene) => scene.actions?.some((action) => action.targetSceneId === sceneId || action.trueSceneId === sceneId || action.falseSceneId === sceneId || action.options?.some((option) => option.targetSceneId === sceneId)));
    if (referenced) return false;
    withHistory(set, (next) => {
      delete next.scenes[sceneId];
      for (const chapter of next.chapters) chapter.scenes = chapter.scenes.filter((id) => id !== sceneId);
    });
    const nextSceneId = Object.keys(get().project.scenes).find((id) => id !== sceneId);
    set({ activeSceneId: nextSceneId, activeActionId: null, activeLayerId: null });
    return true;
  },

  moveScene: (sceneId, direction) => withHistory(set, (project) => {
    const chapter = project.chapters.find((item) => item.scenes.includes(sceneId));
    if (!chapter) return;
    const index = chapter.scenes.indexOf(sceneId);
    const target = direction === "up" ? index - 1 : index + 1;
    if (target >= 0 && target < chapter.scenes.length) [chapter.scenes[index], chapter.scenes[target]] = [chapter.scenes[target], chapter.scenes[index]];
  }),

  addAction: (type) => {
    const sceneId = get().activeSceneId;
    const id = createId("act");
    withHistory(set, (project) => {
      const firstCharacter = project.characters[0];
      const firstVariable = project.variables[0];
      const firstFlag = project.flags[0];
      const firstSceneId = project.chapters?.[0]?.scenes?.[0] ?? sceneId;
      const bases = {
        dialogue: { id, type: "dialogue", speakerId: firstCharacter?.id ?? null, spriteId: null, voiceAssetId: null, text: "Новая реплика" },
        narration: { id, type: "narration", text: "Текст автора" },
        choice: { id, type: "choice", prompt: "Что сделать?", options: [{ id: createId("choice"), text: "Новый вариант", targetSceneId: sceneId, effects: [] }] },
        background: { id, type: "background", title: "Изменить фон", assetId: null, assetName: "Выберите изображение", transition: "dissolve" },
        showCharacter: { id, type: "showCharacter", characterId: firstCharacter?.id ?? null, spriteId: null, position: firstCharacter?.defaultPosition ?? "center", transition: "dissolve" },
        hideCharacter: { id, type: "hideCharacter", characterId: firstCharacter?.id ?? null, transition: "dissolve" },
        changeSprite: { id, type: "changeSprite", characterId: firstCharacter?.id ?? null, spriteId: null, transition: "dissolve" },
        moveCharacter: { id, type: "moveCharacter", characterId: firstCharacter?.id ?? null, position: firstCharacter?.defaultPosition ?? "center", duration: 0.5 },
        characterAnimation: { id, type: "characterAnimation", characterId: firstCharacter?.id ?? null, animation: "shake", duration: 0.5, intensity: 1 },
        music: { id, type: "music", assetId: null, volume: 0.8, fadeIn: 1, loop: true },
        stopMusic: { id, type: "stopMusic", fadeOut: 1 },
        sound: { id, type: "sound", assetId: null, volume: 1 },
        ambience: {id,type:"ambience",assetId:null,volume:1,loop:true},
        voice: { id, type: "voice", assetId: null },
        effect: { id, type: "effect", effect: "flash" },
        variable: { id, type: "variable", variableId: firstVariable?.id ?? null, operation: "add", value: 1 },
        flag: { id, type: "flag", flagId: firstFlag?.id ?? null, value: true },
        event: { id, type: "event", text: "Новое событие", duration: 2.5 },
        condition: { id, type: "condition", variableId: firstVariable?.id ?? null, operator: "gte", value: 1, trueSceneId: firstSceneId, falseSceneId: sceneId },
        jump: { id, type: "jump", targetSceneId: firstSceneId },
        end: { id, type: "end" },
        pause: { id, type: "pause", duration: 1 },
        showCG: { id, type: "showCG", assetId: null, transition: "dissolve", unlockGallery: true },
        hideCG: { id, type: "hideCG", transition: "dissolve" },
      };
      const base = bases[type] ?? bases.dialogue;
      project.scenes[sceneId].actions.push(base);
    });
    set({ activeActionId: id, activeLayerId: null, inspectorTab: "properties", bottomTab: "scenario" });
  },

  removeAction: (sceneId, actionId) => withHistory(set, (project) => {
    project.scenes[sceneId].actions = project.scenes[sceneId].actions.filter((item) => item.id !== actionId || item.timeline?.locked);
  }),

  reorderAction: (sceneId, actionId, target) => withHistory(set, (project) => {
    const actions=project.scenes[sceneId]?.actions;
    const index=actions?.findIndex(a=>a.id===actionId) ?? -1;
    if(index<0)return;
    const [action]=actions.splice(index,1);
    actions.splice(Math.max(0,Math.min(actions.length,target)),0,action);
  }),
  moveAction: (sceneId, actionId, direction) => withHistory(set, (project) => {
    const actions = project.scenes[sceneId].actions;
    const index = actions.findIndex((item) => item.id === actionId);
    const target = direction === "up" ? index - 1 : index + 1;
    if (index >= 0 && target >= 0 && target < actions.length) [actions[index], actions[target]] = [actions[target], actions[index]];
  }),

  pasteAction: (sceneId, source) => {
    const action = structuredClone(source);
    action.id = createId("act");
    if (action.type === "choice") action.options = (action.options ?? []).map((option) => ({ ...option, id: createId("choice"), effects: (option.effects ?? []).map((effect) => ({ ...effect, id: createId("effect") })) }));
    withHistory(set, (project) => project.scenes[sceneId].actions.push(action));
    set({ activeActionId: action.id, activeLayerId: null, bottomTab: "timeline" });
  },

  setSceneBackground: (sceneId, dataUrl, assetName) => withHistory(set, (project) => {
    project.scenes[sceneId].background = dataUrl;
    const bgAction = project.scenes[sceneId].actions.find((item) => item.type === "background");
    if (bgAction) bgAction.assetName = assetName;
  }),

  importProject: (source) => {
    const project = normalizeProject(source);
    if (get().saveState !== "saved") get().saveNow();
    set({
      project,
      ...selectionFor(project),
      past: [],
      future: [],
      saveState: "saved",
    });
    get().saveNow();
  },

  undo: () => set((state) => {
    if (!state.past.length) return state;
    return {
      project: state.past[state.past.length - 1],
      ...(!state.past[state.past.length - 1].scenes[state.activeSceneId] ? selectionFor(state.past[state.past.length - 1]) : {}),
      past: state.past.slice(0, -1),
      future: [state.project, ...state.future],
      saveState: "saving",
    };
  }),

  redo: () => set((state) => {
    if (!state.future.length) return state;
    return {
      project: state.future[0],
      ...(!state.future[0].scenes[state.activeSceneId] ? selectionFor(state.future[0]) : {}),
      past: [...state.past, state.project],
      future: state.future.slice(1),
      saveState: "saving",
    };
  }),

  saveNow: () => {
    try {
      const projects = persistProject(get().project);
      projectStorage.removeItem(DRAFT_KEY);
      set({ saveState: "saved", projects, saveError: null });
      return true;
    } catch (error) {
      set({ saveState: "error", saveError: error.message });
      return false;
    }
  },
}));

let saveTimer;
useProjectStore.subscribe((state, previous) => {
  if (state.project === previous.project) return;
  clearTimeout(saveTimer);
  try { projectStorage.setItem(DRAFT_KEY, JSON.stringify({ savedAt: new Date().toISOString(), project: state.project })); }
  catch { useProjectStore.setState({ saveState: "error" }); return; }
  const seconds = Number(state.project.editor?.autosaveSeconds) || 3;
  saveTimer = setTimeout(() => {
    try {
      const projects = persistProject(useProjectStore.getState().project);
      projectStorage.removeItem(DRAFT_KEY);
      useProjectStore.setState({ saveState: "saved", projects });
    } catch {
      useProjectStore.setState({ saveState: "error" });
    }
  }, Math.max(500, seconds * 1000));
});

globalThis.window?.addEventListener("beforeunload", () => {
  const state = useProjectStore.getState();
  if (state.saveState !== "saved") state.saveNow();
});
