import { canvasTransform } from "./domain/canvasTransform.js";
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
import { initialPreview, advancePreview } from "./domain/preview.js";
import { ActionPicker } from "./components/ActionPicker.jsx";
import { TextAppearance, StyledText, ProjectFonts } from "./components/TextAppearance.jsx";
import { EditorContextMenu, CharacterPicker, sceneMenuItems } from "./components/EditorContextMenu.jsx";
import { timelineFrame } from "./domain/timeline.js";
import { EditorWorkspace } from "./components/EditorWorkspace.jsx";
import { TimelineEditor } from "./components/TimelineEditor.jsx";
import { StoryMap } from "./components/StoryMap.jsx";

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
  ["all", "Все"], ["background", "Фоны"], ["sprite", "Спрайты"], ["cg", "Иллюстрации"],
  ["music", "Музыка"], ["sound", "Звуки"], ["voice", "Озвучка"], ["ui", "Интерфейс"],
  ["video", "Видео"], ["font", "Шрифты"], ["icon", "Иконки"],
];

const actionTypes = [
  ["dialogue", "Диалог"], ["narration", "Текст автора"], ["choice", "Выбор игрока"],
  ["showCharacter", "Показать персонажа"], ["hideCharacter", "Скрыть персонажа"], ["changeSprite", "Изменить спрайт"], ["moveCharacter", "Переместить персонажа"], ["characterAnimation", "Анимация персонажа"], ["background", "Изменить фон"], ["showCG", "Показать CG"], ["hideCG", "Скрыть CG"],
  ["music", "Запустить музыку"], ["stopMusic", "Остановить музыку"], ["sound", "Запустить звук"], ["ambience", "Фоновый звук"], ["pause", "Пауза"], ["voice", "Запустить озвучку"],
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

function categoryForFile(file, preferred) {
  if (preferred && preferred !== "all" && !["resources", "project", "settings", "story"].includes(preferred)) return preferred;
  if (file.type.startsWith("audio/")) return "sound";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("font/") || /\.(ttf|otf|woff2?)$/i.test(file.name)) return "font";
  return "background";
}

async function optimizeImage(source, width, height, maxWidth, maxHeight, mime) {
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  if (scale >= 1) return { source, width, height };
  const image = new Image();
  await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = source; });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
  return { source: canvas.toDataURL(mime === "image/png" ? "image/png" : "image/webp", .9), width: canvas.width, height: canvas.height };
}

async function fileToResource(file, preferredCategory, project) {
  let source = await readFileAsDataUrl(file);
  let dimensions = file.type.startsWith("image/") ? await imageSize(source) : { width: null, height: null };
  const category = categoryForFile(file, preferredCategory);
  if (project && dimensions.width && ["background", "cg", "ui"].includes(category) && (dimensions.width > project.meta.resolution.width * 2 || dimensions.height > project.meta.resolution.height * 2)) {
    const optimize = window.confirm(`Изображение ${dimensions.width}×${dimensions.height} значительно больше разрешения проекта ${project.meta.resolution.width}×${project.meta.resolution.height}.\n\nСоздать оптимизированную копию? Нажмите «Отмена», чтобы сохранить оригинал.`);
    if (optimize) {
      const optimized = await optimizeImage(source, dimensions.width, dimensions.height, project.meta.resolution.width * 1.5, project.meta.resolution.height * 1.5, file.type);
      source = optimized.source; dimensions = { width: optimized.width, height: optimized.height };
    }
  }
  const size = source.startsWith("data:") ? Math.round((source.length - source.indexOf(",") - 1) * .75) : file.size;
  return { name: file.name.replace(/\.[^.]+$/, ""), fileName: file.name, category, source, mime: file.type || "application/octet-stream", size, ...dimensions };
}

function formatBytes(size = 0) {
  if (!size) return "встроенный";
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} КБ`;
  return `${(size / 1024 / 1024).toFixed(1)} МБ`;
}

function projectResourceSize(project) { return (project.resources ?? []).reduce((sum, item) => sum + (Number(item.size) || 0), 0); }

function resourceUsageCount(project, resource) {
  let count = 0;
  for (const scene of Object.values(project.scenes)) {
    if (scene.background === resource.source || scene.backgroundResourceId === resource.id) count += 1;
    count += scene.actions.filter((action) => action.assetId === resource.id || action.voiceAssetId === resource.id).length;
  }
  for (const character of project.characters) {
    if (character.portraitResourceId === resource.id || character.portrait === resource.source) count += 1;
    count += character.sprites.filter((sprite) => sprite.resourceId === resource.id || sprite.source === resource.source).length;
  }
  if (project.ui.dialogueBackgroundResourceId === resource.id || project.ui.mainMenuBackgroundResourceId === resource.id) count += 1;
  return count;
}

function resourceUsages(project, resource) {
  const usages = [];
  for (const scene of Object.values(project.scenes)) {
    if (scene.background === resource.source || scene.backgroundResourceId === resource.id) usages.push({ kind: "scene", id: scene.id, label: `Фон сцены «${scene.title}»` });
    for (const action of scene.actions) if (action.assetId === resource.id || action.voiceAssetId === resource.id) usages.push({ kind: "scene", id: scene.id, actionId: action.id, label: `Действие в сцене «${scene.title}»` });
  }
  for (const character of project.characters) {
    if (character.portraitResourceId === resource.id || character.portrait === resource.source) usages.push({ kind: "character", id: character.id, label: `Портрет «${character.name}»` });
    for (const sprite of character.sprites) if (sprite.resourceId === resource.id || sprite.source === resource.source) usages.push({ kind: "character", id: character.id, label: `Спрайт «${sprite.name}» · ${character.name}` });
  }
  for (const section of project.gallery.sections) for (const item of section.items) if (item.resourceId === resource.id) usages.push({ kind: "gallery", id: section.id, label: `Галерея «${section.title}»` });
  return usages;
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

function TopBar({ onPreview, onBuild, onValidate, onSettings, onExport, onImport, onHome }) {
  const { project, activeSceneId, saveState, undo, redo, saveNow, past, future } = useProjectStore();
  const activeScene = project.scenes[activeSceneId];
  return (
    <header className="topbar">
      <AppLogo onClick={onHome} />
      <div className="project-title"><strong>{project.meta.title}</strong><CaretDown size={14} /></div>
      <div className="scene-crumb">Сцена {activeScene?.number ?? "—"} — {activeScene?.title ?? "Без названия"}</div>
      <div className={`save-state ${saveState}`}>{saveState === "error" ? <WarningCircle size={16} weight="fill" /> : <CheckCircle size={16} weight="fill" />}{saveState === "saved" ? "Все изменения сохранены" : saveState === "error" ? "Не хватает места для автосохранения" : "Сохраняем…"}</div>
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
  const [page, setPage] = useState("home");
  const [settings, setSettings] = useState(false);
  const [query, setQuery] = useState("");
  const [wizard, setWizard] = useState(null);
  const [projectTitle, setProjectTitle] = useState("Новая история");
  const [projectAuthor, setProjectAuthor] = useState("Автор проекта");
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
    { id: "classic", title: "Классическая", note: "16:9 · диалоги и выборы", image: "./assets/demo-aurora.png" },
    { id: "minimal", title: "Минималистичная", note: "Чистый интерфейс", image: "./assets/demo-aurora.png" },
    { id: "romance", title: "Романтическая", note: "Мягкий интерфейс", image: "./assets/demo-campfire.png" },
    { id: "horror", title: "Хоррор", note: "Тёмная атмосфера", image: "./assets/demo-campfire.png" },
    { id: "cinematic", title: "Кинематографичная", note: "Акцент на сценах", image: "./assets/demo-campfire.png" },
    { id: "vertical", title: "Вертикальная", note: "1080 × 1920", image: "./assets/demo-aurora.png" },
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
  const projectPreview = (project) => project.scenes?.scene_fire?.background ?? Object.values(project.scenes ?? {})[0]?.background ?? null;
  const modified = (project) => project.meta.modifiedAt ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(project.meta.modifiedAt)) : "Недавно";
  return <div className="home-shell">
    <aside className="home-sidebar"><AppLogo /><nav>{[["home", "Главная", House], ["projects", "Мои проекты", FilmSlate], ["templates", "Шаблоны", Palette], ["learn", "Обучение", BookOpenText]].map(([id, label, Icon]) => <button key={id} className={page === id ? "active" : ""} onClick={() => setPage(id)}><Icon />{label}</button>)}</nav><div className="home-sidebar-note"><strong>История</strong><span>Версия 0.1 · Ren’Py 8.5</span></div></aside>
    <main className={`home-main home-page-${page}`}>
      {settings && <SettingsModal onClose={() => setSettings(false)} />}
      {page === "learn" && <section className="learning-guide"><h2>Ваша первая новелла</h2><ol><li>Создайте проект: выберите шаблон, название и разрешение.</li><li>Загрузите изображения и звук через «Ресурсы», добавьте героев и спрайты через «Персонажи».</li><li>Выберите сцену. Настройте фон и персонажей в правой панели.</li><li>Нажмите «Добавить действие»: создайте диалог или выбор, затем отредактируйте его справа.</li><li>Для ветвления укажите у варианта выбора следующую сцену. Карта сюжета покажет связи.</li><li>Нажмите «Проверить проект» и «Запустить». Настольная версия запускает игру в Ren’Py.</li><li>В «Собрать игру» выберите платформу и папку результата.</li></ol><p>Ctrl+S — сохранить · Ctrl+Z — отменить · Ctrl+Y — повторить · F5 — предпросмотр.</p><button className="button primary" onClick={() => onNewProject("tutorial")}>Открыть учебный проект</button></section>}
      <header className="home-header"><div><h1>{{home: "Добро пожаловать", projects: "Мои проекты", templates: "Шаблоны", learn: "Обучение"}[page]}</h1><p>Продолжите историю или начните новую — без единой строки кода.</p></div><button className="home-settings" title="Настройки текущего проекта" onClick={() => setSettings(true)}><GearSix /></button></header>
      <section className="quick-start">
        <button className="create-project-card" onClick={() => startWizard("empty")}><span><Plus weight="bold" /></span><div><strong>Новый проект</strong><small>Создать визуальную новеллу</small></div></button>
        <button className="quick-card" onClick={onOpenFile}><FolderOpen weight="duotone" /><div><strong>Открыть проект</strong><small>Файл .vnproject</small></div></button>
        <button className="quick-card" onClick={() => onNewProject("tutorial")}><Play weight="duotone" /><div><strong>Учебный проект</strong><small>Попробовать готовый пример</small></div></button>
      </section>
      <section className="home-section recent-projects"><div className="home-section-title"><div><h2>Недавние проекты</h2><span>{projects.length} {projects.length === 1 ? "проект" : "проектов"}</span></div><label className="home-search"><MagnifyingGlass /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск проектов" /></label></div>
        <div className="project-grid">{visibleProjects.map((project) => <button className="project-card" key={project.id} onClick={() => onOpenProject(project.id)}><div className="project-cover">{projectPreview(project) ? <img src={projectPreview(project)} alt="" /> : <BookOpenText size={48} />}<span>{project.meta.resolution?.width ?? 1920} × {project.meta.resolution?.height ?? 1080}</span></div><div className="project-card-info"><strong>{project.meta.title}</strong><small>Изменён {modified(project)}</small></div></button>)}
          {!visibleProjects.length && <div className="empty-projects"><FilmSlate /><strong>Проекты не найдены</strong><span>Создайте новый проект или измените запрос.</span></div>}
        </div>
      </section>
      <section className="home-section templates-section"><div className="home-section-title"><div><h2>Начать с шаблона</h2><span>Все элементы можно изменить</span></div></div><div className="template-row">{templates.map((template) => <button key={template.id} onClick={() => startWizard(template.id)}><img src={template.image} alt="" /><span><strong>{template.title}</strong><small>{template.note}</small></span><Plus /></button>)}</div></section>
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
  const { project, activeSceneId, setActiveScene, addScene, removeScene, moveScene, addChapter, updateChapter, moveChapter, removeChapter, activeSection, setActiveSection } = useProjectStore();
  const [query, setQuery] = useState("");
  const sidebarNav = [
    { id: "story", label: "Сюжет", note: "Структура и логика", icon: GitBranch },
    { id: "scenes", label: "Сцены", note: "Визуальные эпизоды", icon: FilmSlate },
    { id: "characters", label: "Персонажи", note: "Герои и их свойства", icon: Users },
    { id: "resources", label: "Ресурсы", note: "Фоны, музыка, звуки", icon: ImageSquare },
    { id: "gallery", label: "Галерея", note: "CG и разблокировка", icon: ImageSquare },
    { id: "interface", label: "Интерфейс", note: "Меню, диалоги, выборы", icon: Palette },
  ];
  const matches = (scene) => scene?.title?.toLowerCase().includes(query.toLowerCase()) || scene?.description?.toLowerCase().includes(query.toLowerCase());
  const deleteScene = (scene) => {
    if (!window.confirm(`Удалить сцену «${scene.title}»? Это действие можно отменить через Ctrl+Z.`)) return;
    if (!removeScene(scene.id)) window.alert("Сцену нельзя удалить: на неё ведут переходы из других сцен или это последняя сцена проекта.");
  };
  return (
    <aside className="project-tree">
      <div className="sidebar-label">ПРОЕКТ</div>
      <div className="sidebar-nav">
        {sidebarNav.map(({ id, label, note, icon: Icon }) => <button key={id} className={activeSection === id ? "active" : ""} onClick={() => setActiveSection(id)}><Icon weight="duotone" /><span><strong>{label}</strong><small>{note}</small></span></button>)}
      </div>
      <div className="scene-list-title"><span>ГЛАВЫ И СЦЕНЫ</span><button className="mini-icon" title="Новая глава" onClick={addChapter}><Plus /></button></div>
      <label className="search-field"><MagnifyingGlass size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск сцен…" /></label>
      <div className="sidebar-scenes chapter-tree">
        {project.chapters.map((chapter, chapterIndex) => <section key={chapter.id} className="chapter-group"><div className="chapter-row"><CaretDown /><input value={chapter.title} aria-label="Название главы" onChange={(event) => updateChapter(chapter.id, { title: event.target.value })} /><button title="Поднять главу" disabled={!chapterIndex} onClick={() => moveChapter(chapter.id, "up")}><ArrowUp /></button><button title="Опустить главу" disabled={chapterIndex === project.chapters.length - 1} onClick={() => moveChapter(chapter.id, "down")}><ArrowDown /></button><button title="Добавить сцену" onClick={() => addScene(chapter.id)}><Plus /></button><button title="Удалить пустую главу" disabled={chapter.scenes.length > 0 || project.chapters.length < 2} onClick={() => removeChapter(chapter.id)}><Trash /></button></div>{chapter.scenes.map((sceneId, index) => { const scene = project.scenes[sceneId]; if (!scene || !matches(scene)) return null; return <div key={scene.id} className={`sidebar-scene-wrap ${activeSceneId === scene.id ? "active" : ""}`}><button className="sidebar-scene" onClick={() => setActiveScene(scene.id)}><img src={scene.background} alt="" /><span className="scene-number">{scene.number ?? `${chapterIndex + 1}.${index + 1}`}</span><span><strong>{scene.title}</strong><small>{scene.description}</small></span></button><div className="scene-row-tools"><button title="Выше" disabled={!index} onClick={() => moveScene(scene.id, "up")}><ArrowUp /></button><button title="Ниже" disabled={index === chapter.scenes.length - 1} onClick={() => moveScene(scene.id, "down")}><ArrowDown /></button><button title="Удалить" onClick={() => deleteScene(scene)}><Trash /></button></div></div>; })}</section>)}
      </div>
      <button className="new-scene" onClick={() => addScene()}><Plus />Новая сцена</button>
    </aside>
  );
}

function CanvasToolbar({ onAddCharacter }) {
  const { zoom, setZoom, project, activeSceneId } = useProjectStore();
  const scene = project.scenes[activeSceneId];
  return (
    <div className="canvas-toolbar">
      <strong>Сцена {scene.number} — {scene.title}</strong>
      <button className="canvas-add-character" onClick={onAddCharacter}><User />Добавить персонажа</button><div className="zoom-control"><span>{project.meta.resolution.width} × {project.meta.resolution.height}</span><CaretDown size={13} /><span className="toolbar-divider" /><MagnifyingGlass /><span>{zoom}%</span><button className="icon-button" onClick={() => setZoom(zoom === 100 ? 80 : 100)}><ArrowsOut /></button></div>
    </div>
  );
}

function DialogueOverlay({ scene, frame }) {
  const { project, activeActionId } = useProjectStore();
  const action = frame ? frame.text : scene.actions.find((item) => item.id === activeActionId) ?? [...scene.actions].reverse().find((item) => item.type === "dialogue");
  if (!action || !["dialogue", "narration"].includes(action.type)) return null;
  const character = project.characters.find((item) => item.id === action.speakerId);
  return (
    <div className={`dialogue-overlay position-${project.ui.dialoguePosition}`} style={{ opacity: project.ui.dialogueOpacity / 100, backgroundImage: project.ui.dialogueBackground ? `url(${project.ui.dialogueBackground})` : undefined }}>
      {action.type === "dialogue" && <div className="speaker-name" style={{ color: character?.color }}>{character?.name ?? "Автор"}</div>}
      <StyledText project={project} action={action} factor={.58}>{action.text}</StyledText>
      {project.ui.showQuickMenu && <div className="quick-menu"><span>Пропуск</span><span>Авто</span><span>История</span><span>Настройки</span></div>}
      <CaretDown className="continue-mark" weight="fill" />
    </div>
  );
}

function SceneCanvas({ onBackgroundPick }) {
  const { project, activeSceneId, zoom, activeLayerId, setActiveLayer, updateSceneCharacter, bottomTab, timelineTime, addAction, updateAction, activeActionId, setActiveAction } = useProjectStore();
  const scene = project.scenes[activeSceneId];
  const frame = bottomTab === "timeline" ? timelineFrame(project, scene, timelineTime) : null;
  const [contextMenu,setContextMenu] = useState(null);
  const [showCharacters,setShowCharacters] = useState(false);
  const [drag, setDrag] = useState(null);
  const layerPosition = (layer) => drag?.layerId === layer.id ? drag : layer;
  const gesture = useRef(null);
  const beginDrag = (event, layer, mode = "move") => {
    if (layer.locked || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    if (layer.sourceActionId) setActiveAction(layer.sourceActionId); else setActiveLayer(layer.id);
    const rect = event.currentTarget.closest(".game-canvas").getBoundingClientRect();
    const anchorX = rect.left + layer.x / 100 * rect.width;
    const anchorY = rect.top + layer.y / 100 * rect.height;
    gesture.current = {mode, layerId:layer.id, x:layer.x, y:layer.y, scale:layer.scale ?? 100,
      clientX:event.clientX, clientY:event.clientY, width:rect.width, height:rect.height,
      anchorX, anchorY, distance:Math.hypot(event.clientX-anchorX,event.clientY-anchorY)};
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({...layer, layerId:layer.id});
  };
  const moveDrag = (event, layer) => {
    if (gesture.current?.layerId !== layer.id) return;
    setDrag({...layer, layerId:layer.id, ...canvasTransform(gesture.current,event.clientX,event.clientY)});
  };
  const finishDrag = (event, layer) => {
    if (gesture.current?.layerId !== layer.id) return;
    const patch = canvasTransform(gesture.current,event.clientX,event.clientY);
    if (layer.sourceActionId) updateAction(scene.id,layer.sourceActionId,patch);
    else updateSceneCharacter(scene.id,layer.id,patch);
    gesture.current=null; setDrag(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return (
    <section className="scene-stage"><CanvasToolbar onAddCharacter={() => setShowCharacters(true)} /><div className="canvas-viewport"><div className="game-canvas" onContextMenu={e => {e.preventDefault();setContextMenu({x:e.clientX,y:e.clientY});}} style={{ transform: `scale(${zoom / 100})`, aspectRatio: `${project.meta.resolution.width} / ${project.meta.resolution.height}` }}>
      {(frame ? frame.background : scene.background) ? <img className="scene-background" src={frame ? frame.background : scene.background} alt={`Фон сцены ${scene.title}`} /> : <div className="empty-canvas"><ImageSquare size={42} /><span>Добавьте фон и персонажей</span></div>}
      {(frame ? frame.layers : scene.characters ?? []).map((layer) => {
        const character = project.characters.find((item) => item.id === layer.characterId);
        const { source, sprite } = resolveCharacterSprite(character, layer.spriteId, project.resources);
        const selected = activeLayerId === layer.id || (layer.sourceActionId && activeActionId === layer.sourceActionId);
        const position = layerPosition(layer);
        if (!layer.visible) return null;
        return <button key={layer.id} className={`scene-character-layer ${selected ? "selected" : ""} ${layer.locked ? "locked" : ""}`} style={{ left: `${position.x}%`, top: `${position.y}%`, opacity: layer.opacity / 100, transform: `translate(-50%, -100%) rotate(${layer.rotation}deg) scale(${layer.flip ? -position.scale / 100 : position.scale / 100}, ${position.scale / 100})` }} onPointerDown={(event) => beginDrag(event, layer)} onPointerMove={(event) => moveDrag(event, layer)} onPointerUp={(event) => finishDrag(event, layer)} onPointerCancel={() => { gesture.current=null; setDrag(null); }}>
          {source ? <img src={source} alt={`${character?.name ?? "Персонаж"} — ${sprite?.name ?? "портрет"}`} draggable="false" /> : <span className="character-placeholder"><User weight="duotone" /><strong>{character?.name ?? "Персонаж"}</strong><small>Добавьте PNG-спрайт</small></span>}
          {selected && !layer.locked && <><span className="sprite-size-badge">{Math.round(project.meta.resolution.width * .34 * position.scale / 100)} × {Math.round(project.meta.resolution.height * .88 * position.scale / 100)} · {position.scale}%</span>{["nw","ne","sw","se"].map(corner => <span key={corner} className={"sprite-resize-handle " + corner} title="Потяните, чтобы изменить размер" onPointerDown={event => beginDrag(event,layer,"resize")} />)}</>}
        </button>;
      })}
      {project.editor?.showGuides && <><span className="canvas-guide vertical" /><span className="canvas-guide horizontal" /></>}
      {frame?.cg && <img className="timeline-cg-preview" src={frame.cg} alt="Иллюстрация" />}<DialogueOverlay scene={scene} frame={frame} />{frame?.choice && <div className="timeline-choice-preview">{frame.choice.options.map(o=><span key={o.id}>{o.text}</span>)}</div>}<button className="replace-background" onClick={onBackgroundPick}><ImageSquare />Заменить фон</button>
    </div></div>{contextMenu && <EditorContextMenu position={contextMenu} items={sceneMenuItems({addCharacter:()=>setShowCharacters(true),background:onBackgroundPick,action:addAction})} onClose={()=>setContextMenu(null)}/>} {showCharacters && <CharacterPicker sceneId={scene.id} onClose={()=>setShowCharacters(false)}/>}</section>
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
  const [showActionMenu, setShowActionMenu] = useState(false);
  useEffect(() => { document.querySelector(".action-row.active")?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [activeActionId, bottomTab]);
  const scene = project.scenes[activeSceneId];
  const lanes = [["Фон и иллюстрации", ["background", "showCG", "hideCG"]], ["Персонажи", ["showCharacter", "hideCharacter", "changeSprite", "moveCharacter", "characterAnimation"]], ["Текст и выборы", ["dialogue", "narration", "choice"]], ["Музыка и звук", ["music", "stopMusic", "sound", "voice", "ambience"]], ["Логика и эффекты", ["variable", "flag", "event", "condition", "jump", "end", "effect", "pause"]]];
  const actionLabel = (action) => actionTypes.find(([type]) => type === action.type)?.[1] ?? "Действие";
  const content = (action) => action.text ?? action.prompt ?? project.resources.find((item) => item.id === action.assetId)?.name ?? project.characters.find((item) => item.id === action.characterId)?.name ?? actionLabel(action);
  return <section className="scenario-panel">
    <div className="scenario-tabs">{[["scenario", "Сценарий"], ["timeline", "Временная шкала"], ["map", "Карта сюжета"]].map(([id, title]) => <button key={id} className={bottomTab === id ? "active" : ""} onClick={() => setBottomTab(id)}>{title}</button>)}<div className="action-menu-wrap"><button className="add-block" onClick={() => setShowActionMenu(!showActionMenu)}>Добавить действие <Plus /></button>{showActionMenu && <ActionPicker actions={actionTypes} onChoose={(type) => { addAction(type); setShowActionMenu(false); }} onClose={() => setShowActionMenu(false)} />}</div></div>
    {bottomTab === "scenario" && <div className="action-list">{scene.actions.map((action, index) => <div key={action.id} data-action-id={action.id} className={`action-row ${activeActionId === action.id ? "active" : ""}`} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter") setActiveAction(action.id); }} onClick={() => setActiveAction(action.id)}><span className="action-index">{String(index + 1).padStart(3, "0")}</span><span className="action-icon"><ActionIcon type={action.type} /></span><span className="action-kind">{actionLabel(action)}</span><span className="action-content">{content(action)}</span><span className="row-tools"><button title="Выше" disabled={!index} onClick={(event) => { event.stopPropagation(); moveAction(scene.id, action.id, "up"); }}><ArrowUp /></button><button title="Ниже" disabled={index === scene.actions.length - 1} onClick={(event) => { event.stopPropagation(); moveAction(scene.id, action.id, "down"); }}><ArrowDown /></button><button title="Удалить действие" onClick={(event) => { event.stopPropagation(); removeAction(scene.id, action.id); }}><Trash /></button></span></div>)}{!scene.actions.length && <div className="empty-scenario"><TextT /><strong>В сцене пока нет действий</strong><p>Добавьте текст автора, диалог или другое действие.</p><button className="button primary" onClick={() => addAction("narration")}><Plus />Добавить текст автора</button></div>}</div>}
    {bottomTab === "timeline" && <TimelineEditor scene={scene} actionLabel={actionLabel} content={content}/> }
    {bottomTab === "map" && <StoryMap />}
  </section>;
}

function Field({ label, children, className = "" }) { return <label className={`field ${className}`.trim()}><span>{label}</span>{children}</label>; }

function ActionFields({ action, scene }) {
  const { project, updateAction, updateScene } = useProjectStore();
  if (!action) return null;
  const patch = (value) => updateAction(scene.id, action.id, value);
  const imageResources = project.resources.filter((item) => ["background", "cg"].includes(item.category));
  const musicResources = project.resources.filter((item) => item.category === "music");
  const soundResources = project.resources.filter((item) => item.category === "sound");
  const voiceResources = project.resources.filter((item) => item.category === "voice");
  const updateChoice = (optionId, value) => patch({ options: action.options.map((option) => option.id === optionId ? { ...option, ...value } : option) });
  if (action.type === "dialogue") {
    const character = project.characters.find((item) => item.id === action.speakerId);
    return <><Field label="Персонаж"><select value={action.speakerId ?? ""} onChange={(event) => patch({ speakerId: event.target.value, spriteId: null })}>{project.characters.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field><Field label="Спрайт"><select value={action.spriteId ?? ""} onChange={(event) => patch({ spriteId: event.target.value || null })}><option value="">Основной</option>{character?.sprites.map((sprite) => <option value={sprite.id} key={sprite.id}>{sprite.name}</option>)}</select></Field><Field label="Озвучка"><select value={action.voiceAssetId ?? ""} onChange={(event) => patch({ voiceAssetId: event.target.value || null })}><option value="">Без озвучки</option>{voiceResources.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field><Field label="Текст"><textarea rows="5" value={action.text} onChange={(event) => patch({ text: event.target.value })} /></Field><TextAppearance action={action} onChange={patch}/></>;
  }
  if (action.type === "narration") return <><Field label="Текст автора"><textarea rows="6" value={action.text} onChange={(event) => patch({ text: event.target.value })} /></Field><TextAppearance action={action} onChange={patch}/></>;
  if (action.type === "pause") return <Field label="Длительность паузы, сек"><input type="number" min=".1" step=".1" value={action.duration??1} onChange={e=>patch({duration:Math.max(.1,Number(e.target.value)||1)})}/></Field>;
  if (action.type === "choice") {
    const updateEffect = (option, effectId, value) => updateChoice(option.id, { effects: (option.effects ?? []).map((effect) => effect.id === effectId ? { ...effect, ...value } : effect) });
    return <><Field label="Вопрос"><textarea rows="3" value={action.prompt} onChange={(event) => patch({ prompt: event.target.value })} /></Field><div className="choice-editor">{action.options.map((option, index) => <section className="choice-option" key={option.id}><div className="choice-option-main"><span>{index + 1}</span><input value={option.text} onChange={(event) => updateChoice(option.id, { text: event.target.value })} /><select value={option.targetSceneId} onChange={(event) => updateChoice(option.id, { targetSceneId: event.target.value })}>{Object.values(project.scenes).map((item) => <option value={item.id} key={item.id}>{item.number} · {item.title}</option>)}</select><button title="Удалить вариант" disabled={action.options.length < 2} onClick={() => patch({ options: action.options.filter((item) => item.id !== option.id) })}><Trash /></button></div><div className="choice-effects">{(option.effects ?? []).map((effect) => <div key={effect.id ?? `${effect.variableId}-${effect.flagId}`}><select value={effect.kind ?? "variable"} onChange={(event) => updateEffect(option, effect.id, event.target.value === "flag" ? { kind: "flag", flagId: project.flags[0]?.id, value: true } : { kind: "variable", variableId: project.variables[0]?.id, operation: "add", value: 1 })}><option value="variable">Переменная</option><option value="flag">Флаг</option></select>{(effect.kind ?? "variable") === "flag" ? <><select value={effect.flagId ?? ""} onChange={(event) => updateEffect(option, effect.id, { flagId: event.target.value })}>{project.flags.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select><select value={String(effect.value)} onChange={(event) => updateEffect(option, effect.id, { value: event.target.value === "true" })}><option value="true">Включить</option><option value="false">Выключить</option></select></> : <><select value={effect.variableId ?? ""} onChange={(event) => updateEffect(option, effect.id, { variableId: event.target.value })}>{project.variables.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select><select value={effect.operation ?? "add"} onChange={(event) => updateEffect(option, effect.id, { operation: event.target.value })}><option value="add">+ добавить</option><option value="subtract">− вычесть</option><option value="set">Установить</option></select><input type="number" value={effect.value ?? 1} onChange={(event) => updateEffect(option, effect.id, { value: Number(event.target.value) })} /></>}<button onClick={() => updateChoice(option.id, { effects: option.effects.filter((item) => item.id !== effect.id) })}><Trash /></button></div>)}</div><div className="choice-option-tools"><button onClick={() => updateChoice(option.id, { effects: [...(option.effects ?? []), { id: `effect_${crypto.randomUUID().slice(0, 8)}`, kind: "variable", variableId: project.variables[0]?.id, operation: "add", value: 1 }] })}><Plus />Результат</button><label><input type="checkbox" checked={Boolean(option.condition)} onChange={(event) => updateChoice(option.id, { condition: event.target.checked ? { variableId: project.variables[0]?.id, operator: "gte", value: 1 } : null })} />Показывать по условию</label></div>{option.condition && <div className="choice-condition"><select value={option.condition.variableId ?? ""} onChange={(event) => updateChoice(option.id, { condition: { ...option.condition, variableId: event.target.value } })}>{project.variables.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select><select value={option.condition.operator ?? "gte"} onChange={(event) => updateChoice(option.id, { condition: { ...option.condition, operator: event.target.value } })}><option value="eq">равно</option><option value="neq">не равно</option><option value="gt">больше</option><option value="gte">не меньше</option><option value="lt">меньше</option><option value="lte">не больше</option></select><input value={option.condition.value ?? 1} onChange={(event) => updateChoice(option.id, { condition: { ...option.condition, value: event.target.value } })} /></div>}</section>)}</div><button className="outline-wide" onClick={() => patch({ options: [...action.options, { id: `choice_${crypto.randomUUID().slice(0, 8)}`, text: "Новый вариант", targetSceneId: scene.id, effects: [] }] })}><Plus />Добавить вариант</button></>;
  }
  if (action.type === "background") return <><Field label="Новый фон"><select value={action.assetId ?? ""} onChange={(event) => { const assetId = event.target.value; const resource = project.resources.find((item) => item.id === assetId); patch({ assetId, assetName: resource?.name ?? "Фон" }); if (resource) updateScene(scene.id, { background: resource.source, backgroundResourceId: resource.id }); }}><option value="">Выберите ресурс</option>{imageResources.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field><Field label="Переход"><select value={action.transition ?? "dissolve"} onChange={(event) => patch({ transition: event.target.value })}><option value="dissolve">Растворение</option><option value="fade">Затемнение</option><option value="flash">Вспышка</option><option value="none">Без перехода</option></select></Field></>;
  if (["showCharacter", "hideCharacter"].includes(action.type)) {
    const character = project.characters.find((item) => item.id === action.characterId);
    return <><Field label="Персонаж"><select value={action.characterId ?? ""} onChange={(event) => patch({ characterId: event.target.value, spriteId: null })}>{project.characters.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field>{action.type === "showCharacter" && <><Field label="Спрайт"><select value={action.spriteId ?? ""} onChange={(event) => patch({ spriteId: event.target.value || null })}><option value="">Основной</option>{character?.sprites.map((sprite) => <option value={sprite.id} key={sprite.id}>{sprite.name}</option>)}</select></Field><Field label="Позиция"><select value={action.position ?? "center"} onChange={(event) => patch({ position: event.target.value, x: ({left:25,center:50,right:75})[event.target.value] })}><option value="left">Слева</option><option value="center">По центру</option><option value="right">Справа</option></select></Field><div className="field-grid">{[["x","X · %",50],["y","Y · %",100],["scale","Масштаб · %",100]].map(([key,label,fallback]) => <Field key={key} label={label}><input type="number" min={key==="scale"?10:0} max={key==="scale"?400:100} value={action[key] ?? (key==="x"?({left:25,center:50,right:75})[action.position]??50:fallback)} onChange={e=>patch({[key]:Math.max(key==="scale"?10:0,Math.min(key==="scale"?400:100,Number(e.target.value)))})}/></Field>)}</div></>}<Field label="Анимация"><select value={action.transition ?? "dissolve"} onChange={(event) => patch({ transition: event.target.value })}><option value="dissolve">Плавное появление</option><option value="moveinleft">Въезд слева</option><option value="moveinright">Въезд справа</option><option value="none">Без анимации</option></select></Field></>;
  }
  if (action.type === "changeSprite") { const character = project.characters.find((item) => item.id === action.characterId); return <><Field label="Персонаж"><select value={action.characterId ?? ""} onChange={(event) => patch({ characterId: event.target.value, spriteId: null })}>{project.characters.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field><Field label="Новый спрайт"><select value={action.spriteId ?? ""} onChange={(event) => patch({ spriteId: event.target.value || null })}><option value="">Основной</option>{character?.sprites.map((sprite) => <option value={sprite.id} key={sprite.id}>{sprite.name}</option>)}</select></Field><Field label="Переход"><select value={action.transition ?? "dissolve"} onChange={(event) => patch({ transition: event.target.value })}><option value="dissolve">Растворение</option><option value="fade">Затемнение</option><option value="none">Мгновенно</option></select></Field></>; }
  if (action.type === "moveCharacter") return <><Field label="Персонаж"><select value={action.characterId ?? ""} onChange={(event) => patch({ characterId: event.target.value })}>{project.characters.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field><Field label="Куда переместить"><select value={action.position ?? "center"} onChange={(event) => patch({ position: event.target.value })}><option value="left">Влево</option><option value="center">По центру</option><option value="right">Вправо</option></select></Field><Field label="Длительность"><div className="unit-input"><input type="number" min="0.1" step="0.1" value={action.duration ?? .5} onChange={(event) => patch({ duration: Number(event.target.value) })} /><span>сек.</span></div></Field></>;
  if (action.type === "characterAnimation") return <><Field label="Персонаж"><select value={action.characterId ?? ""} onChange={(event) => patch({ characterId: event.target.value })}>{project.characters.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field><Field label="Анимация"><select value={action.animation ?? "shake"} onChange={(event) => patch({ animation: event.target.value })}><option value="shake">Дрожь</option><option value="strongShake">Сильная дрожь</option><option value="jump">Прыжок</option><option value="bounce">Подпрыгивание</option><option value="pulse">Пульсация</option><option value="zoomIn">Увеличение</option><option value="stepForward">Шаг вперёд</option><option value="stepBack">Шаг назад</option></select></Field><div className="field-grid"><Field label="Длительность"><input type="number" min="0.1" step="0.1" value={action.duration ?? .5} onChange={(event) => patch({ duration: Number(event.target.value) })} /></Field><Field label="Интенсивность"><input type="number" min="0.2" max="3" step="0.1" value={action.intensity ?? 1} onChange={(event) => patch({ intensity: Number(event.target.value) })} /></Field></div></>;
  if (action.type === "showCG") return <><Field label="Сюжетная иллюстрация"><select value={action.assetId ?? ""} onChange={(event) => patch({ assetId: event.target.value || null })}><option value="">Выберите CG</option>{imageResources.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field><Field label="Переход"><select value={action.transition ?? "dissolve"} onChange={(event) => patch({ transition: event.target.value })}><option value="dissolve">Растворение</option><option value="fade">Затемнение</option><option value="flash">Вспышка</option><option value="none">Мгновенно</option></select></Field><label className="check-field"><input type="checkbox" checked={action.unlockGallery ?? true} onChange={(event) => patch({ unlockGallery: event.target.checked })} /><span><Check />Открыть изображение в галерее после показа</span></label></>;
  if (action.type === "hideCG") return <Field label="Переход"><select value={action.transition ?? "dissolve"} onChange={(event) => patch({ transition: event.target.value })}><option value="dissolve">Растворение</option><option value="fade">Затемнение</option><option value="none">Мгновенно</option></select></Field>;
  if (["music","ambience"].includes(action.type)) return <><Field label={action.type==="music"?"Музыка":"Фоновый звук"}><select value={action.assetId ?? ""} onChange={(event) => patch({ assetId: event.target.value || null })}><option value="">Выберите трек</option>{(action.type==="ambience"?[...soundResources,...musicResources]:musicResources).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field><Field label={`Громкость · ${Math.round((action.volume ?? 1) * 100)}%`}><input type="range" min="0" max="100" value={(action.volume ?? 1) * 100} onChange={(event) => patch({ volume: Number(event.target.value) / 100 })} /></Field><label className="check-field"><input type="checkbox" checked={action.loop ?? true} onChange={(event) => patch({ loop: event.target.checked })} /><span><Check />Повторять трек</span></label></>;
  if (action.type === "stopMusic") return <Field label="Плавное затухание"><div className="unit-input"><input type="number" min="0" step="0.1" value={action.fadeOut ?? 1} onChange={(event) => patch({ fadeOut: Number(event.target.value) })} /><span>сек.</span></div></Field>;
  if (["sound", "voice"].includes(action.type)) { const items = action.type === "voice" ? voiceResources : soundResources; return <Field label={action.type === "voice" ? "Файл озвучки" : "Звуковой эффект"}><select value={action.assetId ?? ""} onChange={(event) => patch({ assetId: event.target.value || null })}><option value="">Выберите файл</option>{items.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field>; }
  if (action.type === "effect") return <Field label="Эффект"><select value={action.effect ?? "flash"} onChange={(event) => patch({ effect: event.target.value })}><option value="flash">Вспышка</option><option value="shake">Тряска</option><option value="fade">Затемнение</option></select></Field>;
  if (action.type === "variable") return <><Field label="Переменная"><select value={action.variableId ?? ""} onChange={(event) => patch({ variableId: event.target.value })}>{project.variables.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field><Field label="Операция"><select value={action.operation ?? "add"} onChange={(event) => patch({ operation: event.target.value })}><option value="add">Прибавить</option><option value="subtract">Вычесть</option><option value="set">Установить</option></select></Field><Field label="Значение"><input value={action.value} onChange={(event) => patch({ value: event.target.value })} /></Field></>;
  if (action.type === "flag") return <><Field label="Флаг"><select value={action.flagId ?? ""} onChange={(event) => patch({ flagId: event.target.value })}>{project.flags.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field><Field label="Состояние"><select value={String(action.value)} onChange={(event) => patch({ value: event.target.value === "true" })}><option value="true">Включить</option><option value="false">Выключить</option></select></Field></>;
  if (action.type === "event") return <><Field label="Текст события"><textarea rows="4" value={action.text ?? ""} onChange={(event) => patch({ text: event.target.value })} /></Field><Field label="Длительность"><div className="unit-input"><input type="number" min="0.5" step="0.5" value={action.duration ?? 2.5} onChange={(event) => patch({ duration: Number(event.target.value) })} /><span>сек.</span></div></Field></>;
  if (action.type === "condition") return <><Field label="Переменная"><select value={action.variableId ?? ""} onChange={(event) => patch({ variableId: event.target.value })}>{project.variables.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field><Field label="Сравнение"><select value={action.operator ?? "gte"} onChange={(event) => patch({ operator: event.target.value })}><option value="eq">Равно</option><option value="neq">Не равно</option><option value="gt">Больше</option><option value="gte">Больше или равно</option><option value="lt">Меньше</option><option value="lte">Меньше или равно</option></select></Field><Field label="Значение"><input value={action.value} onChange={(event) => patch({ value: event.target.value })} /></Field><Field label="Если да"><select value={action.trueSceneId} onChange={(event) => patch({ trueSceneId: event.target.value })}>{Object.values(project.scenes).map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></Field><Field label="Если нет"><select value={action.falseSceneId} onChange={(event) => patch({ falseSceneId: event.target.value })}>{Object.values(project.scenes).map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></Field></>;
  if (action.type === "jump") return <Field label="Следующая сцена"><select value={action.targetSceneId} onChange={(event) => patch({ targetSceneId: event.target.value })}>{Object.values(project.scenes).map((item) => <option value={item.id} key={item.id}>{item.number} · {item.title}</option>)}</select></Field>;
  return <div className="inspector-hint"><CheckCircle weight="fill" />После этого блока игра завершится.</div>;
}

function Inspector() {
  const { project, activeSceneId, activeActionId, activeLayerId, inspectorTab, setInspectorTab, setActiveLayer, updateScene, updateUi, addSceneCharacter, updateSceneCharacter, moveSceneCharacter, removeSceneCharacter } = useProjectStore();
  const scene = project.scenes[activeSceneId];
  const action = scene.actions.find((item) => item.id === activeActionId);
  const characters = scene.characters ?? [];
  const layer = characters.find((item) => item.id === activeLayerId) ?? (!action ? characters[0] : null);
  const character = project.characters.find((item) => item.id === layer?.characterId);
  const [chosenCharacterId, setCharacterToAdd] = useState("");
  const characterToAdd = project.characters.some((item) => item.id === chosenCharacterId) ? chosenCharacterId : project.characters[0]?.id ?? "";
  return (
    <aside className="inspector">
      <div className="inspector-tabs"><button className={inspectorTab === "properties" ? "active" : ""} onClick={() => setInspectorTab("properties")}>Объект</button><button className={inspectorTab === "resources" ? "active" : ""} onClick={() => setInspectorTab("resources")}>Сцена</button><button className={inspectorTab === "effects" ? "active" : ""} onClick={() => setInspectorTab("effects")}>Проект</button></div>
      {inspectorTab === "properties" && <div className="inspector-scroll">
        <section className="selected-object-card"><div className="object-avatar"><ActionIcon type={action?.type ?? "showCharacter"} /></div><div><strong>{action ? actionTypes.find(([type]) => type === action.type)?.[1] ?? "Действие" : character?.name ?? "Фон сцены"}</strong><span>{action ? "Блок сценария" : layer ? "Слой персонажа" : "Объект сцены"}</span></div></section>
        {layer && !action && <section className="inspector-section"><h3>Положение и вид</h3><Field label="Название слоя"><input value={layer.name ?? character?.name ?? "Персонаж"} onChange={(event) => updateSceneCharacter(scene.id, layer.id, { name: event.target.value })} /></Field><Field label="Спрайт"><select value={layer.spriteId ?? ""} onChange={(event) => updateSceneCharacter(scene.id, layer.id, { spriteId: event.target.value || null })}><option value="">Основной спрайт</option>{character?.sprites.map((sprite) => <option value={sprite.id} key={sprite.id}>{sprite.name}</option>)}</select></Field><div className="field-grid"><Field label="X · %"><input type="number" min="0" max="100" value={layer.x} onChange={(event) => updateSceneCharacter(scene.id, layer.id, { x: Number(event.target.value) })} /></Field><Field label="Y · %"><input type="number" min="0" max="100" value={layer.y} onChange={(event) => updateSceneCharacter(scene.id, layer.id, { y: Number(event.target.value) })} /></Field></div><Field label={`Масштаб · ${layer.scale}%`}><input type="range" min="10" max="400" value={layer.scale} onChange={(event) => updateSceneCharacter(scene.id, layer.id, { scale: Number(event.target.value) })} /></Field><Field label={`Поворот · ${layer.rotation}°`}><input type="range" min="-180" max="180" value={layer.rotation} onChange={(event) => updateSceneCharacter(scene.id, layer.id, { rotation: Number(event.target.value) })} /></Field><Field label={`Прозрачность · ${layer.opacity}%`}><input type="range" min="0" max="100" value={layer.opacity} onChange={(event) => updateSceneCharacter(scene.id, layer.id, { opacity: Number(event.target.value) })} /></Field><div className="layer-order-row"><button onClick={() => moveSceneCharacter(scene.id, layer.id, "up")}><ArrowUp />Выше</button><button onClick={() => moveSceneCharacter(scene.id, layer.id, "down")}><ArrowDown />Ниже</button><button className={layer.visible ? "active" : ""} onClick={() => updateSceneCharacter(scene.id, layer.id, { visible: !layer.visible })}><Eye />{layer.visible ? "Скрыть" : "Показать"}</button></div><div className="layer-toggle-row"><button className={layer.flip ? "active" : ""} onClick={() => updateSceneCharacter(scene.id, layer.id, { flip: !layer.flip })}>Отразить</button><button className={layer.locked ? "active" : ""} onClick={() => updateSceneCharacter(scene.id, layer.id, { locked: !layer.locked })}>{layer.locked ? "Разблокировать" : "Заблокировать"}</button><button className="danger" onClick={() => removeSceneCharacter(scene.id, layer.id)}><Trash /></button></div></section>}
        <section className="inspector-section"><h3>{action ? "Настройки действия" : "Фон"}</h3>{action ? <ActionFields action={action} scene={scene} /> : <><div className="asset-field">{scene.background ? <img src={scene.background} alt="Миниатюра фона" /> : <ImageSquare aria-label="Фон не выбран"/>}<div><strong>Фон сцены</strong><span>{project.meta.resolution.width} × {project.meta.resolution.height}</span></div><FolderOpen /></div><Field label="Эффект появления"><select value={scene.transition} onChange={(event) => updateScene(scene.id, { transition: event.target.value })}><option value="fade">Плавное появление</option><option value="dissolve">Растворение</option><option value="flash">Вспышка</option><option value="none">Без эффекта</option></select></Field></>}</section>
        <section className="inspector-section"><h3>Слои персонажей</h3>{[...characters].reverse().map((item) => { const itemCharacter = project.characters.find((char) => char.id === item.characterId); return <button className={`character-chip ${layer?.id === item.id ? "active" : ""}`} key={item.id} onClick={() => setActiveLayer(item.id)}><User weight="duotone" /><strong>{item.name || itemCharacter?.name}</strong><span>{Math.round(item.x)}% · {Math.round(item.y)}%</span><Eye color={item.visible ? "#4cd7e8" : "#566777"} /></button>; })}<div className="add-layer-row"><select value={characterToAdd} onChange={(event) => setCharacterToAdd(event.target.value)}>{project.characters.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select><button disabled={!characterToAdd} onClick={() => characterToAdd && addSceneCharacter(scene.id, characterToAdd)}><Plus />Добавить</button></div></section>
        <section className="inspector-section"><h3>Текстовое окно</h3><Field label="Положение"><select value={project.ui.dialoguePosition} onChange={(event) => updateUi({ dialoguePosition: event.target.value })}><option value="bottom">Внизу</option><option value="center">По центру</option><option value="top">Вверху</option></select></Field><Field label={`Прозрачность · ${project.ui.dialogueOpacity}%`}><input type="range" min="40" max="100" value={project.ui.dialogueOpacity} onChange={(event) => updateUi({ dialogueOpacity: Number(event.target.value) })} /></Field><div className="field-grid"><Field label="Размер текста"><input type="number" min="14" max="72" value={project.ui.dialogueFontSize} onChange={(event) => updateUi({ dialogueFontSize: Number(event.target.value) })} /></Field><Field label="Цвет текста"><input type="color" value={project.ui.dialogueTextColor} onChange={(event) => updateUi({ dialogueTextColor: event.target.value })} /></Field></div><Field label={`Скорость печати · ${project.ui.textSpeed}`}><input type="range" min="0" max="100" value={project.ui.textSpeed} onChange={(event) => updateUi({ textSpeed: Number(event.target.value) })} /></Field><AssetPicker title="Свой фон окна" value={project.ui.dialogueBackground} onChange={(dialogueBackground) => updateUi({ dialogueBackground })} /><label className="check-field"><input type="checkbox" checked={project.ui.showQuickMenu} onChange={(event) => updateUi({ showQuickMenu: event.target.checked })} /><span><Check />Показывать быстрое меню</span></label></section>
      </div>}
      {inspectorTab === "resources" && <div className="inspector-scroll"><section className="inspector-section"><h3>Настройки сцены</h3><Field label="Название сцены"><input value={scene.title} onChange={(event) => updateScene(scene.id, { title: event.target.value })} /></Field><Field label="Описание"><textarea rows="4" value={scene.description} onChange={(event) => updateScene(scene.id, { description: event.target.value })} /></Field></section></div>}
      {inspectorTab === "effects" && <div className="inspector-empty"><Palette /><strong>{project.meta.title}</strong><span>Название, иконка, курсор и параметры сборки меняются в настройках проекта.</span></div>}
    </aside>
  );
}

function ResourceWorkspace({ section }) {
  const { project, activeSceneId, selectedResourceId, setSelectedResource, addResource, replaceResource, removeResource, updateScene, setActiveScene, setActiveAction, setSelectedCharacter, setActiveSection } = useProjectStore();
  const categoryBySection = { backgrounds: "background", music: "music", sounds: "sound" };
  const forcedCategory = categoryBySection[section] ?? null;
  const [category, setCategory] = useState(forcedCategory ?? "all");
  const addInput = useRef();
  const replaceInput = useRef();
  const visible = project.resources.filter((item) => (forcedCategory ?? category) === "all" || item.category === (forcedCategory ?? category));
  const selected = project.resources.find((item) => item.id === selectedResourceId) ?? visible[0];
  const importFiles = async (files) => { for (const file of Array.from(files ?? [])) { const resource = await fileToResource(file, forcedCategory ?? category, project); if (resource) addResource(resource); } };
  const replaceFile = async (file) => { if (file && selected) { const resource = await fileToResource(file, selected.category, project); if (resource) replaceResource(selected.id, resource); } };
  const usage = selected ? resourceUsageCount(project, selected) : 0;
  const usages = selected ? resourceUsages(project, selected) : [];
  const openUsage = (item) => { if (item.kind === "scene") { setActiveScene(item.id); if (item.actionId) setActiveAction(item.actionId); } else if (item.kind === "character") { setSelectedCharacter(item.id); setActiveSection("characters"); } else setActiveSection("gallery"); };
  return <div className="resource-workspace" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); importFiles(event.dataTransfer.files); }}>
    {!forcedCategory && <div className="resource-filters">{resourceCategories.map(([id, label]) => <button key={id} className={category === id ? "active" : ""} onClick={() => setCategory(id)}>{label}<span>{id === "all" ? project.resources.length : project.resources.filter((item) => item.category === id).length}</span></button>)}</div>}
    <div className="resource-main"><div className="resource-grid">{visible.map((resource) => <button key={resource.id} className={`resource-card ${selected?.id === resource.id ? "active" : ""}`} onClick={() => setSelectedResource(resource.id)}>{resource.mime?.startsWith("image/") ? <img src={resource.source} alt={resource.name} /> : <div className="resource-type-icon">{resource.category === "music" ? <MusicNotes /> : resource.category === "voice" ? <Waveform /> : <SpeakerHigh />}</div>}<span><strong>{resource.name}</strong><small>{formatBytes(resource.size)}{resource.width ? ` · ${resource.width}×${resource.height}` : ""}</small></span><em>{resourceUsageCount(project, resource)}</em></button>)}<button className="upload-card resource-upload" onClick={() => addInput.current?.click()}><UploadSimple /><strong>Добавить файлы</strong><span>или перетащите их сюда</span></button></div>
      <aside className="resource-details">{selected ? <><div className="resource-preview">{selected.mime?.startsWith("image/") ? <img src={selected.source} alt={selected.name} /> : <div><SpeakerHigh /><span>Аудиоресурс</span></div>}</div><h2>{selected.name}</h2><dl><div><dt>Тип</dt><dd>{resourceCategories.find(([id]) => id === selected.category)?.[1] ?? selected.category}</dd></div><div><dt>Формат</dt><dd>{selected.mime?.split("/")[1]?.toUpperCase() ?? "Файл"}</dd></div><div><dt>Размер</dt><dd>{formatBytes(selected.size)}</dd></div>{selected.width && <div><dt>Разрешение</dt><dd>{selected.width} × {selected.height}</dd></div>}<div><dt>Использований</dt><dd>{usage}</dd></div></dl>{usages.length > 0 && <div className="resource-usages"><strong>Где используется</strong>{usages.slice(0, 8).map((item, index) => <button key={`${item.kind}-${item.id}-${index}`} onClick={() => openUsage(item)}>{item.label}<CaretRight /></button>)}</div>}{["background", "cg"].includes(selected.category) && <button className="button primary wide" onClick={() => updateScene(activeSceneId, { background: selected.source, backgroundResourceId: selected.id })}>Использовать в сцене</button>}<button className="button secondary wide" onClick={() => replaceInput.current?.click()}>Заменить во всём проекте</button><button className="button danger-button wide" title={usage > 0 ? "Связи с ресурсом будут очищены" : "Удалить ресурс"} onClick={() => { if (!usage || window.confirm(`Ресурс используется ${usage} раз. Удалить его и очистить все связи?`)) removeResource(selected.id); }}><Trash />{usage > 0 ? "Удалить всё равно" : "Удалить"}</button>{usage > 0 && <p className="usage-warning">Ресурс используется {usage} раз. Глобальная замена сохранит все связи.</p>}</> : <div className="empty-detail"><FolderSimple /><strong>Ресурсов пока нет</strong><span>Добавьте изображения, музыку или звуки.</span></div>}</aside>
    </div><input ref={addInput} hidden multiple type="file" accept="image/*,audio/*,video/*,.ttf,.otf,.woff,.woff2" onChange={(event) => importFiles(event.target.files)} /><input ref={replaceInput} hidden type="file" accept="image/*,audio/*,video/*,.ttf,.otf,.woff,.woff2" onChange={(event) => replaceFile(event.target.files?.[0])} />
  </div>;
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
  return <div className="character-workspace"><div className="character-list"><button className="button primary wide" onClick={addCharacter}><Plus />Новый персонаж</button>{project.characters.map((item) => <button key={item.id} className={character?.id === item.id ? "active" : ""} onClick={() => setSelectedCharacter(item.id)}>{resolveCharacterSprite(item,null,project.resources).source ? <img src={resolveCharacterSprite(item,null,project.resources).source} alt="" /> : <User />}<span><strong>{item.name}</strong><small>{item.sprites.length} спрайтов</small></span><i style={{ background: item.color }} /></button>)}</div>{character && <div className="character-editor"><div className="character-form"><button className="portrait-picker" onClick={() => portraitInput.current?.click()}>{character.portrait ? <img src={character.portrait} alt={character.name} /> : <><User /><span>Добавить портрет</span></>}</button><div><Field label="Отображаемое имя"><input value={character.name} onChange={(event) => updateCharacter(character.id, { name: event.target.value })} /></Field><Field label="Внутреннее имя"><input value={character.internalName} onChange={(event) => updateCharacter(character.id, { internalName: event.target.value.replace(/\s+/g, "_") })} /></Field><div className="field-grid"><Field label="Цвет имени"><input type="color" value={character.color} onChange={(event) => updateCharacter(character.id, { color: event.target.value })} /></Field><Field label="Позиция по умолчанию"><select value={character.defaultPosition} onChange={(event) => updateCharacter(character.id, { defaultPosition: event.target.value })}><option value="left">Слева</option><option value="center">По центру</option><option value="right">Справа</option></select></Field></div><button className="button danger-button" onClick={() => { if (!removeCharacter(character.id)) window.alert("Персонаж используется в сценах или действиях. Сначала удалите его оттуда."); }}><Trash />Удалить персонажа</button></div></div><div className="sprites-header"><div><h2>Спрайты и эмоции</h2><p>Назовите состояния, например «Радость» или «Грусть». Основной спрайт используется по умолчанию.</p><p>Загрузка сохраняет спрайт в карточке героя. Чтобы показать героя, добавьте его на сцену.</p><button className="button primary" disabled={!activeSceneId || !resolveCharacterSprite(character, null, project.resources).source} onClick={() => { addSceneCharacter(activeSceneId, character.id); setBottomTab("scenario"); setActiveSection("scenes"); }}>Добавить на текущую сцену</button></div><button className="button secondary" onClick={() => spritesInput.current?.click()}><Plus />Добавить спрайты</button></div><div className="sprite-grid">{character.sprites.map((sprite) => <article key={sprite.id}><div>{resolveCharacterSprite(character, sprite.id, project.resources).source ? <img src={resolveCharacterSprite(character, sprite.id, project.resources).source} alt={sprite.name} /> : <User />}</div><label className="sprite-name-label">Название спрайта<input aria-label="Название спрайта" value={sprite.name} onChange={(event) => updateCharacter(character.id, { sprites: character.sprites.map((item) => item.id === sprite.id ? { ...item, name: event.target.value } : item) })} /></label><button className="sprite-default-button" aria-pressed={resolveCharacterSprite(character, null, project.resources).sprite?.id === sprite.id} onClick={() => updateCharacter(character.id, { defaultSpriteId: sprite.id })}>{resolveCharacterSprite(character, null, project.resources).sprite?.id === sprite.id ? "✓ Основной спрайт" : "Сделать основным"}</button><button title="Удалить спрайт" onClick={() => { if (!removeCharacterSprite(character.id, sprite.id)) window.alert("Этот спрайт используется в сцене или действии. Сначала замените его."); }}><Trash /></button></article>)}<button className="sprite-add" onClick={() => spritesInput.current?.click()}><UploadSimple /><span>Загрузить PNG</span></button></div><input ref={portraitInput} hidden type="file" accept="image/*" onChange={(event) => importPortrait(event.target.files?.[0])} /><input ref={spritesInput} hidden multiple type="file" accept="image/png,image/webp" onChange={(event) => importSprites(event.target.files)} /></div>}</div>;
}

function LogicWorkspace() {
  const [tab, setTab] = useState("map");
  const { project, addVariable, updateVariable, removeVariable, addFlag, updateFlag, removeFlag } = useProjectStore();
  return <div className="logic-workspace story-workspace"><div className="story-workspace-tabs"><button className={tab === "map" ? "active" : ""} onClick={() => setTab("map")}>Карта сюжета</button><button className={tab === "logic" ? "active" : ""} onClick={() => setTab("logic")}>Переменные и флаги</button></div>{tab === "map" ? <div className="logic-map"><StoryMap /></div> : <section className="logic-panels"><div><div className="workspace-section-head"><div><h2>Переменные</h2><p>Числа, текст и переключатели без кода.</p></div><button onClick={() => addVariable("number")}><Plus /></button></div>{project.variables.map((item) => <div className="logic-row" key={item.id}><input value={item.name} onChange={(event) => updateVariable(item.id, { name: event.target.value })} /><select value={item.type} onChange={(event) => updateVariable(item.id, { type: event.target.value, initial: event.target.value === "number" ? 0 : event.target.value === "boolean" ? false : "" })}><option value="number">Число</option><option value="text">Текст</option><option value="boolean">Да / нет</option><option value="relationship">Отношения</option></select>{item.type === "boolean" ? <select value={String(item.initial)} onChange={(event) => updateVariable(item.id, { initial: event.target.value === "true" })}><option value="false">Нет</option><option value="true">Да</option></select> : <input value={item.initial} type={item.type === "number" || item.type === "relationship" ? "number" : "text"} onChange={(event) => updateVariable(item.id, { initial: item.type === "number" || item.type === "relationship" ? Number(event.target.value) : event.target.value })} />}<button className="logic-delete" onClick={() => { if (!removeVariable(item.id)) window.alert("Переменная используется в сценарии или условии."); }}><Trash /></button></div>)}</div><div><div className="workspace-section-head"><div><h2>Флаги и события</h2><p>Запоминайте важные решения игрока.</p></div><button onClick={addFlag}><Plus /></button></div>{project.flags.map((item) => <div className="logic-row flag-row" key={item.id}><input value={item.name} onChange={(event) => updateFlag(item.id, { name: event.target.value })} /><label><input type="checkbox" checked={item.initial} onChange={(event) => updateFlag(item.id, { initial: event.target.checked })} />Включён в начале</label><button className="logic-delete" onClick={() => { if (!removeFlag(item.id)) window.alert("Флаг используется в сценарии или результате выбора."); }}><Trash /></button></div>)}</div></section>}</div>;
}

function GalleryWorkspace() {
  const { project, addGallerySection, updateGallerySection, removeGallerySection, addGalleryItem, updateGalleryItem, removeGalleryItem, setActiveSection } = useProjectStore();
  const [sectionId, setSectionId] = useState(project.gallery.sections[0]?.id ?? null);
  const [resourceId, setResourceId] = useState("");
  const section = project.gallery.sections.find((item) => item.id === sectionId) ?? project.gallery.sections[0];
  const images = project.resources.filter((item) => ["cg", "background"].includes(item.category) && item.mime?.startsWith("image/"));
  useEffect(() => { if (!sectionId && project.gallery.sections[0]) setSectionId(project.gallery.sections[0].id); }, [sectionId, project.gallery.sections]);
  return <div className="gallery-workspace"><aside><button className="button primary wide" onClick={addGallerySection}><Plus />Новый раздел</button>{project.gallery.sections.map((item) => <button key={item.id} className={section?.id === item.id ? "active" : ""} onClick={() => setSectionId(item.id)}><ImageSquare /><span><strong>{item.title}</strong><small>{item.items.length} изображений</small></span></button>)}</aside>{section && <section><div className="gallery-editor-head"><div><Field label="Название раздела"><input value={section.title} onChange={(event) => updateGallerySection(section.id, { title: event.target.value })} /></Field></div><button className="button danger-button" disabled={project.gallery.sections.length < 2} onClick={() => { removeGallerySection(section.id); setSectionId(project.gallery.sections.find((item) => item.id !== section.id)?.id); }}><Trash />Удалить раздел</button></div><div className="gallery-add-row"><select value={resourceId} onChange={(event) => setResourceId(event.target.value)}><option value="">Выберите CG или изображение</option>{images.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button className="button secondary" disabled={!resourceId} onClick={() => { addGalleryItem(section.id, resourceId); setResourceId(""); }}><Plus />Добавить в галерею</button><button className="button secondary" onClick={() => setActiveSection("resources")}><UploadSimple />Импортировать</button></div><div className="gallery-grid">{section.items.map((item) => { const resource = project.resources.find((entry) => entry.id === item.resourceId); return <article key={item.id}><div>{resource?.source ? <img src={resource.source} alt={item.title} /> : <WarningCircle />}</div><input value={item.title} onChange={(event) => updateGalleryItem(section.id, item.id, { title: event.target.value })} /><label><input type="checkbox" checked={item.unlockMode === "seen"} onChange={(event) => updateGalleryItem(section.id, item.id, { unlockMode: event.target.checked ? "seen" : "always" })} />Открывать после показа в сюжете</label><button onClick={() => removeGalleryItem(section.id, item.id)}><Trash /></button></article>; })}{!section.items.length && <div className="gallery-empty"><ImageSquare /><strong>Раздел пока пуст</strong><span>Добавьте CG из ресурсов. В игре закрытые изображения будут скрыты до первого показа.</span></div>}</div></section>}</div>;
}

function InterfaceWorkspace() {
  const { project, updateUi } = useProjectStore();
  const ui = project.ui;
  const updateButtons = (group, key, value) => updateUi({ [group]: { ...ui[group], [key]: value } });
  return <div className="interface-workspace"><section className="interface-preview"><div className="interface-screen" style={{ backgroundImage: `url(${ui.mainMenuBackground || "./assets/demo-aurora.png"})` }}><div className="menu-preview"><h2>{project.meta.title}</h2>{ui.mainMenuButtons.start && <button>Новая игра</button>}{ui.mainMenuButtons.load && <button>Продолжить / Загрузить</button>}{ui.mainMenuButtons.gallery && <button>Галерея</button>}{ui.mainMenuButtons.preferences && <button>Настройки</button>}{ui.mainMenuButtons.about && <button>Об игре</button>}{ui.mainMenuButtons.quit && <button>Выход</button>}</div><div className={`ui-dialogue-preview position-${ui.dialoguePosition}`} style={{ opacity: ui.dialogueOpacity / 100, backgroundImage: ui.dialogueBackground ? `url(${ui.dialogueBackground})` : undefined }}><strong style={{ color: ui.dialogueNameColor }}>Имя героя</strong><StyledText project={project} factor={.45}>Так будет выглядеть текст диалога в готовой игре.</StyledText></div></div></section><section className="interface-controls"><h2>Интерфейс готовой игры</h2><p>Изменения переносятся в Windows, macOS, Linux и Android-сборки.</p><AssetPicker title="Фон главного меню" value={ui.mainMenuBackground} onChange={(mainMenuBackground) => updateUi({ mainMenuBackground })} /><AssetPicker title="Фон диалогового окна" value={ui.dialogueBackground} onChange={(dialogueBackground) => updateUi({ dialogueBackground })} /><AssetPicker title="Обычная кнопка выбора" value={ui.choiceButton} onChange={(choiceButton) => updateUi({ choiceButton })} /><AssetPicker title="Кнопка выбора при наведении" value={ui.choiceButtonHover} onChange={(choiceButtonHover) => updateUi({ choiceButtonHover })} /><div className="field-grid"><Field label="Положение диалога"><select value={ui.dialoguePosition} onChange={(event) => updateUi({ dialoguePosition: event.target.value })}><option value="bottom">Внизу</option><option value="center">По центру</option><option value="top">Вверху</option></select></Field><Field label="Прозрачность"><input type="number" min="10" max="100" value={ui.dialogueOpacity} onChange={(event) => updateUi({ dialogueOpacity: Number(event.target.value) })} /></Field><Field label="Размер диалога"><input type="number" min="14" max="72" value={ui.dialogueFontSize} onChange={(event) => updateUi({ dialogueFontSize: Number(event.target.value) })} /></Field><Field label="Размер текста автора"><input type="number" min="14" max="72" value={ui.narratorFontSize} onChange={(event) => updateUi({ narratorFontSize: Number(event.target.value) })} /></Field><Field label="Цвет диалога"><input type="color" value={ui.dialogueTextColor} onChange={(event) => updateUi({ dialogueTextColor: event.target.value })} /></Field><Field label="Цвет имени"><input type="color" value={ui.dialogueNameColor} onChange={(event) => updateUi({ dialogueNameColor: event.target.value })} /></Field></div><TextAppearance/><h3>Кнопки главного меню</h3><div className="ui-toggle-grid">{[["start", "Новая игра"], ["load", "Загрузка"], ["gallery", "Галерея"], ["preferences", "Настройки"], ["about", "Об игре"], ["quit", "Выход"]].map(([key, label]) => <label key={key}><input type="checkbox" checked={ui.mainMenuButtons[key]} onChange={(event) => updateButtons("mainMenuButtons", key, event.target.checked)} />{label}</label>)}</div><h3>Быстрое меню</h3><div className="ui-toggle-grid">{[["rollback", "Назад"], ["history", "История"], ["auto", "Авто"], ["skip", "Пропуск"], ["save", "Сохранить"], ["load", "Загрузить"], ["preferences", "Настройки"]].map(([key, label]) => <label key={key}><input type="checkbox" checked={ui.quickMenuButtons[key]} onChange={(event) => updateButtons("quickMenuButtons", key, event.target.checked)} />{label}</label>)}</div></section></div>;
}

function LibraryView({ section, onSettings }) {
  const { project } = useProjectStore();
  const labels = { project: ["Проект", "Название, иконка, курсор и параметры готовой игры", GearSix], story: ["Сюжет и логика", "Карта истории, переменные, флаги и условия", GitBranch], characters: ["Персонажи", "Герои, их имена, цвета и наборы спрайтов", Users], backgrounds: ["Фоны", "Все изображения сцен в одном месте", ImageSquare], music: ["Музыка", "Музыкальные темы и настройки воспроизведения", MusicNotes], sounds: ["Звуки", "Эффекты, окружение и голосовые файлы", SpeakerHigh], resources: ["Ресурсы", "Изображения, аудио, видео, шрифты и интерфейс", FolderSimple], gallery: ["Галерея", "Разделы CG и условия разблокировки", ImageSquare], interface: ["Интерфейс игры", "Главное меню, диалог, выборы и быстрые кнопки", Palette], settings: ["Настройки", "Поведение редактора и параметры проекта", GearSix] };
  const [title, subtitle, Icon] = labels[section] ?? labels.resources;
  return <main className="library-view"><header><div><Icon size={28} weight="duotone" /><div><h1>{title}</h1><p>{subtitle}</p></div></div>{["project", "settings"].includes(section) && <button className="button primary" onClick={onSettings}><GearSix />Настроить проект</button>}</header>
    {section === "characters" ? <CharacterWorkspace /> : section === "story" ? <LogicWorkspace /> : section === "gallery" ? <GalleryWorkspace /> : section === "interface" ? <InterfaceWorkspace /> : ["resources", "backgrounds", "music", "sounds"].includes(section) ? <ResourceWorkspace section={section} /> : <div className="project-summary"><BookOpenText size={42} weight="duotone" /><div><h2>{project.meta.title}</h2><p>{project.meta.author} · версия {project.meta.version}</p><button className="button secondary" onClick={onSettings}>Открыть настройки проекта</button></div></div>}
  </main>;
}

function PreviewModal({ onClose }) {
  const { project, activeSceneId, activeActionId } = useProjectStore();
  const [state, setState] = useState(() => advancePreview(project, initialPreview(project, activeSceneId)));
  const [runStatus, setRunStatus] = useState("");
  const [running, setRunning] = useState(false);
  const players = useRef({});
  const action = state.waiting?.type === "pause" ? state.displayText : state.waiting;
  const scene = project.scenes[state.sceneId];
  const speaker = project.characters.find((item) => item.id === action?.speakerId);
  const restart = (id, actionId) => setState(advancePreview(project, initialPreview(project,id,actionId)));
  useEffect(()=>{if(state.waiting?.type!=='pause')return;const timer=setTimeout(()=>setState(s=>advancePreview(project,s)),Math.max(.1,Number(state.waiting.duration)||.01)*1000);return()=>clearTimeout(timer);},[state.waiting?.id,state.sceneId]);
  useEffect(() => {
    for (const channel of ["music","sound","voice","ambience"]) {
      const track=state.audio[channel], existing=players.current[channel];
      if (existing?.token === track?.token) continue;
      existing?.audio.pause(); delete players.current[channel];
      const resource=project.resources.find((r)=>r.id===track?.assetId);
      if (resource) { const audio=new Audio(resource.source); audio.volume=Math.max(0,Math.min(1,track.volume ?? 1)); audio.loop=track.loop ?? channel==="music"; players.current[channel]={audio,token:track.token}; audio.play().catch(()=>setRunStatus("Нажмите «Далее», чтобы браузер разрешил звук.")); }
    }
  },[state.audio,project.resources]);
  useEffect(()=>()=>{Object.values(players.current).forEach(({audio})=>audio.pause());},[]);
  const runRealPreview = async () => {
    const result=validateProject(project);
    if (!result.valid) {setRunStatus(`Исправьте ошибки проекта: ${result.summary.errors}.`);return;}
    setRunning(true);setRunStatus("Запускаем игру…");
    try { await window.istoriya.runPreview(project,state.sceneId,action?.id);setRunStatus("Игра открыта в отдельном окне."); }
    catch(error){setRunStatus(error.message || "Не удалось запустить игру");}
    finally {setRunning(false);}
  };
  return <div className="modal-backdrop preview-backdrop"><div className="preview-window"><div className="preview-header"><strong>Предпросмотр · {scene?.title} · блок {state.index+1}</strong><div className="preview-actions">{window.istoriya?.runPreview && <button className="button primary" disabled={running} onClick={runRealPreview}>Запустить в Ren’Py</button>}<button className="icon-button" aria-label="Закрыть предпросмотр" onClick={onClose}><X /></button></div></div>
    <div className="preview-debug-toolbar"><button onClick={()=>restart(project.chapters[0].scenes[0])}>С начала игры</button><button onClick={()=>restart(activeSceneId,activeActionId)}>С выбранного действия</button><select aria-label="Перейти к сцене" value={state.sceneId} onChange={(e)=>restart(e.target.value)}>{Object.values(project.scenes).map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</select><button onClick={()=>setState(s=>advancePreview(project,s))} disabled={state.ended || action?.type==="choice" || state.waiting?.type==="pause"}>Далее</button></div>
    {runStatus && <div className="preview-status">{runStatus}</div>}
    <div className="preview-game" onClick={()=>!state.ended && state.waiting?.type!=="pause" && setState(s=>advancePreview(project,s))} style={{aspectRatio:`${project.meta.resolution.width}/${project.meta.resolution.height}`}}>
      {state.background && <img src={state.background} alt="Фон сцены" />}
      {state.layers.filter(l=>l.visible!==false).map((layer,index)=>{const character=project.characters.find(c=>c.id===layer.characterId);const {source}=resolveCharacterSprite(character,layer.spriteId,project.resources);return source && <img key={layer.id ?? index} className="preview-actor" src={source} alt={character.name} style={{left:`${layer.x ?? 50}%`,top:`${layer.y ?? 100}%`,opacity:(layer.opacity ?? 100)/100,transform:`translate(-50%,-100%) rotate(${layer.rotation ?? 0}deg) scale(${(layer.flip?-1:1)*(layer.scale ?? 100)/100},${(layer.scale ?? 100)/100})`}} />;})}
      {state.cg && <img className="preview-cg" src={state.cg} alt="Иллюстрация" />}
      {["dialogue","narration"].includes(action?.type) && !state.ended && <div className={`preview-dialogue position-${project.ui.dialoguePosition}`} style={{backgroundImage:project.ui.dialogueBackground ? `url(${project.ui.dialogueBackground})` : undefined,opacity:project.ui.dialogueOpacity/100}}>{action.type==="dialogue" && <strong style={{color:speaker?.color}}>{speaker?.name ?? "Автор"}</strong>}<StyledText project={project} action={action} animate factor={.75}>{action.text}</StyledText><span>Нажмите, чтобы продолжить</span></div>}
      {action?.type==="choice" && !state.ended && <div className="preview-choice"><strong>{action.prompt}</strong>{action.options.map(option=><button key={option.id} onClick={(event)=>{event.stopPropagation();setState(s=>advancePreview(project,s,option.id));}}>{option.text}</button>)}</div>}
      {state.ended && <div className="preview-empty">{state.error ?? "Игра завершена"}</div>}
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
  </div><div className="dialog-footer"><button className="button secondary" onClick={onClose}>Закрыть</button><button className="button primary" onClick={onClose}><Check />Готово</button></div></div></div>;
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
  const expectedSize = projectSize + (selected === "android" ? 105 : selected === "windows" ? 125 : 115) * 1024 * 1024;
  const build = async () => {
    if (!platform?.ready) { setStatus({ state: "error", message: "Эта платформа пока не подключена к модулю сборки." }); return; }
    const validation = validateProject(project);
    if (!validation.valid) { setStatus({ state: "error", message: `Сборка остановлена: найдено ошибок — ${validation.summary.errors}. Откройте «Проверить проект» и исправьте их.` }); return; }
    if (!desktop) { await onExport(); setStatus({ state: "success", message: "Проект сохранён. Настольная версия соберёт из него готовую игру." }); return; }
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
  return <div className="modal-backdrop"><div className="dialog build-dialog"><div className="dialog-header"><div><Package /><div><h2>Собрать игру</h2><p>{project.meta.title} · версия {project.meta.version}</p></div></div><button className="icon-button" onClick={onClose} aria-label="Закрыть"><X /></button></div><div className="build-layout"><div className="platform-list">{platforms.map(({ id, title, text, icon: Icon, ready }) => <button key={id} className={selected === id ? "active" : ""} onClick={() => { setSelected(id); setStatus({ state: "idle", message: "" }); }}><Icon /><span><strong>{title}</strong><small>{text}</small></span>{ready ? <CheckCircle weight="fill" /> : <WarningCircle />}</button>)}</div><div className="build-summary"><div className="build-mark"><Package weight="duotone" /></div><h3>Сборка для {platform?.title}</h3><p>Редактор проверит сцены, подготовит ресурсы и создаст проект Ren’Py без ручной работы с кодом.</p><div className="build-info"><span>Разрешение<strong>{project.meta.resolution.width} × {project.meta.resolution.height}</strong></span><span>Сцен<strong>{Object.keys(project.scenes).length}</strong></span><span>Ресурсы<strong>{formatBytes(projectSize)}</strong></span><span>Ожидается<strong>≈ {formatBytes(expectedSize)}</strong></span></div><button className="button primary wide" onClick={build} disabled={status.state === "building"}><Package />{status.state === "building" ? "Собираем…" : desktop ? `Собрать для ${platform?.title}` : "Сохранить проект"}</button>{status.message && <div className={`build-status ${status.state}`}>{status.state === "building" && <ClockCountdown />}{status.message}</div>}<small>{desktop ? (platform?.ready ? buildNote : "Платформа требует дополнительной настройки модуля сборки.") : "В браузере сохраняется переносимый проект. Полная настольная версия выполняет сборку автоматически."}</small></div></div></div></div>;
}

function ValidationModal({ onClose }) {
  const { project, setActiveScene, setActiveSection, setSelectedResource, setSelectedCharacter, setActiveAction } = useProjectStore();
  const result = useMemo(() => validateProject(project), [project]);
  const openIssue = (item) => {
    if (item.sceneId) { setActiveScene(item.sceneId); if (item.actionId) setActiveAction(item.actionId); }
    else if (item.resourceId) { setSelectedResource(item.resourceId); setActiveSection("resources"); }
    else if (item.characterId) { setSelectedCharacter(item.characterId); setActiveSection("characters"); }
    else return;
    onClose();
  };
  return <div className="modal-backdrop"><div className="dialog validation-dialog"><div className="dialog-header"><div><CheckCircle weight="duotone" /><div><h2>Проверка проекта</h2><p>{result.valid ? "Критических ошибок нет" : "Перед сборкой исправьте ошибки"}</p></div></div><button className="icon-button" onClick={onClose}><X /></button></div><div className="validation-summary"><div className={result.summary.errors ? "bad" : "good"}><strong>{result.summary.errors}</strong><span>Ошибок</span></div><div className={result.summary.warnings ? "warn" : "good"}><strong>{result.summary.warnings}</strong><span>Предупреждений</span></div><div><strong>{Object.keys(project.scenes).length}</strong><span>Сцен проверено</span></div></div><div className="validation-list">{!result.issues.length && <div className="validation-empty"><CheckCircle weight="fill" /><strong>Проект готов к сборке</strong><span>Все ссылки, ресурсы и переходы корректны.</span></div>}{result.issues.map((item) => <button key={item.id} className={item.severity} onClick={() => openIssue(item)} disabled={!item.sceneId && !item.resourceId && !item.characterId}><span>{item.severity === "error" ? <WarningCircle weight="fill" /> : <WarningCircle />}</span><div><strong>{item.severity === "error" ? "Ошибка" : "Предупреждение"}</strong><p>{item.message}</p></div>{(item.sceneId || item.resourceId || item.characterId) && <CaretRight />}</button>)}</div><div className="dialog-footer"><button className="button primary" onClick={onClose}>Закрыть</button></div></div></div>;
}

export function App() {
  const { project, activeSection, bottomTab, activeSceneId, setSceneBackground, addResource, importProject, newProject, openProject, undo, redo, saveNow } = useProjectStore();
  const [view, setView] = useState("home");
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const backgroundInput = useRef();
  const importInput = useRef();
  const actionClipboard = useRef(null);
  const openFile = async () => {
    if (!window.istoriya?.openProject) { importInput.current?.click(); return; }
    try { const loaded = await window.istoriya.openProject(); if (loaded) { importProject(loaded); setView("editor"); setToast("Проект открыт"); } }
    catch (error) { setToast(error.message || "Не удалось открыть проект"); }
  };
  const onExport = async () => {
    if (window.istoriya?.saveProject) {
      const result = await window.istoriya.saveProject(project);
      if (!result.canceled) setToast("Проект сохранён");
      return result;
    }
    downloadJson(project);
    setToast("Файл проекта подготовлен");
    return { canceled: false };
  };

  useEffect(() => {
    const handler = (event) => {
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(event.target?.tagName) || event.target?.isContentEditable;
      const key = event.key.toLowerCase();
      if (event.key === "F5") { event.preventDefault(); setModal("preview"); return; }
      if (event.key === "Delete" && !typing) {
        const state = useProjectStore.getState();
        if (state.activeActionId) state.removeAction(state.activeSceneId, state.activeActionId);
        else if (state.activeLayerId) state.removeSceneCharacter(state.activeSceneId, state.activeLayerId);
        return;
      }
      if (!event.ctrlKey) return;
      if (key === "s") { event.preventDefault(); saveNow(); setToast("Проект сохранён"); }
      if (key === "z") { event.preventDefault(); undo(); }
      if (key === "y") { event.preventDefault(); redo(); }
      if (key === "f") { event.preventDefault(); document.querySelector(".search-field input")?.focus(); }
      if (key === "c" && !typing) { const state = useProjectStore.getState(); const action = state.project.scenes[state.activeSceneId]?.actions.find((item) => item.id === state.activeActionId); if (action) { actionClipboard.current = structuredClone(action); setToast("Действие скопировано"); } }
      if (key === "v" && !typing && actionClipboard.current) { event.preventDefault(); const state = useProjectStore.getState(); state.pasteAction(state.activeSceneId, actionClipboard.current); setToast("Действие вставлено"); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [saveNow, undo, redo]);

  useEffect(() => { if (!toast) return undefined; const timer = setTimeout(() => setToast(null), 2400); return () => clearTimeout(timer); }, [toast]);
  const mainWorkspace = useMemo(() => activeSection === "scenes", [activeSection]);
  const mapWorkspace = mainWorkspace && bottomTab === "map";
  const openImportedProject = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try { importProject(JSON.parse(await file.text())); setView("editor"); setToast("Проект открыт"); }
    catch { setToast("Не удалось открыть файл проекта"); }
    event.target.value = "";
  };

  if (view === "home") return <><ProjectHub onNewProject={async (template) => { const next = newProject(template); if (next.meta.projectFolder && window.istoriya?.createProjectOnDisk) await window.istoriya.createProjectOnDisk(next); setView("editor"); }} onOpenProject={(projectId) => { if (openProject(projectId)) setView("editor"); }} onOpenFile={openFile} /><input ref={importInput} hidden type="file" accept=".vnproject,application/json" onChange={openImportedProject} />{toast && <div className="toast"><CheckCircle weight="fill" />{toast}</div>}</>;

  return (
    <div className={`app-shell ${mainWorkspace ? "" : "library-mode"} ${mapWorkspace ? "map-mode" : ""}`}><ProjectFonts project={project}/><TopBar onPreview={() => setModal("preview")} onBuild={() => setModal("build")} onValidate={() => setModal("validation")} onSettings={() => setModal("settings")} onExport={onExport} onImport={openFile} onHome={() => { saveNow(); setView("home"); }} /><NavigationRail /><ProjectTree />
      {mainWorkspace ? <EditorWorkspace map={mapWorkspace} scene={<SceneCanvas onBackgroundPick={() => backgroundInput.current?.click()} />}><ScenarioEditor /></EditorWorkspace> : <LibraryView section={activeSection} onSettings={() => setModal("settings")} />}
      {mainWorkspace && !mapWorkspace && <Inspector />}
      <input ref={backgroundInput} hidden type="file" accept="image/*" onChange={async (event) => { const file = event.target.files?.[0]; if (file) { const resource = await fileToResource(file, "background", project); if (resource) { addResource(resource); setSceneBackground(activeSceneId, resource.source, file.name); } event.target.value = ""; } }} />
      <input ref={importInput} hidden type="file" accept=".vnproject,application/json" onChange={openImportedProject} />
      {modal === "preview" && <PreviewModal onClose={() => setModal(null)} />}{modal === "settings" && <SettingsModal onClose={() => setModal(null)} />}{modal === "build" && <BuildModal onClose={() => setModal(null)} onExport={onExport} />}{modal === "validation" && <ValidationModal onClose={() => setModal(null)} />}{toast && <div className="toast"><CheckCircle weight="fill" />{toast}</div>}
    </div>
  );
}
