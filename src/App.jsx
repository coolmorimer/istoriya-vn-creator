import { RecoveryBackupButton } from "./components/RecoveryBoundary.jsx";
import {StartupRecovery} from './components/StartupRecovery.jsx';
import {DiagnosticsButton} from './components/Diagnostics.jsx';
import {ProfileStorageButton} from './components/ProfileStorage.jsx';
import { canvasTransform } from "./domain/canvasTransform.js";
import {canvasLayerBounds} from './domain/canvasViewport.js';
import {useCanvasViewport} from './components/useCanvasViewport.js';
import {CanvasViewControls} from './components/CanvasViewControls.jsx';
import { resolveCharacterSprite } from "../runtime/character-sprites.mjs";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AndroidLogo, AppleLogo, ArrowClockwise, ArrowCounterClockwise, ArrowDown, ArrowUp, ArrowsOut, BookOpenText, CaretDown,
  CaretRight, Check, CheckCircle, ClockCountdown, CursorClick, Desktop,
  DownloadSimple, Eye, FilmSlate, FloppyDisk, FolderOpen, FolderSimple, GearSix,
  GitBranch, GlobeHemisphereWest, House, ImageSquare, LinuxLogo, ListDashes, MagnifyingGlass, MapTrifold, Minus,
  Monitor, MusicNotes, Package, Palette, Play, Plus, SpeakerHigh, TextT, Trash,
  UploadSimple, User, Users, WarningCircle, Waveform, X,
} from "@phosphor-icons/react";
import { useProjectStore } from "./store/projectStore";
import { validateProject } from "./domain/validator";
import { advancePreview,conditionPass } from "./domain/preview.js";
import {propKey,availableReactions,explorationReady} from '../runtime/interactions.mjs';
import {PropPicker} from './components/PropPicker.jsx';
import {AudioResourceField,ActionAudioFields} from './components/AudioResourceField.jsx';
import {ResourceLibrary} from './components/ResourceLibrary.jsx';
import {AUDIO_BLOCKED,AUDIO_UNREADABLE} from './domain/audioPlayback.js';
import {createPreviewAudio} from './domain/previewAudio.js';
import {ExplorationFields} from './components/PropInteractionFields.jsx';
import {StoryDestinationField} from './components/StoryDestinationField.jsx';
import {ProjectSearch} from './components/ProjectSearch.jsx';
import {EditorNavigationFocus} from './components/EditorNavigationFocus.jsx';
import {ProjectSceneTree} from './components/ProjectSceneTree.jsx';
import {destinationValue,destinationPatch} from './domain/storyDestinations.js';
import {ConditionEditor,EffectsEditor,VariableActionFields} from './components/RuleFields.jsx';
import {InventoryWorkspace} from './components/InventoryWorkspace.jsx';
import {ChoiceFields} from './components/ChoiceFields.jsx';
import {PreviewGameplay} from './components/PreviewGameplay.jsx';
import {opaquePropHit} from './domain/propHitTest.js';
import {PreviewActor} from './components/PreviewActor.jsx';
import {BackgroundPicker} from './components/BackgroundPicker.jsx';
import {BackgroundActionFields} from './components/BackgroundActionFields.jsx';
import { ActionPicker } from "./components/ActionPicker.jsx";
import { TextAppearance, StyledText, ProjectFonts,textAppearance } from "./components/TextAppearance.jsx";
import {usePreviewSession} from './components/usePreviewSession.js';
import {PreviewSystemPanel} from './components/PreviewSystemPanel.jsx';
import {previewLineSeen} from './domain/previewSession.js';
import { EditorContextMenu, CharacterPicker, sceneMenuItems } from "./components/EditorContextMenu.jsx";
import { timelineFrame } from "./domain/timeline.js";
import { EditorWorkspace } from "./components/EditorWorkspace.jsx";
import { TimelineEditor } from "./components/TimelineEditor.jsx";
import { StoryMap } from "./components/StoryMap.jsx";
import {GameUiWorkspace} from './components/GameUiWorkspace.jsx';
import {GameDialogue,GameChoices,GameQuick} from './components/GameUiView.jsx';
import { StoryboardEditor } from './components/StoryboardEditor.jsx';
import { storyboardFrames } from './domain/storyboard.js';
import { WorkspaceLayout } from './components/WorkspaceLayout.jsx';
import { VisualLayers } from './components/VisualLayers.jsx';
import { visualLayerEdits } from './domain/visualLayers.js';
import { backgroundTransform, backgroundStyle, backgroundSource } from '../runtime/background-transform.mjs';
import { BackgroundFields } from './components/BackgroundFields.jsx';
import {ImageLayerFields} from './components/ImageLayerFields.jsx';
import {sceneImages,imageLayerStyle} from '../runtime/image-layers.mjs';
import {sceneCharacterLayers,scenePaintOrder} from '../runtime/visual-order.mjs';

const navItems = [
  { id: "project", label: "Проект", icon: House },
  { id: "scenes", label: "Сцены", icon: FilmSlate },
  { id: "characters", label: "Персонажи", icon: Users },
  { id: "backgrounds", label: "Фоны", icon: ImageSquare },
  { id: "music", label: "Музыка", icon: MusicNotes },
  { id: "sounds", label: "Звуки", icon: Waveform },
  { id: "resources", label: "Ресурсы", icon: FolderSimple },
];

const resourceCategories = [
  ["all", "Все"], ["background", "Фоны"], ["sprite", "Спрайты"], ["prop", "Предметы"], ["cg", "Иллюстрации"],
  ["music", "Музыка"], ["sound", "Звуки"], ["voice", "Озвучка"], ["ui", "Интерфейс"],
  ["video", "Видео"], ["font", "Шрифты"], ["icon", "Иконки"],
];

const actionTypes = [
  ["dialogue", "Диалог"], ["narration", "Текст автора"], ["choice", "Выбор игрока"],
  ['explore','Осмотреть сцену'],
  ["showCharacter", "Показать персонажа"], ["hideCharacter", "Скрыть персонажа"], ["changeSprite", "Изменить спрайт"], ["moveCharacter", "Переместить персонажа"], ["characterAnimation", "Анимация персонажа"], ["background", "Изменить фон"], ["showCG", "Показать CG"], ["hideCG", "Скрыть CG"],
  ["music", "Запустить музыку"], ["stopMusic", "Остановить музыку"], ['stopAudio','Остановить звук'], ["sound", "Запустить звук"], ["ambience", "Фоновый звук"], ["pause", "Пауза"], ["voice", "Запустить озвучку"],
  ["effect", "Экранный эффект"], ["variable", "Изменить переменную"], ["flag", "Изменить флаг"],
  ["event", "Показать событие"], ["condition", "Проверить условие"], ["jump", "Перейти к сцене"], ["end", "Завершить игру"],
];

const resolutionPresets = [
  { value: "1920x1080", label: "1920 × 1080 · Full HD", width: 1920, height: 1080 },
  { value: "2560x1440", label: "2560 × 1440 · 2K", width: 2560, height: 1440 },
  { value: "1280x720", label: "1280 × 720 · HD", width: 1280, height: 720 },
  { value: "1080x1920", label: "1080 × 1920 · вертикальная", width: 1080, height: 1920 },
];

function readFileAsDataUrl(file) {
  if (window.istoriya?.importFile) return window.istoriya.importFile(file);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function imageSize(dataUrl) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve({ width: null, height: null });
    image.src = dataUrl;
  });
}


function projectResourceSize(project) { return (project.resources ?? []).reduce((sum, item) => sum + (Number(item.size) || 0), 0); }
function formatBytes(size) {
  if (!size) return '—';
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} КБ`;
  return `${(size / 1024 / 1024).toFixed(1)} МБ`;
}

function downloadJson(project) {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${project.meta.title.replace(/[^a-zа-я0-9]+/gi, "-").toLowerCase()}.vnproject`;
  link.click();
  URL.revokeObjectURL(url);
}

function AppLogo({ onClick }) {
  const content = (
    <>
      <BookOpenText weight="duotone" size={28} />
      <div><strong>История</strong><span>визуальные новеллы без кода</span></div>
    </>
  );
  return onClick ? <button className="brand brand-button" onClick={onClick} title="Вернуться к проектам">{content}</button> : <div className="brand">{content}</div>;
}

function TopBar({ onPreview, onBuild, onValidate, onSettings, onExport, onImport, onHome, onSearch }) {
  const { project, activeSceneId, saveState, undo, redo, saveNow, past, future } = useProjectStore();
  const activeScene = project.scenes[activeSceneId];
  return (
    <header className="topbar">
      <AppLogo onClick={onHome} />
      <div className="project-title"><strong>{project.meta.title}</strong><CaretDown size={14} /></div>
      <div className="scene-crumb">Сцена {activeScene?.number ?? "—"} — {activeScene?.title ?? "Без названия"}</div>
      <button className="icon-button" aria-label="Найти в проекте" title="Поиск по проекту (Ctrl+Shift+F)" onClick={onSearch}><MagnifyingGlass/></button><div className={`save-state ${saveState}`}>{saveState === "error" ? <WarningCircle size={16} weight="fill" /> : <CheckCircle size={16} weight="fill" />}{saveState === "saved" ? "Все изменения сохранены" : saveState === "error" ? "Ошибка сохранения" : "Сохраняем…"}</div>
      <div className="history-controls">
        <button className="icon-button" onClick={undo} disabled={!past.length} title="Отменить (Ctrl+Z)"><ArrowCounterClockwise /></button>
        <button className="icon-button" onClick={redo} disabled={!future.length} title="Повторить (Ctrl+Y)"><ArrowClockwise /></button>
        <button className="icon-button" onClick={saveNow} title="Сохранить (Ctrl+S)"><FloppyDisk /></button>
      </div>
      <button className="button secondary run-button" onClick={onPreview}><Play weight="fill" />Запустить</button>
      <button className="icon-button validation-button" onClick={onValidate} title="Проверить проект"><CheckCircle /></button>
      <button className="button primary" onClick={onBuild}><Package weight="duotone" />Собрать игру</button>
      <div className="more-menu">
        <button className="icon-button" title="Импорт проекта" onClick={onImport}><UploadSimple /></button>
        <button className="icon-button" title="Экспорт проекта" onClick={onExport}><DownloadSimple /></button>
        <button className="icon-button" title="Настройки проекта" onClick={onSettings}><GearSix /></button>
      </div>
    </header>
  );
}

function ProjectHub({ onNewProject, onOpenProject, onOpenFile }) {
  const { projects } = useProjectStore();
  const [query, setQuery] = useState("");
  const [wizard, setWizard] = useState(null);
  const [projectTitle, setProjectTitle] = useState("Новая история");
  const [projectAuthor, setProjectAuthor] = useState("");
  const [projectResolution, setProjectResolution] = useState("1920x1080");
  const [projectIcon, setProjectIcon] = useState(null);
  const [projectFolder, setProjectFolder] = useState(null);
  const [customWidth, setCustomWidth] = useState(1920);
  const [customHeight, setCustomHeight] = useState(1080);
  const [wizardError, setWizardError] = useState("");
  const [creating, setCreating] = useState(false);
  const visibleProjects = projects.filter((item) => item.meta.title.toLowerCase().includes(query.toLowerCase()));
  const templates = [
    { id: "empty", title: "Пустой проект", note: "Чистая сцена и глава", image: "./assets/demo-aurora.png" },
  ];
  const startWizard = (template = "empty") => { setWizard(template); setProjectResolution(template === "vertical" ? "1080x1920" : "1920x1080"); };
  const createFromWizard = async () => {
    const preset = projectResolution === "custom" ? { width: customWidth, height: customHeight } : resolutionPresets.find((item) => item.value === projectResolution);
    if (!preset || !Number.isInteger(preset.width) || !Number.isInteger(preset.height) || preset.width < 320 || preset.height < 320 || preset.width > 7680 || preset.height > 7680) { setWizardError("Размеры должны быть целыми числами от 320 до 7680 пикселей."); return; }
    setCreating(true); setWizardError("");
    try { await onNewProject({ template: wizard, title: projectTitle, author: projectAuthor, icon: projectIcon, projectFolder, resolution: { width: preset.width, height: preset.height } }); setWizard(null); }
    catch (error) { setWizardError(error.message || "Не удалось создать проект"); }
    finally { setCreating(false); }
  };
  const projectPreview = (project) => backgroundSource(project, project.scenes?.scene_fire ?? Object.values(project.scenes ?? {})[0]);
  const modified = (project) => project.meta.modifiedAt ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(project.meta.modifiedAt)) : "Недавно";
  return <div className="home-shell">
    <aside className="home-sidebar"><AppLogo /><div className="hub-current"><FolderSimple />Мои проекты</div><div className="home-sidebar-note"><ProfileStorageButton className="hub-storage"/><DiagnosticsButton className="hub-diagnostics"/><strong>Ваши истории — рядом</strong><span>Локальные проекты · без регистрации</span></div></aside>
    <main className="home-main home-page-projects">
      <header className="home-header"><div><span className="hub-eyebrow">МАСТЕРСКАЯ ИСТОРИЙ</span><h1>Мои проекты</h1><p>Продолжите работу или создайте новую историю.</p></div></header>
      <section className="quick-start">
        <button className="create-project-card" onClick={() => startWizard("empty")}><span><Plus weight="bold" /></span><div><strong>Новый проект</strong><small>Создать визуальную новеллу</small></div></button>
        <button className="quick-card" onClick={onOpenFile}><FolderOpen weight="duotone" /><div><strong>Открыть проект</strong><small>Файл .vnproject</small></div></button>
      </section>
      <section className="home-section recent-projects"><div className="home-section-title"><div><h2>Недавние проекты</h2><span>{projects.length} {projects.length === 1 ? "проект" : "проектов"}</span></div><label className="home-search"><MagnifyingGlass /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск проектов" /></label></div>
        <div className="project-grid">{visibleProjects.map((project) => <button className="project-card" key={project.id} onClick={() => onOpenProject(project.id)}><div className="project-cover">{projectPreview(project) ? <img src={projectPreview(project)} alt="" loading="lazy" decoding="async"/> : <BookOpenText size={48} />}<span>{project.meta.resolution?.width ?? 1920} × {project.meta.resolution?.height ?? 1080}</span></div><div className="project-card-info"><strong>{project.meta.title}</strong><small>Изменён {modified(project)}</small></div></button>)}
          {!visibleProjects.length && <div className="empty-projects"><FilmSlate /><strong>Проекты не найдены</strong><span>Создайте новый проект или измените запрос.</span></div>}
        </div>
      </section>
    </main>
    {wizard && <div className="modal-backdrop"><div className="dialog project-wizard"><div className="dialog-header"><div><FilmSlate /><div><h2>Новый проект</h2><p>{templates.find((item) => item.id === wizard)?.title}</p></div></div><button className="icon-button" onClick={() => setWizard(null)}><X /></button></div><div className="dialog-content two-column-form"><Field label="Название проекта"><input autoFocus value={projectTitle} onChange={(event) => setProjectTitle(event.target.value)} /></Field><Field label="Автор"><input value={projectAuthor} onChange={(event) => setProjectAuthor(event.target.value)} /></Field><Field label="Внутреннее разрешение"><select value={projectResolution} onChange={(event) => setProjectResolution(event.target.value)}>{resolutionPresets.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}<option value="custom">Своё разрешение</option></select></Field>{projectResolution === "custom" && <div className="field-grid"><Field label="Ширина"><input type="number" value={customWidth} onChange={(e) => setCustomWidth(Number(e.target.value))} /></Field><Field label="Высота"><input type="number" value={customHeight} onChange={(e) => setCustomHeight(Number(e.target.value))} /></Field></div>}{window.istoriya?.chooseProjectFolder && <div className="span-2"><Field label="Папка хранения"><button className="button secondary" onClick={async () => { const folder = await window.istoriya.chooseProjectFolder(); if (folder) setProjectFolder(folder); }}><FolderOpen />{projectFolder ?? "Выбрать папку (по умолчанию — папка приложения)"}</button></Field></div>}{wizardError && <p role="alert" className="span-2">{wizardError}</p>}<div className="wizard-info"><strong>{templates.find((item) => item.id === wizard)?.title}</strong><span>Шаблон задаёт только начальные параметры. Любой элемент можно изменить или удалить.</span></div><AssetPicker title="Иконка проекта (можно позже)" value={projectIcon} onChange={setProjectIcon} /></div><div className="dialog-footer"><button className="button secondary" onClick={() => setWizard(null)}>Отмена</button><button className="button primary" disabled={!projectTitle.trim() || creating} onClick={createFromWizard}><Plus />Создать проект</button></div></div></div>}
  </div>;
}

function NavigationRail() {
  const { activeSection, setActiveSection } = useProjectStore();
  return (
    <nav className="nav-rail" aria-label="Разделы проекта">
      <div className="rail-items">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button key={id} className={activeSection === id ? "active" : ""} onClick={() => setActiveSection(id)}>
            <Icon size={23} weight={activeSection === id ? "duotone" : "regular"} /><span>{label}</span>
          </button>
        ))}
      </div>
      <button className="rail-settings" onClick={() => setActiveSection("settings")}><GearSix size={23} /><span>Настройки</span></button>
    </nav>
  );
}

function ProjectTree() {
  const projectId=useProjectStore(s=>s.project.id),activeSection=useProjectStore(s=>s.activeSection),setActiveSection=useProjectStore.getState().setActiveSection;
  const sidebarNav = [
    { id: "story", label: "Сюжет", note: "Структура и логика", icon: GitBranch },
    { id: "scenes", label: "Сцены", note: "Визуальные эпизоды", icon: FilmSlate },
    { id: "characters", label: "Персонажи", note: "Герои и их свойства", icon: Users },
    { id: "resources", label: "Ресурсы", note: "Фоны, музыка, звуки", icon: ImageSquare },
    { id: "gallery", label: "Галерея", note: "CG и разблокировка", icon: ImageSquare },
    { id: "interface", label: "Интерфейс", note: "Меню, диалоги, выборы", icon: Palette },
  ];
  return <aside className="project-tree"><div className="sidebar-label">ПРОЕКТ</div><div className="sidebar-nav">{sidebarNav.map(({id,label,note,icon:Icon})=><button key={id} className={activeSection===id?'active':''} onClick={()=>setActiveSection(id)}><Icon weight="duotone"/><span><strong>{label}</strong><small>{note}</small></span></button>)}</div><ProjectSceneTree key={projectId}/></aside>;
}

function CanvasToolbar({ onAddCharacter,onAddImage,onPickBackground,hasBackground, editBackground, onToggleBackground, clipPreview, onToggleClip,navigation,selectedBounds,onFocus }) {
  const { project, activeSceneId } = useProjectStore();
  const scene = project.scenes[activeSceneId];
  return (
    <div className="canvas-toolbar">
      <strong title={`Сцена ${scene.number} — ${scene.title}`}>Сцена {scene.number} — {scene.title}</strong>
      <CanvasViewControls navigation={navigation} selectedBounds={selectedBounds} onFocus={onFocus} clipPreview={clipPreview} onToggleClip={onToggleClip}/>
      <div className="canvas-object-tools"><button className="canvas-add-character" aria-label="Добавить персонажа" title="Добавить персонажа в текущий кадр" onClick={onAddCharacter}><User />Персонаж</button><button className="canvas-mode-button" onClick={onPickBackground}><ImageSquare/>Фон…</button><button className="canvas-mode-button" onClick={onAddImage}>Предмет</button>{hasBackground&&<button className={`canvas-mode-button ${editBackground?"active":""}`} aria-pressed={editBackground} onClick={onToggleBackground}>Двигать фон</button>}<span className="canvas-resolution">{project.meta.resolution.width} × {project.meta.resolution.height}</span></div>
    </div>
  );
}

function DialogueOverlay({ scene, frame, canvasWidth }) {
  const { project, activeActionId } = useProjectStore();
  const action = frame ? frame.text : scene.actions.find((item) => item.id === activeActionId) ?? [...scene.actions].reverse().find((item) => item.type === "dialogue");
  if (!action || !["dialogue", "narration"].includes(action.type)) return null;
  const character = project.characters.find((item) => item.id === action.speakerId);
  const factor = canvasWidth / project.meta.resolution.width;
  if(project.ui.layout?.dialogue?.enabled)return <><GameDialogue project={project} action={action} character={action.type==='dialogue'?character:null} width={canvasWidth} onRegion={()=>{}}/>{project.ui.layout?.quick?.enabled&&<GameQuick project={project} width={canvasWidth}/>}</>;
  return (
    <><div className={`dialogue-overlay position-${project.ui.dialoguePosition}`} style={{ opacity: project.ui.dialogueOpacity / 100, backgroundImage: project.ui.dialogueBackground ? `url(${project.ui.dialogueBackground})` : undefined }}>
      {action.type === "dialogue" && <div className="speaker-name" style={{ color: character?.color, fontSize:32*factor }}>{character?.name ?? "Автор"}</div>}
      <StyledText project={project} action={action} factor={factor} minFontSize={1}>{action.text}</StyledText>
      {project.ui.showQuickMenu && !project.ui.layout?.quick?.enabled && <div className="quick-menu"><span>Пропуск</span><span>Авто</span><span>История</span><span>Настройки</span></div>}
      <CaretDown className="continue-mark" weight="fill" />
    </div>{project.ui.layout?.quick?.enabled&&<GameQuick project={project} width={canvasWidth}/>}</>
  );
}

function SceneCanvas({ onBackgroundPick }) {
  const { project, activeSceneId, activeLayerId, selectVisualLayer, updateSceneCharacter,updateSceneImage, bottomTab, timelineTime, addAction, updateAction, updateScene,activeActionId } = useProjectStore();
  const scene = project.scenes[activeSceneId];
  const frames=useMemo(()=>!scene.timelineEnabled?storyboardFrames(project,scene):[],[project,scene]);
  const frame = bottomTab === "timeline" ? timelineFrame(project, scene, timelineTime) : frames.find(f=>f.action.id===activeActionId)?.frame??null;
  const characters=frame?.layers??sceneCharacterLayers(scene),images=sceneImages(scene);
  const paintOrder=scenePaintOrder(scene,characters,images,frame?.backgroundActionId);
  const [contextMenu,setContextMenu] = useState(null);
  const [showCharacters,setShowCharacters] = useState(false);
  const [drag, setDrag] = useState(null);
  const [editBackground,setEditBackground]=useState(false);
  const [showProps,setShowProps]=useState(false);
  const viewport = useRef(null);
  const [clipPreview,setClipPreview]=useState(false);
  const layerPosition = (layer) => drag?.layerId === layer.id ? drag : layer;
  const gesture = useRef(null);
  const cancelLayerDrag=()=>{const current=gesture.current;gesture.current=null;setDrag(null);if(current?.element.hasPointerCapture(current.pointerId))current.element.releasePointerCapture(current.pointerId);return !!current;};
  const cancelOwnedDrag=event=>{if(gesture.current?.pointerId===event.pointerId)cancelLayerDrag();};
  const navigation=useCanvasViewport(viewport,`${project.id}:${scene.id}`,project.meta.resolution,{canNavigate:!drag,onCancel:cancelLayerDrag});
  const canvasWidth=project.meta.resolution.width*navigation.view.scale;
  useEffect(()=>{cancelLayerDrag();},[project.id,scene.id,activeActionId,bottomTab]);
  const bgTransform=backgroundTransform(drag?.layerId==='__background'?drag:(frame?frame.backgroundTransform:scene.backgroundTransform));
  const selectedLayer=activeLayerId==='__background'?{...bgTransform,kind:'background'}:[...characters,...images].find(layer=>layer.id===activeLayerId);
  const selectedBounds=selectedLayer&&selectedLayer.visible!==false&&selectedLayer.opacity!==0?canvasLayerBounds(selectedLayer,project.meta.resolution):null;
  const updateBackground=patch=>{const backgroundActionId=frame?.backgroundActionId;if(backgroundActionId)updateAction(scene.id,backgroundActionId,{backgroundTransform:{...bgTransform,...patch}});else updateScene(scene.id,{backgroundTransform:{...bgTransform,...patch}});};
  const beginDrag = (event, layer, mode = "move") => {
    if (layer.locked || event.button !== 0) return;
    if(gesture.current){event.preventDefault();event.stopPropagation();return;}
    event.preventDefault(); event.stopPropagation();
    if(layer.id!=='__background')selectVisualLayer(layer.id);
    const rect = event.currentTarget.closest(".game-canvas").getBoundingClientRect();
    const anchorX = rect.left + layer.x / 100 * rect.width;
    const anchorY = rect.top + layer.y / 100 * rect.height;
    gesture.current = {mode, layerId:layer.id,pointerId:event.pointerId,element:event.currentTarget,projectId:project.id,sceneId:scene.id,actionId:activeActionId,x:layer.x, y:layer.y, scale:layer.scale ?? 100,
      clientX:event.clientX, clientY:event.clientY, width:rect.width, height:rect.height,
      anchorX, anchorY, distance:Math.hypot(event.clientX-anchorX,event.clientY-anchorY)};
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({...layer, layerId:layer.id});
  };
  const moveDrag = (event, layer) => {
    if (gesture.current?.layerId !== layer.id||gesture.current.pointerId!==event.pointerId) return;
    setDrag({...layer, layerId:layer.id, ...canvasTransform(gesture.current,event.clientX,event.clientY)});
  };
  const finishDrag = (event, layer) => {
    if (gesture.current?.layerId !== layer.id||gesture.current.pointerId!==event.pointerId) return;
    if(gesture.current.projectId!==project.id||gesture.current.sceneId!==scene.id||gesture.current.actionId!==activeActionId){cancelLayerDrag();return;}
    const patch = canvasTransform(gesture.current,event.clientX,event.clientY);
    if(layer.id==='__background')updateBackground(patch);
    else if(layer.kind==='image')updateSceneImage(scene.id,layer.id,patch);
    else for(const edit of visualLayerEdits(layer,patch)){if(edit.actionId)updateAction(scene.id,edit.actionId,edit.patch);else updateSceneCharacter(scene.id,layer.id,edit.patch);}
    gesture.current=null; setDrag(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return (
    <section className="scene-stage" data-editor-location={JSON.stringify(['scene',scene.id])}><CanvasToolbar onAddCharacter={() => setShowCharacters(true)} onAddImage={()=>setShowProps(true)} onPickBackground={onBackgroundPick} hasBackground={!!(frame?frame.background:backgroundSource(project,scene))} editBackground={editBackground} onToggleBackground={()=>{setEditBackground(!editBackground);selectVisualLayer("__background");}} clipPreview={clipPreview} onToggleClip={()=>setClipPreview(!clipPreview)} navigation={navigation} selectedBounds={selectedBounds} onFocus={()=>{setClipPreview(false);navigation.focus(selectedBounds);}} /><div className={`canvas-viewport ${navigation.canPan?"can-pan":""} ${navigation.panning?"is-panning":""}`} ref={viewport} role="region" aria-label="Холст сцены" tabIndex={0} {...navigation.bind}><div className="scene-pasteboard" style={{left:navigation.view.x,top:navigation.view.y}}><div className={`game-canvas ${clipPreview?"clip-preview":""}`} onContextMenu={e => {e.preventDefault();setContextMenu({x:e.clientX,y:e.clientY});}} style={{ width: canvasWidth, aspectRatio: `${project.meta.resolution.width} / ${project.meta.resolution.height}` }}>
      <div className="visual-scene-objects">
      <div className="scene-background-clip" style={{zIndex:paintOrder.background}}>{(frame ? frame.background : backgroundSource(project,scene)) && <img className="scene-background" style={backgroundStyle(bgTransform)} src={frame ? frame.background : backgroundSource(project,scene)} alt={`Фон сцены ${scene.title}`} />}</div>
      {characters.map((layer) => {
        const character = project.characters.find((item) => item.id === layer.characterId);
        const { source, sprite } = resolveCharacterSprite(character, layer.spriteId, project.resources);
        const selected = activeLayerId === layer.id || (layer.sourceActionId && activeActionId === layer.sourceActionId);
        const position = layerPosition(layer);
        if (!layer.visible) return null;
        return <button key={layer.id} className={`scene-character-layer ${selected ? "selected" : ""} ${layer.locked ? "locked" : ""}`} style={{ left: `${position.x}%`, top: `${position.y}%`, opacity: layer.opacity / 100,zIndex:paintOrder.characters.get(layer.characterId), transform: `translate(-50%, -100%) rotate(${layer.rotation}deg) scale(${layer.flip ? -position.scale / 100 : position.scale / 100}, ${position.scale / 100})` }} onPointerDown={(event) => beginDrag(event, layer)} onPointerMove={(event) => moveDrag(event, layer)} onPointerUp={(event) => finishDrag(event, layer)} onPointerCancel={cancelOwnedDrag} onLostPointerCapture={cancelOwnedDrag}>
          {source ? <img src={source} alt={`${character?.name ?? "Персонаж"} — ${sprite?.name ?? "портрет"}`} draggable="false" /> : <span className="character-placeholder"><User weight="duotone" /><strong>{character?.name ?? "Персонаж"}</strong><small>Добавьте PNG-спрайт</small></span>}
          {selected && !layer.locked && <><span className="sprite-size-badge">{Math.round(project.meta.resolution.width * .34 * position.scale / 100)} × {Math.round(project.meta.resolution.height * .88 * position.scale / 100)} · {position.scale}%</span>{["nw","ne","sw","se"].map(corner => <span key={corner} className={"sprite-resize-handle " + corner} title="Потяните, чтобы изменить размер" onPointerDown={event => beginDrag(event,layer,"resize")} />)}</>}
        </button>;
      })}
      {images.filter(layer=>layer.visible).map(layer=>{const resource=project.resources.find(r=>r.id===layer.resourceId),position=layerPosition(layer);return <button key={layer.id} aria-label={`Слой: ${layer.name}`} className={`scene-image-layer ${activeLayerId===layer.id?'selected':''} ${layer.locked?'locked':''}`} style={{...imageLayerStyle(position),zIndex:paintOrder.images.get(layer.id)}} onPointerDown={event=>beginDrag(event,layer)} onPointerMove={event=>moveDrag(event,layer)} onPointerUp={event=>finishDrag(event,layer)} onPointerCancel={cancelOwnedDrag} onLostPointerCapture={cancelOwnedDrag}>{resource?.source&&<img src={resource.source} alt={layer.name} draggable="false"/>}{activeLayerId===layer.id&&!layer.locked&&['nw','ne','sw','se'].map(corner=><span key={corner} className={'sprite-resize-handle '+corner} onPointerDown={event=>beginDrag(event,layer,'resize')}/>)}</button>;})}
      </div>
      {!(frame ? frame.background : backgroundSource(project,scene)) && !characters.some(l=>l.visible)&&!images.some(l=>l.visible)&&<div className="empty-canvas"><ImageSquare size={42}/><span>Добавьте фон и персонажей</span></div>}
      {editBackground && <div className="background-edit-outline" style={backgroundStyle(bgTransform)} onPointerDown={event=>beginDrag(event,{...bgTransform,id:"__background"})} onPointerMove={event=>moveDrag(event,{...bgTransform,id:"__background"})} onPointerUp={event=>finishDrag(event,{...bgTransform,id:"__background"})} onPointerCancel={cancelOwnedDrag} onLostPointerCapture={cancelOwnedDrag}><span>Фон · {Math.round(bgTransform.scale)}%</span>{["nw","ne","sw","se"].map(corner=><span key={corner} className={"sprite-resize-handle "+corner} onPointerDown={event=>beginDrag(event,{...bgTransform,id:"__background"},"resize")}/>)}</div>}
      {project.editor?.showGuides && <><span className="canvas-guide vertical" /><span className="canvas-guide horizontal" /></>}
      {frame?.cg && <img className="timeline-cg-preview" src={frame.cg} alt="Иллюстрация" />}<DialogueOverlay scene={scene} frame={frame} canvasWidth={canvasWidth} />{frame?.choice && <div className="timeline-choice-preview">{frame.choice.options.map(o=><span key={o.id}>{o.text}</span>)}</div>}<button className="replace-background" onClick={onBackgroundPick}><ImageSquare />Заменить фон</button>
    </div></div></div>{contextMenu && <EditorContextMenu position={contextMenu} items={sceneMenuItems({addCharacter:()=>setShowCharacters(true),addProp:()=>setShowProps(true),background:onBackgroundPick,action:type=>addAction(type,{afterId:activeActionId})})} onClose={()=>setContextMenu(null)}/>} {showCharacters && <CharacterPicker sceneId={scene.id} onClose={()=>setShowCharacters(false)} onAdded={scene.timelineEnabled?undefined:characterId=>addAction('showCharacter',{afterId:activeActionId,values:{characterId}})}/>} {showProps&&<PropPicker key={`${project.id}:${scene.id}`} sceneId={scene.id} onClose={()=>setShowProps(false)}/>}</section>
  );
}

function ActionIcon({ type }) {
  if (["background", "showCG", "hideCG"].includes(type)) return <ImageSquare />;
  if (type === "choice") return <GitBranch />;
  if (["music", "stopMusic"].includes(type)) return <MusicNotes />;
  if (["sound", "voice"].includes(type)) return <SpeakerHigh />;
  if (["showCharacter", "hideCharacter", "changeSprite", "moveCharacter", "characterAnimation"].includes(type)) return <User />;
  return <TextT />;
}

function ScenarioEditor() {
  const { project, activeSceneId, activeActionId, bottomTab, setBottomTab, setActiveAction, addAction, removeAction, moveAction } = useProjectStore();
  const [showActionMenu, setShowActionMenu] = useState(false),[showBackground,setShowBackground]=useState(false);
  useEffect(() => { document.querySelector(".action-row.active")?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [activeActionId, bottomTab]);
  const scene = project.scenes[activeSceneId];
  const lanes = [["Фон и иллюстрации", ["background", "showCG", "hideCG"]], ["Персонажи", ["showCharacter", "hideCharacter", "changeSprite", "moveCharacter", "characterAnimation"]], ["Текст и выборы", ["dialogue", "narration", "choice"]], ["Музыка и звук", ["music", "stopMusic", "sound", "voice", "ambience"]], ["Логика и эффекты", ["variable", "flag", "event", "condition", "jump", "end", "effect", "pause"]]];
  const actionLabel = (action) => actionTypes.find(([type]) => type === action.type)?.[1] ?? "Действие";
  const content = (action) => action.text ?? action.prompt ?? project.resources.find((item) => item.id === action.assetId)?.name ?? project.characters.find((item) => item.id === action.characterId)?.name ?? actionLabel(action);
  return <section className="scenario-panel">
    <div className="scenario-tabs">{[["scenario", "Кадры сцены"], ...(scene.timelineEnabled?[["timeline", "Монтаж по времени"]]:[]), ["map", "Карта сюжета"]].map(([id, title]) => <button key={id} className={bottomTab === id ? "active" : ""} onClick={() => setBottomTab(id)}>{title}</button>)}<div className="action-menu-wrap"><button className="add-block" onClick={() => setShowActionMenu(!showActionMenu)}>Добавить шаг <Plus /></button>{showActionMenu && <ActionPicker actions={actionTypes} onChoose={(type) => {if(type==='background')setShowBackground(true);else addAction(type,{afterId:activeActionId}); setShowActionMenu(false); }} onClose={() => setShowActionMenu(false)} />}</div></div>
    {showBackground&&<BackgroundPicker sceneId={scene.id} placement="insert" onClose={()=>setShowBackground(false)}/>}
    {bottomTab === "scenario" && (scene.timelineEnabled ? <div className="legacy-scene-notice"><ClockCountdown/><h3>В этой сцене настроен монтаж по времени</h3><p>Откройте существующий монтаж или переведите сцену в последовательность шагов.</p><button className="button secondary" onClick={()=>setBottomTab('timeline')}>Открыть монтаж</button><button className="button primary" onClick={()=>{if(window.confirm('Одновременные клипы станут последовательными шагами. Отключённые клипы не попадут в последовательность. Исходный монтаж сохранится в проекте; отмена доступна через Ctrl+Z. Продолжить?'))useProjectStore.getState().convertSceneToStoryboard(scene.id);}}>Перевести в кадры</button></div> : <StoryboardEditor scene={scene} actionLabel={actionLabel} content={content} onMore={()=>setShowActionMenu(true)}/>)}
    {bottomTab === "timeline" && <TimelineEditor scene={scene} actionLabel={actionLabel} content={content}/> }
    {bottomTab === "map" && <StoryMap />}
  </section>;
}

function Field({ label, children, className = "" }) { return <label className={`field ${className}`.trim()}><span>{label}</span>{children}</label>; }

function ActionFields({ action, scene }) {
  if(!action)return null;
  return <div data-editor-location={JSON.stringify(['action',action.id])}><ActionSpecificFields action={action} scene={scene}/>{!['music','stopMusic','stopAudio','sound','voice','ambience'].includes(action.type)&&<ActionAudioFields action={action} scene={scene}/>}</div>;
}
function ActionSpecificFields({ action, scene }) {
  const { project, updateAction } = useProjectStore();
  if (!action) return null;
  const patch = (value) => updateAction(scene.id, action.id, value);
  const imageResources = project.resources.filter((item) => ["background", "cg"].includes(item.category));
  if (action.type === "dialogue") {
    const character = project.characters.find((item) => item.id === action.speakerId);
    return <><Field label="Персонаж"><select value={action.speakerId ?? ""} onChange={(event) => patch({ speakerId: event.target.value, spriteId: null })}>{project.characters.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field><Field label="Спрайт"><select value={action.spriteId ?? ""} onChange={(event) => patch({ spriteId: event.target.value || null })}><option value="">Основной</option>{character?.sprites.map((sprite) => <option value={sprite.id} key={sprite.id}>{sprite.name}</option>)}</select></Field><AudioResourceField label="Озвучка реплики" category="voice" value={action.voiceAssetId} target={{kind:'action',sceneId:scene.id,actionId:action.id}} field="voiceAssetId" volume={action.voiceVolume} onVolumeChange={voiceVolume=>patch({voiceVolume})}/><Field label="Текст"><textarea rows="5" value={action.text} onChange={(event) => patch({ text: event.target.value })} /></Field><TextAppearance action={action} onChange={patch}/></>;
  }
  if (action.type === "narration") return <><Field label="Текст автора"><textarea rows="6" value={action.text} onChange={(event) => patch({ text: event.target.value })} /></Field><AudioResourceField label="Озвучка реплики" category="voice" value={action.voiceAssetId} target={{kind:'action',sceneId:scene.id,actionId:action.id}} field="voiceAssetId" volume={action.voiceVolume} onVolumeChange={voiceVolume=>patch({voiceVolume})}/><TextAppearance action={action} onChange={patch}/></>;
  if(action.type==='explore')return <ExplorationFields action={action} scene={scene}/>;
  if (action.type === "pause") return <Field label="Длительность паузы, сек"><input type="number" min=".1" step=".1" value={action.duration??1} onChange={e=>patch({duration:Math.max(.1,Number(e.target.value)||1)})}/></Field>;
  if (action.type === "choice") {
    return <ChoiceFields scene={scene} action={action}/>;
  }
  if (action.type === "background") return <BackgroundActionFields action={action} scene={scene} Field={Field}/>;
  if (["showCharacter", "hideCharacter"].includes(action.type)) {
    const character = project.characters.find((item) => item.id === action.characterId);
    return <><Field label="Персонаж"><select value={action.characterId ?? ""} onChange={(event) => patch({ characterId: event.target.value, spriteId: null })}>{project.characters.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field>{action.type === "showCharacter" && <><Field label="Спрайт"><select value={action.spriteId ?? ""} onChange={(event) => patch({ spriteId: event.target.value || null })}><option value="">Основной</option>{character?.sprites.map((sprite) => <option value={sprite.id} key={sprite.id}>{sprite.name}</option>)}</select></Field><Field label="Позиция"><select value={action.position ?? "center"} onChange={(event) => patch({ position: event.target.value, x: ({left:25,center:50,right:75})[event.target.value] })}><option value="left">Слева</option><option value="center">По центру</option><option value="right">Справа</option></select></Field><div className="field-grid">{[["x","X · %",50],["y","Y · %",100],["scale","Масштаб · %",100]].map(([key,label,fallback]) => <Field key={key} label={label}><input type="number" min={key==="scale"?10:undefined} max={key==="scale"?400:undefined} value={action[key] ?? (key==="x"?({left:25,center:50,right:75})[action.position]??50:fallback)} onChange={e=>patch({[key]:key==="scale"?Math.max(10,Math.min(400,Number(e.target.value))):Number(e.target.value)})}/></Field>)}</div></>}<Field label="Анимация"><select value={action.transition ?? "dissolve"} onChange={(event) => patch({ transition: event.target.value })}><option value="dissolve">Плавное появление</option><option value="moveinleft">Въезд слева</option><option value="moveinright">Въезд справа</option><option value="none">Без анимации</option></select></Field></>;
  }
  if (action.type === "changeSprite") { const character = project.characters.find((item) => item.id === action.characterId); return <><Field label="Персонаж"><select value={action.characterId ?? ""} onChange={(event) => patch({ characterId: event.target.value, spriteId: null })}>{project.characters.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field><Field label="Новый спрайт"><select value={action.spriteId ?? ""} onChange={(event) => patch({ spriteId: event.target.value || null })}><option value="">Основной</option>{character?.sprites.map((sprite) => <option value={sprite.id} key={sprite.id}>{sprite.name}</option>)}</select></Field><Field label="Переход"><select value={action.transition ?? "dissolve"} onChange={(event) => patch({ transition: event.target.value })}><option value="dissolve">Растворение</option><option value="fade">Затемнение</option><option value="none">Мгновенно</option></select></Field></>; }
  if (action.type === "moveCharacter") return <><Field label="Персонаж"><select value={action.characterId ?? ""} onChange={(event) => patch({ characterId: event.target.value })}>{project.characters.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field><Field label="Куда переместить"><select value={action.position ?? "center"} onChange={(event) => patch({ position: event.target.value, x: null })}><option value="left">Влево</option><option value="center">По центру</option><option value="right">Вправо</option></select></Field><div className="field-grid"><Field label="X · %"><input type="number" value={action.x ?? ({left:25,center:50,right:75})[action.position] ?? 50} onChange={event=>patch({x:Number(event.target.value)})}/></Field><Field label="Y · %"><input type="number" value={action.y ?? 100} onChange={event=>patch({y:Number(event.target.value)})}/></Field></div><Field label="Длительность"><div className="unit-input"><input type="number" min="0.1" step="0.1" value={action.duration ?? .5} onChange={(event) => patch({ duration: Number(event.target.value) })} /><span>сек.</span></div></Field></>;
  if (action.type === "characterAnimation") return <><Field label="Персонаж"><select value={action.characterId ?? ""} onChange={(event) => patch({ characterId: event.target.value })}>{project.characters.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field><Field label="Анимация"><select value={action.animation ?? "shake"} onChange={(event) => patch({ animation: event.target.value })}><option value="shake">Дрожь</option><option value="strongShake">Сильная дрожь</option><option value="jump">Прыжок</option><option value="bounce">Подпрыгивание</option><option value="pulse">Пульсация</option><option value="zoomIn">Увеличение</option><option value="stepForward">Шаг вперёд</option><option value="stepBack">Шаг назад</option></select></Field><div className="field-grid"><Field label="Длительность"><input type="number" min="0.1" step="0.1" value={action.duration ?? .5} onChange={(event) => patch({ duration: Number(event.target.value) })} /></Field><Field label="Интенсивность"><input type="number" min="0.2" max="3" step="0.1" value={action.intensity ?? 1} onChange={(event) => patch({ intensity: Number(event.target.value) })} /></Field></div></>;
  if (action.type === "showCG") return <><Field label="Сюжетная иллюстрация"><select value={action.assetId ?? ""} onChange={(event) => patch({ assetId: event.target.value || null })}><option value="">Выберите CG</option>{imageResources.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field><Field label="Переход"><select value={action.transition ?? "dissolve"} onChange={(event) => patch({ transition: event.target.value })}><option value="dissolve">Растворение</option><option value="fade">Затемнение</option><option value="flash">Вспышка</option><option value="none">Мгновенно</option></select></Field><label className="check-field"><input type="checkbox" checked={action.unlockGallery ?? true} onChange={(event) => patch({ unlockGallery: event.target.checked })} /><span><Check />Открыть изображение в галерее после показа</span></label></>;
  if (action.type === "hideCG") return <Field label="Переход"><select value={action.transition ?? "dissolve"} onChange={(event) => patch({ transition: event.target.value })}><option value="dissolve">Растворение</option><option value="fade">Затемнение</option><option value="none">Мгновенно</option></select></Field>;
  if (["music","ambience"].includes(action.type)) return <><AudioResourceField label={action.type==='music'?'Музыка':'Фоновый звук'} category={action.type==='music'?'music':'sound'} value={action.assetId} target={{kind:'action',sceneId:scene.id,actionId:action.id}} field="assetId"/><Field label={`Громкость · ${Math.round((action.volume ?? 1) * 100)}%`}><input type="range" min="0" max="100" value={(action.volume ?? 1) * 100} onChange={(event) => patch({ volume: Number(event.target.value) / 100 })} /></Field>{action.type==='music'&&<Field label="Плавное начало · сек."><input type="number" min="0" max="60" step="0.1" value={action.fadeIn??0} onChange={event=>patch({fadeIn:Number(event.target.value)})}/></Field>}<label className="check-field"><input type="checkbox" checked={action.loop ?? true} onChange={(event) => patch({ loop: event.target.checked })} /><span><Check />Повторять трек</span></label></>;
  if (action.type === "stopMusic") return <Field label="Плавное затухание"><div className="unit-input"><input type="number" min="0" step="0.1" value={action.fadeOut ?? 1} onChange={(event) => patch({ fadeOut: Number(event.target.value) })} /><span>сек.</span></div></Field>;
  if(action.type==='stopAudio')return <><Field label="Какой звук остановить"><select value={action.channel??'sound'} onChange={e=>patch({channel:e.target.value})}><option value="sound">Звуковые эффекты</option><option value="voice">Озвучка</option><option value="ambience">Фоновые звуки</option><option value="music">Музыка</option></select></Field><Field label="Плавное затухание · сек."><input type="number" min="0" max="60" step="0.1" value={action.fadeOut??0} onChange={e=>patch({fadeOut:Number(e.target.value)})}/></Field></>;
  if (["sound", "voice"].includes(action.type)) return <><AudioResourceField label={action.type==='voice'?'Файл озвучки':'Звуковой эффект'} category={action.type==='voice'?'voice':'sound'} value={action.assetId} target={{kind:'action',sceneId:scene.id,actionId:action.id}} field="assetId" volume={action.volume} onVolumeChange={volume=>patch({volume})}/>{action.type==='sound'&&<label className="check-field"><input type="checkbox" checked={action.loop===true} onChange={e=>patch({loop:e.target.checked})}/><span><Check/>Повторять до остановки</span></label>}</>;
  if (action.type === "effect") return <Field label="Эффект"><select value={action.effect ?? "flash"} onChange={(event) => patch({ effect: event.target.value })}><option value="flash">Вспышка</option><option value="shake">Тряска</option><option value="fade">Затемнение</option></select></Field>;
  if(action.type==='variable')return <VariableActionFields project={project} action={action} onChange={patch}/>;
  if (action.type === "flag") return <><Field label="Флаг"><select value={action.flagId ?? ""} onChange={(event) => patch({ flagId: event.target.value })}>{project.flags.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field><Field label="Состояние"><select value={String(action.value)} onChange={(event) => patch({ value: event.target.value === "true" })}><option value="true">Включить</option><option value="false">Выключить</option></select></Field></>;
  if (action.type === "event") return <><Field label="Текст события"><textarea rows="4" value={action.text ?? ""} onChange={(event) => patch({ text: event.target.value })} /></Field><Field label="Длительность"><div className="unit-input"><input type="number" min="0.5" step="0.5" value={action.duration ?? 2.5} onChange={(event) => patch({ duration: Number(event.target.value) })} /><span>сек.</span></div></Field></>;
  if(action.type==='condition')return <><ConditionEditor project={project} value={action.condition??action} onChange={condition=>patch({condition:condition??{kind:'all',conditions:[]}})}/>{[['trueSceneId','Если да'],['falseSceneId','Если нет']].map(([field,label])=><StoryDestinationField key={`${action.id}:${field}`} project={project} label={label} value={destinationValue(action,field)} onChange={value=>patch(destinationPatch(value,field))}/>)}</>;
  if (action.type === "jump") return <StoryDestinationField key={action.id} project={project} label="Следующая сцена" value={destinationValue(action)} onChange={value=>patch(destinationPatch(value))}/>;
  return <div className="inspector-hint"><CheckCircle weight="fill" />После этого блока игра завершится.</div>;
}

function Inspector() {
  const { project, activeSceneId, activeActionId, activeLayerId, inspectorTab, setInspectorTab, setActiveLayer, updateScene, updateUi, addSceneCharacter, updateSceneCharacter: updateBaseLayer,updateSceneImage, moveSceneCharacter, removeSceneCharacter, layerToTimeline, updateAction, bottomTab, timelineTime } = useProjectStore();
  const scene = project.scenes[activeSceneId];
  const action = !activeLayerId && scene.actions.find((item) => item.id === activeActionId);
  const snapshots = !scene.timelineEnabled ? storyboardFrames(project,scene) : [];
  const visualFrame = bottomTab === 'timeline' ? timelineFrame(project,scene,timelineTime) : snapshots.find(item=>item.action.id===activeActionId)?.frame;
  const characters = visualFrame?.layers ?? sceneCharacterLayers(scene);
  const images=sceneImages(scene),selectedImage=images.find(layer=>layer.id===activeLayerId);
  const updateSceneCharacter = (sceneId,layerId,patch) => {if(images.some(layer=>layer.id===layerId)){updateSceneImage(sceneId,layerId,patch);return;} const item=characters.find(layer=>layer.id===layerId);for(const edit of visualLayerEdits(item??{},patch)){if(edit.actionId)updateAction(sceneId,edit.actionId,edit.patch);else updateBaseLayer(sceneId,layerId,edit.patch);}};
  const layer = characters.find((item) => item.id === activeLayerId) ?? (!action && !activeLayerId ? characters[0] : null);
  const character = project.characters.find((item) => item.id === layer?.characterId);
  const appearanceAction=scene.actions.find(item=>item.id===layer?.sourceActionId&&item.type==='showCharacter');

  return (
    <aside className="inspector">
      <div className="inspector-tabs"><button className={inspectorTab === "properties" ? "active" : ""} onClick={() => setInspectorTab("properties")}>Свойства</button><button className={inspectorTab === "resources" ? "active" : ""} onClick={() => setInspectorTab("resources")}>Сцена</button><button className={inspectorTab === "effects" ? "active" : ""} onClick={() => setInspectorTab("effects")}>Слои</button></div>
      {inspectorTab === "properties" && <div className="inspector-scroll">
        {selectedImage&&<ImageLayerFields scene={scene} layer={selectedImage}/>}
        {!selectedImage&&<section className="selected-object-card" data-editor-location={!action&&!layer?JSON.stringify(['background','__background']):undefined}><div className="object-avatar"><ActionIcon type={action?.type ?? "showCharacter"} /></div><div><strong>{action ? actionTypes.find(([type]) => type === action.type)?.[1] ?? "Действие" : character?.name ?? "Фон сцены"}</strong><span>{action ? "Блок сценария" : layer ? "Слой персонажа" : "Объект сцены"}</span></div></section>}
        {layer&&!action&&appearanceAction&&<section className="inspector-section"><Field label="Появление"><select value={appearanceAction.transition??'dissolve'} onChange={event=>updateAction(scene.id,appearanceAction.id,{transition:event.target.value})}><option value="none">Без анимации</option><option value="dissolve">Плавное появление</option><option value="moveinleft">Въезд слева</option><option value="moveinright">Въезд справа</option></select></Field></section>}
        {layer && !action && <section className="inspector-section"><h3>Положение и вид</h3><Field label="Название слоя"><input value={layer.name ?? character?.name ?? "Персонаж"} onChange={(event) => updateSceneCharacter(scene.id, layer.id, { name: event.target.value })} /></Field><Field label="Спрайт"><select value={layer.spriteId ?? ""} onChange={(event) => updateSceneCharacter(scene.id, layer.id, { spriteId: event.target.value || null })}><option value="">Основной спрайт</option>{character?.sprites.map((sprite) => <option value={sprite.id} key={sprite.id}>{sprite.name}</option>)}</select></Field><div className="field-grid"><Field label="X · %"><input type="number" value={layer.x} onChange={(event) => updateSceneCharacter(scene.id, layer.id, { x: Number(event.target.value) })} /></Field><Field label="Y · %"><input type="number" value={layer.y} onChange={(event) => updateSceneCharacter(scene.id, layer.id, { y: Number(event.target.value) })} /></Field></div><Field label={`Масштаб · ${layer.scale}%`}><input type="range" min="10" max="400" value={layer.scale} onChange={(event) => updateSceneCharacter(scene.id, layer.id, { scale: Number(event.target.value) })} /></Field><Field label={`Поворот · ${layer.rotation}°`}><input type="range" min="-180" max="180" value={layer.rotation} onChange={(event) => updateSceneCharacter(scene.id, layer.id, { rotation: Number(event.target.value) })} /></Field><Field label={`Прозрачность · ${layer.opacity}%`}><input type="range" value={layer.opacity} onChange={(event) => updateSceneCharacter(scene.id, layer.id, { opacity: Number(event.target.value) })} /></Field>{!layer.sourceActionId && <div className="layer-order-row"><button onClick={() => moveSceneCharacter(scene.id, layer.id, "up")}><ArrowUp />Выше</button><button onClick={() => moveSceneCharacter(scene.id, layer.id, "down")}><ArrowDown />Ниже</button><button className={layer.visible ? "active" : ""} onClick={() => updateSceneCharacter(scene.id, layer.id, { visible: !layer.visible })}><Eye />{layer.visible ? "Скрыть" : "Показать"}</button></div>}<div className="layer-toggle-row"><button className={layer.flip ? "active" : ""} onClick={() => updateSceneCharacter(scene.id, layer.id, { flip: !layer.flip })}>Отразить</button><button className={layer.locked ? "active" : ""} onClick={() => updateSceneCharacter(scene.id, layer.id, { locked: !layer.locked })}>{layer.locked ? "Разблокировать" : "Заблокировать"}</button>{!layer.sourceActionId && <button className="danger" aria-label="Удалить слой персонажа" disabled={layer.locked} onClick={() => removeSceneCharacter(scene.id, layer.id)}><Trash /></button>}</div>{scene.timelineEnabled && !layer.sourceActionId && <button className="button secondary wide" disabled={layer.locked} onClick={() => layerToTimeline(scene.id,layer.id)}>Перенести на временную шкалу</button>}</section>}
        {(!selectedImage && (!layer || action)) && <section className="inspector-section"><h3>{action ? "Настройки действия" : "Фон"}</h3>{action ? <ActionFields action={action} scene={scene} /> : <><div className="asset-field">{scene.background ? <img src={backgroundSource(project,scene)} alt="Миниатюра фона" /> : <ImageSquare aria-label="Фон не выбран"/>}<div><strong>Фон сцены</strong><span>{project.meta.resolution.width} × {project.meta.resolution.height}</span></div><FolderOpen /></div><Field label="Эффект появления"><select value={scene.transition} onChange={(event) => updateScene(scene.id, { transition: event.target.value })}><option value="fade">Плавное появление</option><option value="dissolve">Растворение</option><option value="flash">Вспышка</option><option value="none">Без эффекта</option></select></Field></>}{!action && <BackgroundFields value={visualFrame?visualFrame.backgroundTransform:scene.backgroundTransform} onChange={backgroundTransform=>{if(visualFrame?.backgroundActionId)updateAction(scene.id,visualFrame.backgroundActionId,{backgroundTransform});else updateScene(scene.id,{backgroundTransform});}}/>}</section>}


      </div>}
      {inspectorTab === "resources" && <div className="inspector-scroll"><section className="inspector-section"><h3>Настройки сцены</h3><Field label="Название сцены"><input value={scene.title} onChange={(event) => updateScene(scene.id, { title: event.target.value })} /></Field><Field label="Описание"><textarea rows="4" value={scene.description} onChange={(event) => updateScene(scene.id, { description: event.target.value })} /></Field></section><section className="inspector-section"><h3>Текстовое окно</h3><Field label="Положение"><select value={project.ui.dialoguePosition} onChange={(event) => updateUi({ dialoguePosition: event.target.value })}><option value="bottom">Внизу</option><option value="center">По центру</option><option value="top">Вверху</option></select></Field><Field label={`Прозрачность · ${project.ui.dialogueOpacity}%`}><input type="range" min="40" max="100" value={project.ui.dialogueOpacity} onChange={(event) => updateUi({ dialogueOpacity: Number(event.target.value) })} /></Field><div className="field-grid"><Field label="Размер текста"><input type="number" min="14" max="72" value={project.ui.dialogueFontSize} onChange={(event) => updateUi({ dialogueFontSize: Number(event.target.value) })} /></Field><Field label="Цвет текста"><input type="color" value={project.ui.dialogueTextColor} onChange={(event) => updateUi({ dialogueTextColor: event.target.value })} /></Field></div><Field label={`Скорость печати · ${project.ui.textSpeed}`}><input type="range" min="0" max="100" value={project.ui.textSpeed} onChange={(event) => updateUi({ textSpeed: Number(event.target.value) })} /></Field><AssetPicker title="Свой фон окна" value={project.ui.dialogueBackground} onChange={(dialogueBackground) => updateUi({ dialogueBackground })} /><label className="check-field"><input type="checkbox" checked={project.ui.showQuickMenu} onChange={(event) => updateUi({ showQuickMenu: event.target.checked })} /><span><Check />Показывать быстрое меню</span></label></section></div>}
      {inspectorTab === "effects" && <VisualLayers layers={[...characters,...images]} background={visualFrame?visualFrame.background:backgroundSource(project,scene)} onEdit={(id,patch)=>updateSceneCharacter(scene.id,id,patch)} />}
    </aside>
  );
}

function ResourceWorkspace({section,onSettings}) {
  const projectId=useProjectStore(state=>state.project.id);
  return <ResourceLibrary key={projectId} section={section} categories={resourceCategories} onProjectSettings={onSettings}/>;
}

function CharacterWorkspace() {
  const { project, selectedCharacterId, setSelectedCharacter, addCharacter, updateCharacter, removeCharacter, addCharacterSprite, removeCharacterSprite, activeSceneId, addSceneCharacter, setActiveSection, setBottomTab } = useProjectStore();
  const character = project.characters.find((item) => item.id === selectedCharacterId) ?? project.characters[0];
  const portraitInput = useRef();
  const spritesInput = useRef();
  const importPortrait = async (file) => { if (file && character) updateCharacter(character.id, { portrait: await readFileAsDataUrl(file) }); };
  const importSprites = async (files) => {
    const targetId = character?.id;
    if (!targetId) return;
    try { for (const file of Array.from(files ?? [])) {
      const source = await readFileAsDataUrl(file);
      const dimensions = await imageSize(source);
      if (!dimensions.width) throw new Error("Не удалось прочитать изображение " + file.name);
      addCharacterSprite(targetId, { name: file.name.replace(/\.[^.]+$/, ""), source, fileName: file.name });
    } } catch (error) { window.alert("Спрайт не загружен: " + error.message); }
    finally { if (spritesInput.current) spritesInput.current.value = ""; }
  };
  return <div className="character-workspace"><div className="character-list"><button className="button primary wide" onClick={addCharacter}><Plus />Новый персонаж</button>{project.characters.map((item) => <button key={item.id} className={character?.id === item.id ? "active" : ""} onClick={() => setSelectedCharacter(item.id)}>{resolveCharacterSprite(item,null,project.resources).source ? <img src={resolveCharacterSprite(item,null,project.resources).source} alt="" /> : <User />}<span><strong>{item.name}</strong><small>{item.sprites.length} спрайтов</small></span><i style={{ background: item.color }} /></button>)}</div>{character && <div className="character-editor" data-editor-location={JSON.stringify(['character',character.id])}><div className="character-form"><button className="portrait-picker" onClick={() => portraitInput.current?.click()}>{character.portrait ? <img src={character.portrait} alt={character.name} /> : <><User /><span>Добавить портрет</span></>}</button><div><Field label="Отображаемое имя"><input value={character.name} onChange={(event) => updateCharacter(character.id, { name: event.target.value })} /></Field><Field label="Внутреннее имя"><input value={character.internalName} onChange={(event) => updateCharacter(character.id, { internalName: event.target.value.replace(/\s+/g, "_") })} /></Field><div className="field-grid"><Field label="Цвет имени"><input type="color" value={character.color} onChange={(event) => updateCharacter(character.id, { color: event.target.value })} /></Field><Field label="Позиция по умолчанию"><select value={character.defaultPosition} onChange={(event) => updateCharacter(character.id, { defaultPosition: event.target.value })}><option value="left">Слева</option><option value="center">По центру</option><option value="right">Справа</option></select></Field></div><button className="button danger-button" onClick={() => { if (!removeCharacter(character.id)) window.alert("Персонаж используется в сценах или действиях. Сначала удалите его оттуда."); }}><Trash />Удалить персонажа</button></div></div><div className="sprites-header"><div><h2>Спрайты и эмоции</h2><p>Назовите состояния, например «Радость» или «Грусть». Основной спрайт используется по умолчанию.</p><p>Загрузка сохраняет спрайт в карточке героя. Чтобы показать героя, добавьте его на сцену.</p><button className="button primary" disabled={!activeSceneId || !resolveCharacterSprite(character, null, project.resources).source} onClick={() => { addSceneCharacter(activeSceneId, character.id); setBottomTab("scenario"); setActiveSection("scenes"); }}>Добавить на текущую сцену</button></div><button className="button secondary" onClick={() => spritesInput.current?.click()}><Plus />Добавить спрайты</button></div><div className="sprite-grid">{character.sprites.map((sprite) => <article key={sprite.id} data-editor-location={JSON.stringify(['sprite',sprite.id])}><div>{resolveCharacterSprite(character, sprite.id, project.resources).source ? <img src={resolveCharacterSprite(character, sprite.id, project.resources).source} alt={sprite.name} /> : <User />}</div><label className="sprite-name-label">Название спрайта<input aria-label="Название спрайта" value={sprite.name} onChange={(event) => updateCharacter(character.id, { sprites: character.sprites.map((item) => item.id === sprite.id ? { ...item, name: event.target.value } : item) })} /></label><button className="sprite-default-button" aria-pressed={resolveCharacterSprite(character, null, project.resources).sprite?.id === sprite.id} onClick={() => updateCharacter(character.id, { defaultSpriteId: sprite.id })}>{resolveCharacterSprite(character, null, project.resources).sprite?.id === sprite.id ? "✓ Основной спрайт" : "Сделать основным"}</button><button title="Удалить спрайт" onClick={() => { if (!removeCharacterSprite(character.id, sprite.id)) window.alert("Этот спрайт используется в сцене или действии. Сначала замените его."); }}><Trash /></button></article>)}<button className="sprite-add" onClick={() => spritesInput.current?.click()}><UploadSimple /><span>Загрузить PNG</span></button></div><input ref={portraitInput} hidden type="file" accept="image/*" onChange={(event) => importPortrait(event.target.files?.[0])} /><input ref={spritesInput} hidden multiple type="file" accept="image/png,image/webp" onChange={(event) => importSprites(event.target.files)} /></div>}</div>;
}

function LogicWorkspace() {
  const tab=useProjectStore(s=>s.logicTab),setTab=useProjectStore(s=>s.setLogicTab);
  const { project, addVariable, updateVariable, removeVariable, addFlag, updateFlag, removeFlag } = useProjectStore();
  return <div className="logic-workspace story-workspace"><div className="story-workspace-tabs"><button className={tab === "map" ? "active" : ""} onClick={() => setTab("map")}>Карта сюжета</button><button className={tab === "logic" ? "active" : ""} onClick={() => setTab("logic")}>Переменные и флаги</button><button className={tab === "inventory" ? "active" : ""} onClick={()=>setTab("inventory")}>Инвентарь</button></div>{tab === "inventory" ? <InventoryWorkspace/> : tab === "map" ? <div className="logic-map"><StoryMap /></div> : <section className="logic-panels"><div><div className="workspace-section-head"><div><h2>Переменные</h2><p>Числа, текст и переключатели без кода.</p></div><button onClick={() => addVariable("number")}><Plus /></button></div>{project.variables.map((item) => <div className="logic-row" key={item.id}><input value={item.name} onChange={(event) => updateVariable(item.id, { name: event.target.value })} /><select value={item.type} onChange={(event) => updateVariable(item.id, { type: event.target.value, initial: event.target.value === "number" ? 0 : event.target.value === "boolean" ? false : "" })}><option value="number">Число</option><option value="text">Текст</option><option value="boolean">Да / нет</option><option value="relationship">Отношения</option></select>{item.type === "boolean" ? <select value={String(item.initial)} onChange={(event) => updateVariable(item.id, { initial: event.target.value === "true" })}><option value="false">Нет</option><option value="true">Да</option></select> : <input value={item.initial} type={item.type === "number" || item.type === "relationship" ? "number" : "text"} onChange={(event) => updateVariable(item.id, { initial: item.type === "number" || item.type === "relationship" ? Number(event.target.value) : event.target.value })} />}<button className="logic-delete" onClick={() => { if (!removeVariable(item.id)) window.alert("Переменная используется в сценарии или условии."); }}><Trash /></button></div>)}</div><div><div className="workspace-section-head"><div><h2>Флаги и события</h2><p>Запоминайте важные решения игрока.</p></div><button onClick={addFlag}><Plus /></button></div>{project.flags.map((item) => <div className="logic-row flag-row" key={item.id}><input value={item.name} onChange={(event) => updateFlag(item.id, { name: event.target.value })} /><label><input type="checkbox" checked={item.initial} onChange={(event) => updateFlag(item.id, { initial: event.target.checked })} />Включён в начале</label><button className="logic-delete" onClick={() => { if (!removeFlag(item.id)) window.alert("Флаг используется в сценарии или результате выбора."); }}><Trash /></button></div>)}</div></section>}</div>;
}

function GalleryWorkspace() {
  const { project, addGallerySection, updateGallerySection, removeGallerySection, addGalleryItem, updateGalleryItem, removeGalleryItem, setActiveSection } = useProjectStore();
  const [sectionId, setSectionId] = useState(project.gallery.sections[0]?.id ?? null);
  const [resourceId, setResourceId] = useState("");
  const navigation=useProjectStore(s=>s.navigationTarget),request=useProjectStore(s=>s.navigationRequest);
  useEffect(()=>{if(navigation?.kind==='gallery'&&navigation.projectId===project.id)setSectionId(navigation.id);},[request,navigation,project.id]);
  const section = project.gallery.sections.find((item) => item.id === sectionId) ?? project.gallery.sections[0];
  const images = project.resources.filter((item) => ["cg", "background"].includes(item.category) && item.mime?.startsWith("image/"));
  useEffect(() => { if (!sectionId && project.gallery.sections[0]) setSectionId(project.gallery.sections[0].id); }, [sectionId, project.gallery.sections]);
  return <div className="gallery-workspace"><aside><button className="button primary wide" onClick={addGallerySection}><Plus />Новый раздел</button>{project.gallery.sections.map((item) => <button key={item.id} className={section?.id === item.id ? "active" : ""} onClick={() => setSectionId(item.id)}><ImageSquare /><span><strong>{item.title}</strong><small>{item.items.length} изображений</small></span></button>)}</aside>{section && <section data-editor-location={JSON.stringify(['gallery',section.id])}><div className="gallery-editor-head"><div><Field label="Название раздела"><input value={section.title} onChange={(event) => updateGallerySection(section.id, { title: event.target.value })} /></Field></div><button className="button danger-button" disabled={project.gallery.sections.length < 2} onClick={() => { removeGallerySection(section.id); setSectionId(project.gallery.sections.find((item) => item.id !== section.id)?.id); }}><Trash />Удалить раздел</button></div><div className="gallery-add-row"><select value={resourceId} onChange={(event) => setResourceId(event.target.value)}><option value="">Выберите CG или изображение</option>{images.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button className="button secondary" disabled={!resourceId} onClick={() => { addGalleryItem(section.id, resourceId); setResourceId(""); }}><Plus />Добавить в галерею</button><button className="button secondary" onClick={() => setActiveSection("resources")}><UploadSimple />Импортировать</button></div><div className="gallery-grid">{section.items.map((item,itemIndex) => { const resource = project.resources.find((entry) => entry.id === item.resourceId); return <article key={item.id??itemIndex} data-editor-location={JSON.stringify(['gallery',item.id??`index:${itemIndex}`])}><div>{resource?.source ? <img src={resource.source} alt={item.title} /> : <WarningCircle />}</div><input value={item.title} onChange={(event) => updateGalleryItem(section.id, item.id, { title: event.target.value })} /><label><input type="checkbox" checked={item.unlockMode === "seen"} onChange={(event) => updateGalleryItem(section.id, item.id, { unlockMode: event.target.checked ? "seen" : "always" })} />Открывать после показа в сюжете</label><button onClick={() => removeGalleryItem(section.id, item.id)}><Trash /></button></article>; })}{!section.items.length && <div className="gallery-empty"><ImageSquare /><strong>Раздел пока пуст</strong><span>Добавьте CG из ресурсов. В игре закрытые изображения будут скрыты до первого показа.</span></div>}</div></section>}</div>;
}

function InterfaceWorkspace() { return <GameUiWorkspace/>; }

function LibraryView({ section, onSettings }) {
  const { project } = useProjectStore();
  const labels = { project: ["Проект", "Название, иконка, курсор и параметры готовой игры", GearSix], story: ["Сюжет и логика", "Карта истории, переменные, флаги и условия", GitBranch], characters: ["Персонажи", "Герои, их имена, цвета и наборы спрайтов", Users], backgrounds: ["Фоны", "Все изображения сцен в одном месте", ImageSquare], music: ["Музыка", "Музыкальные темы и настройки воспроизведения", MusicNotes], sounds: ["Звуки", "Эффекты, окружение и голосовые файлы", SpeakerHigh], resources: ["Ресурсы", "Изображения, аудио, видео, шрифты и интерфейс", FolderSimple], gallery: ["Галерея", "Разделы CG и условия разблокировки", ImageSquare], interface: ["Интерфейс игры", "Главное меню, диалог, выборы и быстрые кнопки", Palette], settings: ["Настройки", "Поведение редактора и параметры проекта", GearSix] };
  const [title, subtitle, Icon] = labels[section] ?? labels.resources;
  return <main className="library-view"><header><div><Icon size={28} weight="duotone" /><div><h1>{title}</h1><p>{subtitle}</p></div></div>{["project", "settings"].includes(section) && <button className="button primary" onClick={onSettings}><GearSix />Настроить проект</button>}</header>{section==='settings'&&<div className="diagnostics-entry"><DiagnosticsButton/></div>}
    {section === "characters" ? <CharacterWorkspace /> : section === "story" ? <LogicWorkspace /> : section === "gallery" ? <GalleryWorkspace /> : section === "interface" ? <InterfaceWorkspace /> : ["resources", "backgrounds", "music", "sounds"].includes(section) ? <ResourceWorkspace section={section} onSettings={onSettings} /> : <div className="project-summary"><BookOpenText size={42} weight="duotone" /><div><h2>{project.meta.title}</h2><p>{project.meta.author} · версия {project.meta.version}</p><button className="button secondary" onClick={onSettings}>Открыть настройки проекта</button></div></div>}
  </main>;
}

function PreviewObjects({project,scene,state,onPropClick}) {
  const images=sceneImages(scene).filter(layer=>!state.hiddenProps?.includes(propKey(scene.id,layer.id))),order=scenePaintOrder(scene,state.layers,images,state.backgroundActionId);
  return <div className="visual-scene-objects">
    <div className="scene-background-clip" style={{zIndex:order.background}}>{state.background&&<img className="preview-background" style={backgroundStyle(state.backgroundTransform)} src={state.background} alt="Фон сцены"/>}</div>
    {state.layers.filter(l=>l.visible!==false).map(layer=>{const character=project.characters.find(c=>c.id===layer.characterId);const {source}=resolveCharacterSprite(character,layer.spriteId,project.resources);return <PreviewActor key={layer.characterId} layer={layer} character={character} source={source} paintIndex={order.characters.get(layer.characterId)} animation={state.animations?.[layer.characterId]} resolutionHeight={project.meta.resolution.height}/>;})}
    {images.filter(layer=>layer.visible).map(layer=>{const resource=project.resources.find(r=>r.id===(state.propImages?.[propKey(scene.id,layer.id)]??layer.resourceId));if(!resource?.source)return null;const style={position:'absolute',objectFit:'contain',objectPosition:'center bottom',...imageLayerStyle(layer),zIndex:order.images.get(layer.id)},active=state.waiting?.type==='explore'&&!state.cg&&availableReactions(scene.id,layer,state,(condition,s)=>conditionPass(condition,s,project)).length>0;return active?<button key={layer.id} className="preview-interactive-prop" aria-label={`Взаимодействовать: ${layer.name}`} style={style} onClick={event=>{event.stopPropagation();if(event.detail>0&&!opaquePropHit(event.currentTarget.querySelector('img'),layer,event,event.currentTarget.parentElement.getBoundingClientRect()))return;onPropClick(layer.id);}}><img crossOrigin="anonymous" src={resource.source} alt={layer.name}/></button>:<img key={layer.id} className="preview-prop" style={style} src={resource.source} alt={layer.name}/>;})}
  </div>;
}
function PreviewModal({ onClose }) {
  const { project, activeSceneId, activeActionId } = useProjectStore();
  const controls=usePreviewSession(project,activeSceneId),{state,setState,restart,panel,setPanel,preferences,session,mode,setMode}=controls;
  const previewFrame=useRef(null),[previewWidth,setPreviewWidth]=useState(1000);
  useEffect(()=>{const el=previewFrame.current;if(!el)return;const observer=new ResizeObserver(()=>setPreviewWidth(el.clientWidth));observer.observe(el);setPreviewWidth(el.clientWidth);return()=>observer.disconnect();},[]);
  const [runStatus, setRunStatus] = useState("");
  const [running, setRunning] = useState(false);
  const players = useRef(null);
  const rawAction = state.waiting?.type === "pause" ? state.displayText : state.waiting;
  const action=rawAction&&preferences.textSpeed!==null?{...rawAction,textStyle:{...rawAction.textStyle,speed:preferences.textSpeed}}:rawAction;
  const scene = project.scenes[state.sceneId];
  const speaker = project.characters.find((item) => item.id === action?.speakerId);
  const [voiceActive,setVoiceActive]=useState(false),previewDialog=useRef(null);
  useEffect(()=>{const previous=document.activeElement;previewDialog.current?.querySelector('[aria-label="Закрыть предпросмотр"]')?.focus();return()=>{if(previous?.isConnected)previous.focus();};},[]);
  useEffect(()=>{if(state.waiting?.type!=='pause'||panel)return;const timer=setTimeout(()=>setState(s=>advancePreview(project,s)),Math.max(.1,Number(state.waiting.duration)||.01)*1000);return()=>clearTimeout(timer);},[state.waiting,state.sceneId,panel]);
  useEffect(()=>{
    if(!mode||panel||state.ended||!controls.initialized)return;
    if(!['dialogue','narration'].includes(state.waiting?.type)){if(mode==='skip')setMode(null);return;}
    if(mode==='skip'&&preferences.skipSeenOnly&&!previewLineSeen(session)){setMode(null);controls.setError('Пропуск остановлен на непрочитанной реплике.');return;}
    if(mode==='auto'&&voiceActive)return;
    const speed=textAppearance(project,action).speed,delay=mode==='skip'?0.15:preferences.autoDelay+(speed?String(action.text??'').length/speed:0);
    const timer=setTimeout(()=>setState(s=>advancePreview(project,s)),delay*1000);return()=>clearTimeout(timer);
  },[state.waiting,state.sceneId,state.ended,mode,panel,preferences,voiceActive,controls.initialized]);
  useEffect(()=>{players.current=createPreviewAudio({onVoiceActive:setVoiceActive,onStatus:message=>setRunStatus(previous=>message||([AUDIO_BLOCKED,AUDIO_UNREADABLE].includes(previous)?'':previous))});return()=>{players.current?.dispose();players.current=null;};},[]);
  useEffect(()=>{if(controls.initialized)players.current?.update(state.audio,project.resources,preferences,state.audioStops);},[state.audio,state.audioStops,project.resources,preferences,controls.initialized]);
  const runRealPreview = async () => {
    const result=validateProject(project);
    if (!result.valid) {setRunStatus(`Исправьте ошибки проекта: ${result.summary.errors}.`);return;}
    setRunning(true);setRunStatus("Запускаем игру…");
    try { await window.istoriya.runPreview(project,state.sceneId,action?.id);setRunStatus("Игра открыта в отдельном окне."); }
    catch(error){setRunStatus(error.message || "Не удалось запустить игру");}
    finally {setRunning(false);}
  };
  const quickAction=id=>{controls.setError('');if(id==='rollback')controls.rollback();else if(['auto','skip'].includes(id))setMode(previous=>previous===id?null:id);else setPanel(id);};
  const keyDown=e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();if(panel)setPanel(null);else onClose();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s')e.preventDefault();if(e.key==='Tab'){const root=previewDialog.current,fields=[...root.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')].filter(el=>el.getClientRects().length),first=fields[0],last=fields.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};
  return <div className="modal-backdrop preview-backdrop" ref={previewDialog} role="dialog" aria-modal="true" aria-label="Предпросмотр игры" onKeyDown={keyDown}><div className="preview-window"><div className="preview-header"><strong>Предпросмотр · {scene?.title} · блок {state.index+1}</strong><div className="preview-actions">{window.istoriya?.runPreview && <button className="button primary" disabled={running} onClick={runRealPreview}>Открыть игру отдельно</button>}<button className="icon-button" aria-label="Закрыть предпросмотр" onClick={onClose}><X /></button></div></div>
    <div className="preview-debug-toolbar"><button onClick={()=>restart(project.chapters[0].scenes[0])}>С начала игры</button><button onClick={()=>restart(activeSceneId,activeActionId)}>С выбранного действия</button><StoryDestinationField compact project={project} label="Перейти к сцене" value={{sceneId:state.sceneId}} allowChapters={false} allowEmpty={false} onChange={({sceneId})=>restart(sceneId)}/><button onClick={()=>{setMode(null);setState(s=>advancePreview(project,s));}} disabled={state.ended || action?.type==="choice" || state.waiting?.type==="pause" || (action?.type==='explore'&&!explorationReady(action,state,project))}>Далее</button><button onClick={()=>setPanel('menu')}>Меню теста</button><button disabled={!session.past.length} onClick={controls.rollback}>Назад по тесту</button></div>
    {runStatus && <div className="preview-status">{runStatus}</div>}
    {controls.error&&!panel&&<div className="preview-status" role="alert">{controls.error}</div>}
    <div ref={previewFrame} className="preview-game" onClick={()=>!state.ended && !['pause','explore'].includes(state.waiting?.type) && setState(s=>advancePreview(project,s))} style={{aspectRatio:`${project.meta.resolution.width}/${project.meta.resolution.height}`}}>
      <PreviewGameplay project={project} scene={scene} state={state} setState={setState}>{onPropClick=><PreviewObjects project={project} scene={scene} state={state} onPropClick={onPropClick}/>}</PreviewGameplay>
      {state.cg && <img className="preview-cg" src={state.cg} alt="Иллюстрация" />}
      {["dialogue","narration"].includes(action?.type) && !state.ended && (project.ui.layout?.dialogue?.enabled?<GameDialogue project={project} action={action} character={action.type==='dialogue'?speaker:null} width={previewWidth} animate/>:<div className={`preview-dialogue position-${project.ui.dialoguePosition}`} style={{backgroundImage:project.ui.dialogueBackground ? `url(${project.ui.dialogueBackground})` : undefined,opacity:project.ui.dialogueOpacity/100}}>{action.type==="dialogue" && <strong style={{color:speaker?.color}}>{speaker?.name ?? "Автор"}</strong>}<StyledText project={project} action={action} animate factor={.75}>{action.text}</StyledText><span>Нажмите, чтобы продолжить</span></div>)}
      {action?.type==="choice" && !state.ended && (project.ui.layout?.choice?.enabled?<><GameDialogue project={project} action={{type:'narration',text:action.prompt}} width={previewWidth}/><GameChoices project={project} options={action.options} width={previewWidth} onChoose={id=>setState(s=>advancePreview(project,s,id))}/></>:<div className="preview-choice"><strong>{action.prompt}</strong>{action.options.map(option=><button key={option.id} onClick={(event)=>{event.stopPropagation();setState(s=>advancePreview(project,s,option.id));}}>{option.text}</button>)}</div>)}
      {!state.ended&&project.ui.layout?.quick?.enabled&&<GameQuick project={project} width={previewWidth} onAction={quickAction} mode={mode} disabled={{rollback:!session.past.length,save:state.waiting?.type==='pause'}}/>}
      {state.ended && <div className="preview-empty">{state.error ?? "Игра завершена"}</div>}
      {panel&&<PreviewSystemPanel key={panel} project={project} controls={controls}/>}
    </div>
    <details className="preview-debug"><summary>Переменные и флаги теста (не меняют проект)</summary>{project.variables.map(variable=><label key={variable.id}>{variable.name}<input value={String(state.variables[variable.id] ?? "")} onChange={e=>setState(s=>({...s,variables:{...s.variables,[variable.id]:["number","relationship"].includes(variable.type)?Number(e.target.value):variable.type==="boolean"?e.target.value==="true":e.target.value}}))} /></label>)}{project.flags.map(flag=><label key={flag.id}>{flag.name}<input type="checkbox" checked={Boolean(state.flags[flag.id])} onChange={e=>setState(s=>({...s,flags:{...s.flags,[flag.id]:e.target.checked}}))}/></label>)}</details>
  </div></div>;
}

function AssetPicker({ title, value, onChange }) {
  const inputRef = useRef();
  return <div className="asset-picker"><div className="asset-preview">{value ? <img src={value} alt={title} /> : <ImageSquare />}</div><div><strong>{title}</strong><span>{value ? "Файл загружен" : "Не выбран"}</span></div><button className="button secondary" onClick={() => inputRef.current?.click()}>Выбрать</button><input ref={inputRef} hidden type="file" accept="image/*" onChange={async (event) => { const file = event.target.files?.[0]; if (file) onChange(await readFileAsDataUrl(file)); }} /></div>;
}

function SettingsModal({ onClose }) {
  const { project, updateMeta, updateUi, updateEditor } = useProjectStore();
  const android = project.meta.android;
  const resolutionValue = resolutionPresets.find((item) => item.width === project.meta.resolution.width && item.height === project.meta.resolution.height)?.value ?? "custom";
  const selectResolution = (value) => {
    const preset = resolutionPresets.find((item) => item.value === value);
    if (preset) updateMeta({ resolution: { width: preset.width, height: preset.height } });
  };
  const setResolutionPart = (key, value) => updateMeta({ resolution: { ...project.meta.resolution, [key]: Math.max(320, Number(value) || 320) } });
  const setCursorHotspot = (key, value) => updateMeta({ cursorHotspot: { ...project.meta.cursorHotspot, [key]: Math.max(0, Number(value) || 0) } });
  const updateAndroid = (patch) => updateMeta({ android: { ...android, ...patch } });
  return <div className="modal-backdrop"><div className="dialog settings-dialog"><div className="dialog-header"><div><GearSix /><div><h2>Настройки проекта</h2><p>Название, экран, иконка и курсор готовой игры</p></div></div><button className="icon-button" onClick={onClose}><X /></button></div><div className="dialog-content two-column-form">
    <Field label="Название игры"><input value={project.meta.title} onChange={(event) => updateMeta({ title: event.target.value })} /></Field>
    <Field label="Автор"><input value={project.meta.author} onChange={(event) => updateMeta({ author: event.target.value })} /></Field>
    <Field label="Версия"><input value={project.meta.version} onChange={(event) => updateMeta({ version: event.target.value })} /></Field>
    <Field label="Папка сохранений"><input value={project.meta.saveDirectory ?? ""} placeholder="Автоматически по названию игры" onChange={(event) => updateMeta({ saveDirectory: event.target.value })} /></Field>
    <Field label="Описание игры" className="span-2"><textarea rows="3" value={project.meta.description ?? ""} onChange={(event) => updateMeta({ description: event.target.value })} /></Field>
    <Field label="Разрешение игры"><select value={resolutionValue} onChange={(event) => selectResolution(event.target.value)}>{resolutionPresets.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}<option value="custom">Своё разрешение</option></select></Field>
    <Field label="Режим запуска"><select value={project.meta.windowMode} onChange={(event) => updateMeta({ windowMode: event.target.value })}><option value="windowed">В окне</option><option value="fullscreen">На весь экран</option></select></Field>
    {resolutionValue === "custom" && <><Field label="Ширина"><input type="number" min="320" value={project.meta.resolution.width} onChange={(event) => setResolutionPart("width", event.target.value)} /></Field><Field label="Высота"><input type="number" min="320" value={project.meta.resolution.height} onChange={(event) => setResolutionPart("height", event.target.value)} /></Field></>}
    <Field label="Оптимизация сборки"><select value={project.meta.buildQuality ?? "balanced"} onChange={(event) => updateMeta({ buildQuality: event.target.value })}><option value="original">Оригинальное качество</option><option value="balanced">Сбалансированная</option><option value="compact">Уменьшенный размер</option></select></Field>
    <Field label="Автосохранение"><select value={project.editor.autosaveSeconds} onChange={(event) => updateEditor({ autosaveSeconds: Number(event.target.value) })}><option value="1">Каждую секунду</option><option value="3">Через 3 секунды</option><option value="10">Через 10 секунд</option><option value="30">Через 30 секунд</option><option value="60">Через минуту</option></select></Field>
    <div className="settings-note"><CheckCircle weight="fill" /><span>Эти параметры попадут в Windows, Linux, macOS и Android-сборки автоматически.</span></div>
    <AssetPicker title="Иконка игры" value={project.meta.icon} onChange={(icon) => updateMeta({ icon })} />
    <AssetPicker title="Курсор игрока" value={project.meta.cursor} onChange={(cursor) => updateMeta({ cursor })} />
    <AssetPicker title="Фон главного меню" value={project.ui.mainMenuBackground} onChange={(mainMenuBackground) => updateUi({ mainMenuBackground })} />
    {project.meta.cursor && <div className="cursor-hotspot span-2"><span>Активная точка курсора</span><label>X<input type="number" min="0" value={project.meta.cursorHotspot?.x ?? 0} onChange={(event) => setCursorHotspot("x", event.target.value)} /></label><label>Y<input type="number" min="0" value={project.meta.cursorHotspot?.y ?? 0} onChange={(event) => setCursorHotspot("y", event.target.value)} /></label><small>Обычно 0 × 0 — верхний левый угол.</small></div>}
    <div className="form-section-title span-2"><AndroidLogo weight="duotone" /><span><strong>Android</strong><small>Параметры приложения и формат публикации</small></span></div>
    <Field label="ID приложения"><input value={android.packageName} spellCheck="false" placeholder="com.company.game" onChange={(event) => updateAndroid({ packageName: event.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, "_") })} /></Field>
    <Field label="Код версии"><input type="number" min="1" step="1" value={android.versionCode} onChange={(event) => updateAndroid({ versionCode: Math.max(1, Math.round(Number(event.target.value) || 1)) })} /></Field>
    <Field label="Ориентация"><select value={android.orientation} onChange={(event) => updateAndroid({ orientation: event.target.value })}><option value="sensorLandscape">Альбомная, обе стороны</option><option value="landscape">Альбомная</option><option value="sensorPortrait">Портретная, обе стороны</option><option value="portrait">Портретная</option><option value="sensor">Автоматически</option></select></Field>
    <Field label="Формат Android"><select value={android.buildFormat} onChange={(event) => updateAndroid({ buildFormat: event.target.value })}><option value="apk">APK — установка на устройство</option><option value="aab">AAB — публикация в магазине</option></select></Field>
    <div className="settings-note android-key-note span-2"><WarningCircle weight="fill" /><span>При первой Android-сборке «История» создаст постоянный ключ подписи. Сохраните его резервную копию: без прежнего ключа магазин не примет обновление игры.</span></div>
  </div><div className="dialog-footer"><ProfileStorageButton/><DiagnosticsButton className="button secondary diagnostics-footer"/><button className="button secondary" onClick={onClose}>Закрыть</button><button className="button primary" onClick={onClose}><Check />Готово</button></div></div></div>;
}

function BuildModal({ onClose, onExport }) {
  const { project } = useProjectStore();
  const [selected, setSelected] = useState("windows");
  const [status, setStatus] = useState({ state: "idle", message: "" });
  const desktop = Boolean(window.istoriya?.buildGame);
  const supported = new Set(window.istoriya?.buildTargets ?? ["windows", "linux", "macos", "android"]);
  const platforms = [{ id: "windows", title: "Windows", text: "x64 · ZIP с .exe", icon: Desktop }, { id: "macos", title: "macOS", text: "Universal · ZIP с .app", icon: AppleLogo }, { id: "linux", title: "Linux", text: "x64 · tar.bz2", icon: LinuxLogo }, { id: "android", title: "Android", text: `${project.meta.android.buildFormat.toUpperCase()} · подписанная сборка`, icon: AndroidLogo }, { id: "web", title: "Web", text: "браузерная версия · позже", icon: GlobeHemisphereWest }].map((item) => ({ ...item, ready: supported.has(item.id) }));
  const platform = platforms.find((item) => item.id === selected);
  const projectSize = projectResourceSize(project);
  const build = async () => {
    if (!platform?.ready) { setStatus({ state: "error", message: "Эта платформа пока не подключена к модулю сборки." }); return; }
    const validation = validateProject(project);
    if (!validation.valid) { setStatus({ state: "error", message: `Сборка остановлена: найдено ошибок — ${validation.summary.errors}. Откройте «Проверить проект» и исправьте их.` }); return; }
    if (!desktop) {
      const result = await onExport();
      setStatus(result.error ? {state:"error",message:result.error} : result.canceled ? {state:"idle",message:"Сохранение отменено."} : {state:"success",message:"Файл проекта подготовлен. Настольная версия соберёт из него готовую игру."});
      return;
    }
    setStatus({ state: "building", message: "Проверяем сцены и собираем самостоятельную игру…" });
    try {
      const result = await window.istoriya.buildGame(project, selected);
      if (result.canceled) setStatus({ state: "idle", message: "Сборка отменена." });
      else setStatus({ state: "success", message: selected === "android" ? `Готово: ${result.packagePath}\nКлюч подписи: ${result.keyDir}. Обязательно сохраните его резервную копию.` : `Готово: ${result.packagePath}` });
    } catch (error) {
      setStatus({ state: "error", message: error?.message || "Не удалось собрать игру." });
    }
  };
  const buildNote = selected === "macos" ? "Готовый ZIP содержит приложение .app. Для публичного распространения вне App Store потребуется подпись и нотариализация Apple." : selected === "linux" ? "Готовый tar.bz2 содержит самостоятельную Linux-игру и не требует установленного Ren’Py." : selected === "android" ? `${project.meta.android.buildFormat.toUpperCase()} будет подписан постоянным ключом проекта. Не удаляйте ключ — он нужен для будущих обновлений.` : "Готовый ZIP содержит .exe и запускается без Python, редактора и установленного Ren’Py.";
return <div className="modal-backdrop"><div className="dialog build-dialog"><div className="dialog-header"><div><Package /><div><h2>Собрать игру</h2><p>{project.meta.title} · версия {project.meta.version}</p></div></div><button className="icon-button" onClick={onClose} aria-label="Закрыть"><X /></button></div><div className="build-layout"><div className="platform-list">{platforms.map(({ id, title, text, icon: Icon, ready }) => <button key={id} className={selected === id ? "active" : ""} onClick={() => { setSelected(id); setStatus({ state: "idle", message: "" }); }}><Icon /><span><strong>{title}</strong><small>{text}</small></span>{ready ? <CheckCircle weight="fill" /> : <WarningCircle />}</button>)}</div><div className="build-summary"><div className="build-mark"><Package weight="duotone" /></div><h3>Сборка для {platform?.title}</h3><p>Редактор проверит сцены и подготовит самостоятельную игру с вашими ресурсами.</p><div className="build-info"><span>Разрешение<strong>{project.meta.resolution.width} × {project.meta.resolution.height}</strong></span><span>Сцен<strong>{Object.keys(project.scenes).length}</strong></span><span>Ресурсы<strong>{formatBytes(projectSize)}</strong></span></div><button className="button primary wide" onClick={build} disabled={status.state === "building"}><Package />{status.state === "building" ? "Собираем…" : desktop ? `Собрать для ${platform?.title}` : "Сохранить проект"}</button>{status.state==='error'&&<DiagnosticsButton/>}{status.message && <div className={`build-status ${status.state}`}>{status.state === "building" && <ClockCountdown />}{status.message}</div>}<small>{desktop ? (platform?.ready ? buildNote : "Платформа требует дополнительной настройки модуля сборки.") : "В браузере сохраняется переносимый проект. Полная настольная версия выполняет сборку автоматически."}</small></div></div></div></div>;
}

function ValidationModal({ onClose }) {
  const { project, setActiveScene, setActiveSection, setSelectedResource, setSelectedCharacter, setActiveAction,selectVisualLayer,setLogicTab,setSelectedInventory } = useProjectStore();
  const result = useMemo(() => validateProject(project), [project]);
  const openIssue = (item) => {
    if(item.uiScreen){useProjectStore.getState().setUiScreen(item.uiScreen);useProjectStore.getState().setUiElement(item.uiScreen==='menu'?'button:start':item.uiScreen==='dialogue'?'window':item.uiScreen==='pause'?'title':['choice','quick'].includes(item.uiScreen)?'screen':'content');setActiveSection('interface');onClose();return;}
    if (item.sceneId) { setActiveScene(item.sceneId); if (item.actionId) setActiveAction(item.actionId); if(item.layerId)selectVisualLayer(item.layerId); }
    else if(item.itemId){setSelectedInventory(item.itemId);setLogicTab('inventory');setActiveSection('story');}
    else if (item.resourceId) { setSelectedResource(item.resourceId); setActiveSection("resources"); }
    else if (item.characterId) { setSelectedCharacter(item.characterId); setActiveSection("characters"); }
    else return;
    onClose();
  };
  return <div className="modal-backdrop"><div className="dialog validation-dialog"><div className="dialog-header"><div><CheckCircle weight="duotone" /><div><h2>Проверка проекта</h2><p>{result.valid ? "Критических ошибок нет" : "Перед сборкой исправьте ошибки"}</p></div></div><button className="icon-button" onClick={onClose}><X /></button></div><div className="validation-summary"><div className={result.summary.errors ? "bad" : "good"}><strong>{result.summary.errors}</strong><span>Ошибок</span></div><div className={result.summary.warnings ? "warn" : "good"}><strong>{result.summary.warnings}</strong><span>Предупреждений</span></div><div><strong>{Object.keys(project.scenes).length}</strong><span>Сцен проверено</span></div></div><div className="validation-list">{!result.issues.length && <div className="validation-empty"><CheckCircle weight="fill" /><strong>Проект готов к сборке</strong><span>Все ссылки, ресурсы и переходы корректны.</span></div>}{result.issues.map((item,index) => <button key={`${item.id}:${index}`} className={item.severity} onClick={() => openIssue(item)} disabled={!item.sceneId && !item.resourceId && !item.characterId && !item.itemId && !item.uiScreen}><span>{item.severity === "error" ? <WarningCircle weight="fill" /> : <WarningCircle />}</span><div><strong>{item.severity === "error" ? "Ошибка" : "Предупреждение"}</strong><p>{item.message}</p></div>{(item.sceneId || item.resourceId || item.characterId || item.itemId || item.uiScreen) && <CaretRight />}</button>)}</div><div className="dialog-footer"><button className="button primary" onClick={onClose}>Закрыть</button></div></div></div>;
}

export function App() {
  const { saveState, saveError, project, activeSection, bottomTab, activeSceneId, importProject, newProject, openProject, undo, redo, saveNow } = useProjectStore();
  const [view, setView] = useState("home");
  const recovery=useProjectStore(state=>state.recovery);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const importInput = useRef();
  const actionClipboard = useRef(null);
  const openFile = async () => {
    if (!window.istoriya?.openProject) { importInput.current?.click(); return; }
    try { const loaded = await window.istoriya.openProject(); if (loaded) { await importProject(loaded); setView("editor"); setToast("Проект открыт"); } }
    catch (error) { setToast(error.message || "Не удалось открыть проект"); }
  };
  const onExport = async () => {
    try {
    if (window.istoriya?.saveProject) {
      const result = await window.istoriya.saveProject(project);
      if (!result.canceled) setToast("Проект сохранён");
      return result;
    }
    downloadJson(project);
    setToast("Файл проекта подготовлен");
    return { canceled: false };
    } catch (error) {
      const message=error.message || "Не удалось экспортировать проект";
      setToast(message);
      return {canceled:true,error:message};
    }
  };

  useEffect(() => {
    const handler = async (event) => {
      if(event.defaultPrevented)return;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(event.target?.tagName) || event.target?.isContentEditable;
      const workspace=useProjectStore.getState(),sceneKeys=workspace.activeSection==='scenes'&&workspace.bottomTab!=='map';
      const key = event.key.toLowerCase();
      if((event.ctrlKey||event.metaKey)&&event.shiftKey&&key==='f'&&view==='editor'&&!modal&&!recovery&&!document.querySelector('[role="dialog"]')){event.preventDefault();setModal('search');return;}
      if(view!=='editor'||modal||document.querySelector('[role="dialog"]'))return;
      if (event.key === "F5") { event.preventDefault(); setModal("preview"); return; }
      if (event.key === "Delete" && !typing && sceneKeys) {
        const state = useProjectStore.getState();
        if (state.activeLayerId) {
          const scene=state.project.scenes[state.activeSceneId];
          const image=scene.images?.find(layer=>layer.id===state.activeLayerId);if(image){if(!image.locked)state.removeSceneImage(scene.id,image.id);return;}
          const frame=!scene.timelineEnabled?storyboardFrames(state.project,scene).find(item=>item.action.id===state.activeActionId)?.frame:null;
          const layer=(frame?.layers??scene.characters??[]).find(item=>item.id===state.activeLayerId);
          if(layer?.locked) return;
          if(layer?.sourceActionId) state.removeAction(scene.id,layer.sourceActionId);
          else state.removeSceneCharacter(scene.id,state.activeLayerId);
        } else if (state.activeActionId) state.removeAction(state.activeSceneId, state.activeActionId);
        return;
      }
      if (!event.ctrlKey) return;
      if (key === "s") { event.preventDefault(); setToast(await saveNow() ? "Проект сохранён" : "Не удалось сохранить проект. Скачайте резервную копию."); }
      if (key === "z") { event.preventDefault(); undo(); }
      if (key === "y") { event.preventDefault(); redo(); }
      if (key === "f") { event.preventDefault(); document.querySelector(".search-field input")?.focus(); }
      if (key === "c" && !typing && sceneKeys) { const state = useProjectStore.getState(); const action = state.project.scenes[state.activeSceneId]?.actions.find((item) => item.id === state.activeActionId); if (action) { actionClipboard.current = structuredClone(action); setToast("Действие скопировано"); } }
      if (key === "v" && !typing && sceneKeys && actionClipboard.current) { event.preventDefault(); const state = useProjectStore.getState(); state.pasteAction(state.activeSceneId, actionClipboard.current); setToast("Действие вставлено"); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [saveNow, undo, redo, view, modal, recovery]);

  useEffect(() => { if (!toast) return undefined; const timer = setTimeout(() => setToast(null), 2400); return () => clearTimeout(timer); }, [toast]);
  const mainWorkspace = useMemo(() => activeSection === "scenes", [activeSection]);
  const mapWorkspace = mainWorkspace && bottomTab === "map";
  const openImportedProject = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try { const parsed=JSON.parse(await file.text());await importProject(window.istoriya?.prepareImportedProject?.(parsed)??parsed); setView("editor"); setToast("Проект открыт"); }
    catch (error) { setToast(error.message || "Не удалось открыть файл проекта"); }
    event.target.value = "";
  };

  const saveFailure = saveState === "error" && <div className="save-failure-banner" role="alert"><span><strong>Изменения не сохранены.</strong> {saveError || "Ошибка записи. Не закрывайте редактор."}</span><button className="button secondary" onClick={saveNow}>Повторить сохранение</button><RecoveryBackupButton/><DiagnosticsButton/></div>;
  if(recovery)return <StartupRecovery onResolved={decision=>setView(decision==='restore'?'editor':'home')}/>;
  if (view === "home") return <>{saveFailure}<ProjectHub onNewProject={async (template) => { const next = await newProject(template); if (next.meta.projectFolder && window.istoriya?.createProjectOnDisk) { await window.istoriya.createProjectOnDisk(next); await saveNow(); } setView("editor"); }} onOpenProject={async (projectId) => { try { if (await openProject(projectId)) setView("editor"); } catch(error) { setToast(error.message); } }} onOpenFile={openFile} /><input ref={importInput} hidden type="file" accept=".vnproject,application/json" onChange={openImportedProject} />{toast && <div className="toast"><CheckCircle weight="fill" />{toast}</div>}</>;

  return (
    <WorkspaceLayout inspector={mainWorkspace && !mapWorkspace} className={`${mainWorkspace ? "" : "library-mode"} ${mapWorkspace ? "map-mode" : ""}`}>{saveFailure}<ProjectFonts project={project}/><EditorNavigationFocus/><TopBar onSearch={()=>setModal('search')} onPreview={() => setModal("preview")} onBuild={() => setModal("build")} onValidate={() => setModal("validation")} onSettings={() => setModal("settings")} onExport={onExport} onImport={openFile} onHome={async () => { if (await saveNow()) setView("home"); else setToast("Не удалось сохранить проект."); }} /><NavigationRail /><ProjectTree />
      {mainWorkspace ? <EditorWorkspace map={mapWorkspace} scene={<SceneCanvas onBackgroundPick={() => setModal('background')} />}><ScenarioEditor /></EditorWorkspace> : <LibraryView section={activeSection} onSettings={() => setModal("settings")} />}
      {mainWorkspace && !mapWorkspace && <Inspector />}
      {modal==='background'&&<BackgroundPicker sceneId={activeSceneId} onClose={()=>setModal(null)}/>}
      <input ref={importInput} hidden type="file" accept=".vnproject,application/json" onChange={openImportedProject} />
      {modal === "search"&&<ProjectSearch onClose={()=>setModal(null)}/>}{modal === "preview" && <PreviewModal onClose={() => setModal(null)} />}{modal === "settings" && <SettingsModal onClose={() => setModal(null)} />}{modal === "build" && <BuildModal onClose={() => setModal(null)} onExport={onExport} />}{modal === "validation" && <ValidationModal onClose={() => setModal(null)} />}{toast && <div className="toast"><CheckCircle weight="fill" />{toast}</div>}
    </WorkspaceLayout>
  );
}
