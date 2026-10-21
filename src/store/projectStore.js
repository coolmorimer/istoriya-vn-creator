import { assertProjectShape } from "../../runtime/project-format.mjs";
import { ASSET_FIELDS } from '../../runtime/asset-fields.mjs';
import { create } from "zustand";
import { defaultProject, createId } from "../data/defaultProject.js";
import { createProject } from "../domain/projectFactory.js";
import { connectScenes, updateExit, removeExit, renumberScenes } from "../domain/storyGraph.js";
import { materializeTimeline, timelineClips, roundTime, canSplitClip } from '../../runtime/timeline-model.mjs';
import {sequentialActions} from '../domain/storyboard.js';
import {editProject,replayProject,cloneDraft,HISTORY_LIMIT} from '../domain/projectHistory.js';
import {authorCharacterForScene} from '../domain/characterAuthoring.js';
import {authorBackground} from '../domain/backgroundAuthoring.js';
import {authorProp,addPropReaction,changePropReaction} from '../domain/propAuthoring.js';
import {authorPropReaction} from '../domain/reactionAuthoring.js';
import {authorChoiceBranch} from '../domain/branchAuthoring.js';
import {authorAudioAttachment} from '../domain/audioAuthoring.js';
import {logicReferences} from '../../runtime/logic-references.mjs';
import {authorUi} from '../domain/uiAuthoring.js';
import {authorFont} from '../domain/fontAuthoring.js';
import {authorMediaRepairs,authorMediaImports} from '../domain/mediaRepair.js';
import {clearUiResource} from '../../runtime/game-ui.mjs';
import {editorNavigation} from '../domain/editorNavigation.js';
import {MOTION_FIELDS,motionDuration} from '../../runtime/keyframes.mjs';
import {defaultRpg} from '../../runtime/rpg-model.mjs';

const STORAGE_KEY = "istoriya-project-v2";
const LIBRARY_KEY = "istoriya-project-library-v1";
const DRAFT_KEY = "istoriya-project-recovery-v1";
const CURRENT_SCHEMA = 8;
let saveQueue=Promise.resolve();
let startupWarning = null;
let startupRecovery = null;
const projectStorage = globalThis.window?.istoriya?.storage ?? globalThis.localStorage;
// Keep existing browser-backed desktop projects when upgrading to disk storage.
if (globalThis.window?.istoriya?.storage && window.istoriya.native!=='browser' && globalThis.localStorage) {
  try {
  for (const key of [STORAGE_KEY, LIBRARY_KEY, DRAFT_KEY]) {
    if (!projectStorage.getItem(key)) {
      const previous = localStorage.getItem(key);
      if (previous) projectStorage.setItem(key, previous);
    }
  }
  } catch (error) { startupWarning = error.message; }
}

export function normalizeProject(source) {
  assertProjectShape(source);
  if (!source || typeof source !== "object" || !source.scenes || typeof source.scenes !== "object") {
    throw new Error("Файл не похож на проект «История».");
  }
  const project = structuredClone(source);
  // Old browser projects used root-relative URLs, which point outside the app in file:// builds.
  const migrateAssets = (value) => {
    for (const [key, child] of Object.entries(value)) {
      if (ASSET_FIELDS.has(key) && typeof child === "string" && child.startsWith("/assets/")) value[key] = `.${child}`;
      else if (child && typeof child === "object") migrateAssets(child);
    }
  };
  migrateAssets(project);
  project.schemaVersion = CURRENT_SCHEMA;
  project.items??=[];
  project.rpg??=defaultRpg();
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
  let stored;
  try {
    const raw = projectStorage.getItem(STORAGE_KEY);
    stored = normalizeProject(raw ? JSON.parse(raw) : createProject());
  } catch (error) { startupWarning = error.message;stored=normalizeProject(createProject()); }
  try {
    const recoveryRaw = projectStorage.getItem(DRAFT_KEY);
    if (recoveryRaw) {
      // Reading does not choose, delete or acknowledge either version. In
      // particular, opening the hub must not replace a recovered active draft.
      try {
        const recovery=JSON.parse(recoveryRaw);
        if(!Number.isFinite(Date.parse(recovery.savedAt)))throw Error('Не удалось прочитать дату черновика.');
        const project=normalizeProject(recovery.project),library=loadLibrary();
        const saved=stored.id===project.id?stored:library.find(p=>p.id===project.id)??null;
        startupRecovery={raw:recoveryRaw,project,saved,savedAt:recovery.savedAt,selection:recovery.selection??null,busy:false,error:null};
      } catch(error) {startupRecovery={raw:recoveryRaw,project:null,saved:stored,savedAt:null,busy:false,error:`Черновик не удалось открыть: ${error.message}`};}
    }
  } catch(error) {startupWarning=error.message;}
  return stored;
}

function loadLibrary(strict = false) {
  try {
    const raw = projectStorage.getItem(LIBRARY_KEY);
    if (raw) {
      const library = JSON.parse(raw);
      if (!Array.isArray(library)) throw new Error("Библиотека проектов повреждена. Сохранение остановлено, чтобы не потерять проекты.");
      return library.map(normalizeProject);
    }
  } catch (error) {
    startupWarning = error.message;
    if (strict) throw new Error("Не удалось прочитать библиотеку: " + error.message);
  }
  return [];
}

async function persistProject(project) {
  // Read before any writes. A corrupt library must never become an empty one.
  const library = loadLibrary(true).filter((item) => item.id !== project.id);
  const previous = projectStorage?.getItem(STORAGE_KEY);
  if (previous) normalizeProject(JSON.parse(previous));
  const saved = structuredClone(project);
  saved.meta.modifiedAt = new Date().toISOString();
  projectStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  const nextLibrary = [saved, ...library];
  projectStorage.setItem(LIBRARY_KEY, JSON.stringify(nextLibrary));
  await projectStorage.flush?.();
  return nextLibrary;
}

function withHistory(set, recipe, selectAfter) {
  set((state) => {
    if(state.recovery)return state;
    const edit = editProject(state.project,recipe);
    if (!edit) return state;
    const view=selectAfter?.(edit.project);
    if(view){edit.entry.beforeSelection=Object.fromEntries(Object.keys(view).map(key=>[key,state[key]]));edit.entry.afterSelection=view;}
    return {
      project: edit.project,
      past: [...state.past.slice(-(HISTORY_LIMIT-1)), edit.entry],
      future: [],
      saveState: "saving",
      ...view,
    };
  });
}

function selectionFor(project) {
  const activeSceneId = project.chapters.flatMap((chapter) => chapter.scenes).find((id) => project.scenes[id]) ?? Object.keys(project.scenes)[0];
  const activeActionId=project.scenes[activeSceneId].timelineEnabled?null:project.scenes[activeSceneId].actions[0]?.id??null;
  return { activeSceneId, activeActionId, activeLayerId: null, selectedCharacterId: project.characters[0]?.id ?? null, selectedResourceId: project.resources[0]?.id ?? null, activeSection: "scenes", inspectorTab: "properties", bottomTab: "scenario",timelineTime:0,navigationTarget:null,uiScreen:'menu',uiElement:'button:start' };
}
function selectionAfterHistory(state,project) {
 const scene=project.scenes[state.activeSceneId];
 if(!scene)return selectionFor(project);
 const activeLayerId=state.activeLayerId==='__background'||[...(scene.characters??[]),...(scene.images??[]),...scene.actions].some(item=>item.id===state.activeLayerId)?state.activeLayerId:null;
 return {
  activeActionId:scene.actions.some(a=>a.id===state.activeActionId)?state.activeActionId:(!scene.timelineEnabled&&!activeLayerId?scene.actions[0]?.id??null:null),
  activeLayerId,
  selectedCharacterId:project.characters.some(c=>c.id===state.selectedCharacterId)?state.selectedCharacterId:project.characters[0]?.id??null,
  selectedResourceId:project.resources.some(r=>r.id===state.selectedResourceId)?state.selectedResourceId:project.resources[0]?.id??null,
 };
}
const initialProject = loadProject();
export const useProjectStore = create((set, get) => ({
  project: initialProject,
  recovery: startupRecovery,
  projects: loadLibrary(),
  activeSection: "scenes",
  navigationRequest:0,
  navigationTarget:null,
  navigateTo: location=>{if(get().recovery)throw Error('Сначала выберите сохранённую версию проекта.');const plan=editorNavigation(get().project,location);set({...plan,navigationRequest:get().navigationRequest+1});return plan;},
  ...selectionFor(initialProject),
  inspectorTab: "properties",
  logicTab: 'map',
  selectedInventoryId: null,
  setLogicTab: logicTab => set({logicTab}),
  setSelectedInventory: selectedInventoryId => set({selectedInventoryId}),
  bottomTab: "scenario",
  timelineTime: 0,
  setTimelineTime: (timelineTime) => set({timelineTime:Math.max(0,timelineTime)}),
  editClip: (sceneId,actionId,patch) => withHistory(set,project=>{
    const scene=project.scenes[sceneId];materializeTimeline(scene);
    const action=scene.actions.find(a=>a.id===actionId);if(!action)return;
    if(action.type==='keyframes'&&patch.duration!=null){const duration=Math.max(.1,Math.min(600,Number(patch.duration)||.1)),ratio=duration/motionDuration(action);for(const f of action.keyframes)f.time=Number((f.time*ratio).toFixed(6));patch={...patch,duration};}
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
    const copy=cloneDraft(action);copy.id=createId('act');copy.timeline.start=roundTime(time);copy.timeline.duration=roundTime(t.start+t.duration-time);t.duration=roundTime(time-t.start);
    if(['dialogue','narration'].includes(action.type))t.waitForClick=false;
    if(copy.options)copy.options=copy.options.map(o=>({...o,id:createId('choice')}));
    scene.actions.push(copy);scene.actions.sort((a,b)=>a.timeline.start-b.timeline.start);
  }),
  setTimelineTrack: (sceneId,track,key,value) => withHistory(set,project=>{
    const scene=project.scenes[sceneId];materializeTimeline(scene);
    for(const clip of timelineClips(scene))if(clip.track===track)clip.action.timeline[key]=value;
  }),
  saveState: startupWarning ? "error" : "saved",
  saveError: startupWarning,
  past: [],
  future: [],

  resolveRecovery: decision => {
    if(!['restore','saved'].includes(decision))return Promise.reject(Error('Выберите версию проекта.'));
    const recovery=get().recovery;if(!recovery||recovery.busy)return Promise.resolve(false);
    if(decision==='restore'&&!recovery.project)return Promise.resolve(false);
    clearTimeout(saveTimer);clearTimeout(draftTimer);set({recovery:{...recovery,busy:true,error:null}});
    const resolve=async()=>{
      let previous=null;
      try{
        if(projectStorage.getItem(DRAFT_KEY)!==recovery.raw)throw Error('Черновик изменён после открытия. Закройте редактор и откройте его снова; копии не удалены.');
        const library=loadLibrary(true),currentRaw=projectStorage.getItem(STORAGE_KEY);
        if(currentRaw)normalizeProject(JSON.parse(currentRaw));
        const chosen=normalizeProject(decision==='restore'?recovery.project:recovery.saved??get().project);
        if(decision==='restore')chosen.meta.modifiedAt=new Date().toISOString();
        // Preserve the previous active project even if it was absent from an old
        // library. A draft belonging to another project never merges their scenes.
        const others=library.filter(p=>p.id!==chosen.id),active=get().project;
        if(active.id!==chosen.id&&!others.some(p=>p.id===active.id))others.push(active);
        const projects=[chosen,...others];
        previous=Object.fromEntries([STORAGE_KEY,LIBRARY_KEY,DRAFT_KEY].map(key=>[key,projectStorage.getItem(key)]));
        projectStorage.setItem(STORAGE_KEY,JSON.stringify(chosen));
        projectStorage.setItem(LIBRARY_KEY,JSON.stringify(projects));
        projectStorage.removeItem(DRAFT_KEY);
        await projectStorage.flush?.();
        const selection=selectionFor(chosen);
        if(decision==='restore'&&chosen.scenes[recovery.selection?.activeSceneId]){
          Object.assign(selection,{activeSceneId:recovery.selection.activeSceneId,activeActionId:typeof recovery.selection.activeActionId==='string'?recovery.selection.activeActionId:null,activeLayerId:typeof recovery.selection.activeLayerId==='string'?recovery.selection.activeLayerId:null});
          Object.assign(selection,selectionAfterHistory(selection,chosen));
        }
        set({project:chosen,projects,recovery:null,...selection,past:[],future:[],saveState:'saved',saveError:null});
        return true;
      }catch(error){
        // Native/IndexedDB commits are atomic; restore the renderer staging cache
        // too so a failed restore followed by discard cannot publish the draft.
        if(previous)for(const [key,value]of Object.entries(previous)){try{if(value==null)projectStorage.removeItem(key);else projectStorage.setItem(key,value);}catch{/* Keep the original error and the in-memory recovery copy. */}}
        set({recovery:{...recovery,busy:false,error:error.message},saveState:'error',saveError:error.message});return false;
      }
    };
    saveQueue=saveQueue.catch(()=>{}).then(resolve);return saveQueue;
  },
  waitForPendingWrites: () => saveQueue,

  setActiveSection: (activeSection) => set({ activeSection }),
  setActiveScene: (activeSceneId) => set((state) => {const scene=state.project.scenes[activeSceneId],activeActionId=scene?.timelineEnabled?null:scene?.actions[0]?.id??null;return {activeSceneId,activeActionId,timelineTime:state.activeSceneId===activeSceneId?state.timelineTime:0,activeLayerId:activeActionId?null:scene?.characters?.[0]?.id??null,activeSection:'scenes'};}),
  motionTime:null,
  setMotionTime:motionTime=>set({motionTime}),
  setActiveAction: (activeActionId) => set({ activeActionId, activeLayerId: null, motionTime:null,inspectorTab: "properties" }),
  setActiveLayer: (activeLayerId) => set({ activeLayerId, inspectorTab: "properties" }),
  selectVisualLayer: (activeLayerId) => set({ activeLayerId, inspectorTab: "properties" }),
  setSelectedCharacter: (selectedCharacterId) => set({ selectedCharacterId }),
  setSelectedResource: (selectedResourceId) => set({ selectedResourceId }),
  setInspectorTab: (inspectorTab) => set({ inspectorTab }),
  setBottomTab: (bottomTab) => set({ bottomTab }),
  setUiScreen: uiScreen => set({uiScreen}),
  setUiElement: uiElement => set({uiElement}),

  newProject: async (configuration = "empty") => {
    if(get().recovery)throw Error('Сначала выберите, восстанавливать ли черновик.');
    if (get().saveState !== "saved" && !await get().saveNow()) throw new Error(get().saveError || "Не удалось сохранить текущий проект. Переход отменён.");
    const project = normalizeProject(createProject(configuration));
    set({ project, ...selectionFor(project), past: [], future: [], saveState: "saving" });
    if (!await get().saveNow()) throw new Error(get().saveError || "Проект создан в памяти, но не сохранён. Экспортируйте его в файл.");
    return project;
  },

  openProject: async (projectId) => {
    if(get().recovery)throw Error('Сначала выберите, восстанавливать ли черновик.');
    if (get().saveState !== "saved" && !await get().saveNow()) throw new Error(get().saveError || "Не удалось сохранить текущий проект. Переход отменён.");
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
    if (action) { const values={...patch};if(action.type==='keyframes'&&!values.keyframes){for(const k of MOTION_FIELDS)if(values[k]!=null){action.keyframes.at(-1)[k]=values[k];delete values[k];}}Object.assign(action, values); if(action.timeline && patch.duration != null) action.timeline.duration=Math.max(.1,Number(patch.duration)||.1); }
  }),

  addResource: (resource) => {
    const id=resource.id??createId('res');
    withHistory(set, project=>{project.resources.push({id,importedAt:new Date().toISOString(),...resource});});
    return id;
  },

  updateResource: (resourceId, patch) => withHistory(set, (project) => {
    const resource = project.resources.find((item) => item.id === resourceId);
    if (resource) Object.assign(resource, patch);
  }),

  repairMedia: request => {let repaired=0;withHistory(set,project=>{repaired=authorMediaRepairs(project,request);});return repaired;},
  importMedia: request => {let result;const ids=request.resources.map(()=>createId('resource'));withHistory(set,project=>{result=authorMediaImports(project,request,ids);},()=>({selectedResourceId:result[0]??null}));return result;},

  removeResource: (resourceId) => withHistory(set, (project) => {
    clearUiResource(project,resourceId);
    const resource = project.resources.find((item) => item.id === resourceId);
    project.resources = project.resources.filter((item) => item.id !== resourceId);
    for (const scene of Object.values(project.scenes)) {
      if (scene.backgroundResourceId === resourceId || scene.background === resource?.source) { scene.backgroundResourceId = null; scene.background = null; }
      for (const action of scene.actions) {
        if (action.assetId === resourceId) action.assetId = null;
        if (action.voiceAssetId === resourceId) action.voiceAssetId = null;
        if (action.soundAssetId === resourceId) action.soundAssetId = null;
      }
      for(const layer of scene.images??[])for(const reaction of layer.interactions??[])for(const key of ['voiceAssetId','soundAssetId','resultResourceId'])if(reaction[key]===resourceId)reaction[key]=null;
    }
    for(const item of project.items??[])if(item.iconResourceId===resourceId)item.iconResourceId=null;
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

  createCharacterOnScene: input => {
    const ids=Object.fromEntries(['character','resource','sprite','layer','action'].map(kind=>[`${kind}Id`,createId(kind)]));
    let created;
    withHistory(set,project=>{created=authorCharacterForScene(project,input,ids);},()=>({selectedCharacterId:created.characterId,activeSceneId:input.sceneId,activeActionId:created.actionId,activeLayerId:created.layerId,inspectorTab:'properties',activeSection:'scenes',...(created.placement==='timeline'?{bottomTab:'timeline',timelineTime:Math.max(0,Number(input.time)||0)}:{})}));
    return created;
  },

  updateCharacter: (characterId, patch) => withHistory(set, (project) => {
    const character = project.characters.find((item) => item.id === characterId);
    if (character) Object.assign(character, patch);
  }),

  removeCharacter: (characterId) => {
    const state = get();
    if(state.project.rpg?.actors?.some(a=>a.characterId===characterId))return false;
    if (state.project.characters.length < 1) return false;
    const used = Object.values(state.project.scenes).some((scene) => scene.characters?.some((layer) => layer.characterId === characterId) || scene.actions?.some((action) => action.speakerId === characterId || action.characterId === characterId));
    if (used || Object.values(state.project.scenes).some(scene=>(scene.images??[]).some(layer=>layer.interactions?.some(r=>r.speakerId===characterId)))) return false;
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

  addPropReaction: (sceneId,layerId) => {
    const id=createId('reaction');withHistory(set,project=>addPropReaction(project,sceneId,layerId,id));return id;
  },
  createPropReaction: input => {
    let result;
    const ids={reactionId:createId('reaction'),itemId:createId('item'),soundResourceId:createId('resource'),voiceResourceId:createId('resource'),actionId:createId('act')};
    withHistory(set,project=>{result=authorPropReaction(project,input,ids);},state=>({activeSceneId:input.sceneId,activeLayerId:input.layerId,activeActionId:result.actionId??get().activeActionId,inspectorTab:'properties',activeSection:'scenes'}));
    return result;
  },
  updatePropReaction: (sceneId,layerId,reactionId,patch) => withHistory(set,project=>changePropReaction(project,sceneId,layerId,reactionId,patch,createId('item'))),
  removePropReaction: (sceneId,layerId,reactionId) => withHistory(set,project=>{const layer=project.scenes[sceneId]?.images?.find(l=>l.id===layerId);if(layer)layer.interactions=(layer.interactions??[]).filter(r=>r.id!==reactionId);}),
  updateItem: (itemId,patch) => withHistory(set,project=>{const item=project.items?.find(i=>i.id===itemId);if(item)Object.assign(item,patch);}),
  updateRpg: patch => withHistory(set,project=>{project.rpg??=defaultRpg();Object.assign(project.rpg,patch);}),
  editRpg: recipe => withHistory(set,project=>{project.rpg??=defaultRpg();recipe(project.rpg,project);}),
  addItem: () => {const id=createId('item');withHistory(set,project=>{project.items??=[];project.items.push({id,name:'Новый предмет',description:'',iconResourceId:null});},()=>({selectedInventoryId:id}));return id;},
  removeItem: itemId => {if(logicReferences(get().project,'item',itemId).length)return false;withHistory(set,project=>{project.items=(project.items??[]).filter(i=>i.id!==itemId);},project=>({selectedInventoryId:project.items[0]?.id??null}));return true;},
  attachAudio: request => {let id;withHistory(set,project=>{id=authorAudioAttachment(project,request,createId('resource'));});return id;},
  editUi: request => withHistory(set,project=>authorUi(project,request,createId('resource'))),
  attachFont: request => {let id;withHistory(set,project=>{id=authorFont(project,request,createId('font'));});return id;},

  createSceneProp: input => {
    let result;
    const ids={layerId:createId('image'),resourceId:createId('resource'),soundResourceId:createId('resource'),voiceResourceId:createId('resource'),reactionId:createId('reaction'),itemId:createId('item'),actionId:createId('act')};
    withHistory(set,project=>{result=authorProp(project,input,ids);},()=>({activeSceneId:input.sceneId,activeLayerId:result.layerId,activeActionId:result.actionId,selectedResourceId:result.resourceId,inspectorTab:'properties',activeSection:'scenes'}));
    return result;
  },
  addSceneImage: (sceneId,resourceId) => {
    const id=createId('image');
    withHistory(set,project=>{const scene=project.scenes[sceneId],resource=project.resources.find(r=>r.id===resourceId);if(!scene||!resource)return;scene.images??=[];scene.images.push({id,resourceId,name:resource.name,x:50,y:100,width:60,height:45,scale:100,rotation:0,opacity:100,visible:true,locked:false,zOrder:50+scene.images.length});});
    set({activeLayerId:id,inspectorTab:'properties'});return id;
  },
  updateSceneImage: (sceneId,layerId,patch)=>withHistory(set,project=>{const layer=project.scenes[sceneId]?.images?.find(item=>item.id===layerId);if(layer)Object.assign(layer,patch);}),
  removeSceneImage: (sceneId,layerId)=>{withHistory(set,project=>{const scene=project.scenes[sceneId];if(scene)scene.images=(scene.images??[]).filter(item=>item.id!==layerId);});set({activeLayerId:null});},

  layerToTimeline: (sceneId, layerId) => {
    const state=get(),scene=state.project.scenes[sceneId],layer=scene?.characters.find(l=>l.id===layerId);
    if (!layer || layer.locked) return false;
    const id=createId('act');
    const start=Math.max(state.timelineTime,0,...timelineClips(scene).filter(c=>c.enabled&&c.action.type==='showCharacter'&&c.action.characterId===layer.characterId).map(c=>c.end));
    withHistory(set,project=>{
      const target=project.scenes[sceneId];materializeTimeline(target);
      const {id:oldId,name,visible,locked,...transform}=layer;
      target.actions.push({...transform,id,type:'showCharacter',transition:'none',timeline:{start,duration:5,enabled:visible!==false}});
      target.characters=target.characters.filter(l=>l.id!==layerId);
    });
    set({activeActionId:id,activeLayerId:null,bottomTab:'timeline',timelineTime:start});
    return true;
  },

  removeSceneCharacter: (sceneId, layerId) => withHistory(set, (project) => {
    project.scenes[sceneId].characters = (project.scenes[sceneId].characters ?? []).filter((item) => item.id !== layerId || item.locked);
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
    if(logicReferences(get().project,'variable',variableId).length)return false;
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
    if(logicReferences(get().project,'flag',flagId).length)return false;
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
  createChoiceBranch: request => {
    const id=createId('scene');
    withHistory(set,project=>authorChoiceBranch(project,request,id));
    return id;
  },
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
    if(project.rpg?.locations?.some(l=>l.sceneId===sceneId)||project.rpg?.actors?.some(a=>['talkSceneId','winSceneId','loseSceneId'].some(k=>a[k]===sceneId)))return false;
    if (Object.keys(project.scenes).length < 2) return false;
    const referenced = Object.values(project.scenes).some((scene) => scene.actions?.some((action) => action.targetSceneId === sceneId || action.trueSceneId === sceneId || action.falseSceneId === sceneId || action.options?.some((option) => option.targetSceneId === sceneId)));
    if (referenced || Object.values(project.scenes).some(scene=>(scene.images??[]).some(layer=>layer.interactions?.some(r=>r.targetSceneId===sceneId)))) return false;
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

  convertSceneToStoryboard: (sceneId) => withHistory(set, project=>{
    const scene=project.scenes[sceneId];if(!scene?.timelineEnabled)return;
    scene.savedTimeline={actions:cloneDraft(scene.actions),convertedAt:new Date().toISOString()};
    scene.actions=sequentialActions(cloneDraft(scene));scene.timelineEnabled=false;
  }),
  addAction: (type, {afterId, values} = {}) => {
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
        choice: { id, type: "choice", prompt: "Что сделать?", options: [1,2].map(n=>({id:createId('choice'),text:`Вариант ${n}`,targetSceneId:null,effects:[]})) },
        explore: {id,type:'explore',prompt:'Осмотрите сцену',requiredItemId:null,requiredFlagId:null},
        rpg: {id,type:'rpg',operation:'menu',statId:'health',statOperation:'add',value:10,actorId:''},
        background: { id, type: "background", title: "Изменить фон", assetId: null, assetName: "Выберите изображение", transition: "dissolve" },
        showCharacter: { id, type: "showCharacter", characterId: firstCharacter?.id ?? null, spriteId: null, position: firstCharacter?.defaultPosition ?? "center", transition: "dissolve" },
        hideCharacter: { id, type: "hideCharacter", characterId: firstCharacter?.id ?? null, transition: "dissolve" },
        changeSprite: { id, type: "changeSprite", characterId: firstCharacter?.id ?? null, spriteId: null, transition: "dissolve" },
        moveCharacter: { id, type: "moveCharacter", characterId: firstCharacter?.id ?? null, position: firstCharacter?.defaultPosition ?? "center", duration: 0.5 },
        characterAnimation: { id, type: "characterAnimation", characterId: firstCharacter?.id ?? null, animation: "shake", duration: 0.5, intensity: 1 },
        keyframes:{id,type:'keyframes',target:{kind:'camera'},keyframes:[{id:createId('key'),time:0,x:50,y:50,scale:100,rotation:0,opacity:100,easing:'linear'},{id:createId('key'),time:2,x:50,y:50,scale:100,rotation:0,opacity:100,easing:'smooth'}]},
        music: { id, type: "music", assetId: null, volume: 0.8, fadeIn: 1, loop: true },
        stopMusic: { id, type: "stopMusic", fadeOut: 1 },
        stopAudio: {id,type:'stopAudio',channel:'sound',fadeOut:0},
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
      if(values)Object.assign(base,values,{id,type});
      const scene=project.scenes[sceneId];
      const index=scene.actions.findIndex(a=>a.id===afterId);
      if(index>=0&&!scene.timelineEnabled)scene.actions.splice(index+1,0,base);else scene.actions.push(base);
    });
    set({ activeActionId: id, activeLayerId: null, motionTime:null,inspectorTab: "properties" });
    return id;
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

  pasteAction: (sceneId, source, {afterId} = {}) => {
    const action = structuredClone(source);
    action.id = createId("act");
    if (action.type === "choice") action.options = (action.options ?? []).map((option) => ({ ...option, id: createId("choice"), effects: (option.effects ?? []).map((effect) => ({ ...effect, id: createId("effect") })) }));
    withHistory(set, (project) => {const scene=project.scenes[sceneId],index=scene.actions.findIndex(a=>a.id===(afterId??get().activeActionId));if(index>=0&&!scene.timelineEnabled)scene.actions.splice(index+1,0,action);else scene.actions.push(action);});
    set({ activeActionId: action.id, activeLayerId: null });
  },

  setSceneBackground: (sceneId, dataUrl, assetName) => withHistory(set, (project) => {
    project.scenes[sceneId].background = dataUrl;
    project.scenes[sceneId].backgroundResourceId=null;
  }),
  applyBackground: input => {
    let result;const ids={resourceId:createId('resource'),actionId:createId('act')};
    withHistory(set,project=>{result=authorBackground(project,input,ids);},()=>({activeSceneId:input.sceneId,activeActionId:result.actionId,activeLayerId:'__background',inspectorTab:'properties',activeSection:'scenes',...(input.timed?{bottomTab:'timeline',timelineTime:input.time}:{})}));
    return result;
  },

  importProject: async (source) => {
    if(get().recovery)throw Error('Сначала выберите, восстанавливать ли черновик.');
    const project = normalizeProject(source);
    if (get().saveState !== "saved" && !await get().saveNow()) throw new Error(get().saveError || "Не удалось сохранить текущий проект. Переход отменён.");
    set({
      project,
      ...selectionFor(project),
      past: [],
      future: [],
      saveState: "saved",
    });
    if (!await get().saveNow()) throw new Error(get().saveError || "Не удалось сохранить импортированный проект.");
    return true;
  },

  undo: () => set((state) => {
    if(state.recovery)return state;
    if (!state.past.length) return state;
    const entry=state.past.at(-1),project=replayProject(state.project,entry,'undo');
    return {
      project,
      ...entry.beforeSelection,
      ...selectionAfterHistory({...state,...entry.beforeSelection},project),
      past: state.past.slice(0, -1),
      future: [entry, ...state.future],
      saveState: "saving",
    };
  }),

  redo: () => set((state) => {
    if(state.recovery)return state;
    if (!state.future.length) return state;
    const entry=state.future[0],project=replayProject(state.project,entry,'redo');
    return {
      project,
      ...entry.afterSelection,
      ...selectionAfterHistory({...state,...entry.afterSelection},project),
      past: [...state.past, entry],
      future: state.future.slice(1),
      saveState: "saving",
    };
  }),

  saveNow: () => {
    if(get().recovery)return Promise.resolve(false);
    clearTimeout(saveTimer);
    clearTimeout(draftTimer);
    const save=async()=>{
    try {
      let snapshot,projects;
      do {
        snapshot=get().project;
        projects=await persistProject(snapshot);
      } while(get().project!==snapshot);
      projectStorage.removeItem(DRAFT_KEY);
      await projectStorage.flush?.();
      set({ saveState: get().project === snapshot ? "saved" : "saving", projects, saveError: null });
      if(get().project!==snapshot)return save();
      return true;
    } catch (error) {
      set({ saveState: "error", saveError: error.message });
      return false;
    }
    };
    saveQueue=saveQueue.catch(()=>{}).then(save);
    return saveQueue;
  },
}));

let saveTimer,draftTimer;
useProjectStore.subscribe((state, previous) => {
  if (state.project === previous.project) return;
  clearTimeout(saveTimer);
  clearTimeout(draftTimer);
  if(state.recovery||state.saveState==='saved')return;
  // Coalesce a typing burst, then durably checkpoint the latest document. Queue
  // with explicit saves so an old checkpoint cannot resurrect a removed draft.
  draftTimer=setTimeout(()=>{
    const checkpoint=async()=>{
      const current=useProjectStore.getState();
      if(current.saveState==='saved')return;
      try {
        if(current.recovery)return;
        projectStorage.setItem(DRAFT_KEY,JSON.stringify({savedAt:new Date().toISOString(),project:current.project,selection:{activeSceneId:current.activeSceneId,activeActionId:current.activeActionId,activeLayerId:current.activeLayerId}}));
        await projectStorage.flush?.();
      } catch(error) {useProjectStore.setState({saveState:'error',saveError:error.message});}
    };
    saveQueue=saveQueue.catch(()=>{}).then(checkpoint);
  },250);
  const seconds = Number(state.project.editor?.autosaveSeconds) || 3;
  saveTimer = setTimeout(() => { void useProjectStore.getState().saveNow(); }, Math.max(500, seconds * 1000));
});

globalThis.window?.addEventListener("beforeunload", (event) => {
  const state = useProjectStore.getState();
  if(state.recovery)return;
  if (state.saveState !== "saved") { void state.saveNow(); event.preventDefault(); event.returnValue = ""; }
});
