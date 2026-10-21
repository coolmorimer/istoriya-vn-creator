import { defaultProject, createId } from "../data/defaultProject.js";
import {defaultGameUi} from '../../runtime/game-ui.mjs';
import {defaultRpg} from '../../runtime/rpg-model.mjs';

export function createProject(configuration = {}) {
  const options = typeof configuration === "string" ? { template: configuration } : configuration;
  const template = options.template ?? "empty";
  const project = structuredClone(defaultProject);
  project.id = createId("project");
  project.rpg=defaultRpg();
  const now = new Date().toISOString();
  Object.assign(project.meta, { title: options.title?.trim() || (template === "tutorial" ? "Учебная история" : "Новая история"), author: options.author?.trim() || "", description: "", icon: options.icon ?? null, createdAt: now, modifiedAt: now, projectFolder: options.projectFolder ?? null });
  project.meta.android.packageName = `com.istoriya.p${project.id.split("_").at(-1)}`;
  project.meta.resolution = options.resolution ?? (template === "vertical" ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 });
  if (template !== "tutorial") {
    const sceneId = createId("scene");
    project.scenes = { [sceneId]: { id: sceneId, number: "1.1", title: "Начало", description: "", background: null, backgroundResourceId: null, transition: "none", duration: 1, characters: [], actions: [] } };
    project.chapters = [{ id: createId("chapter"), title: "Глава 1", scenes: [sceneId] }];
    project.resources = []; project.characters = []; project.variables = []; project.flags = [];project.items=[];
    project.gallery = { sections: [{ id: createId("gallery"), title: "Иллюстрации", items: [] }] };
    project.ui.mainMenuBackground = null;
  }
  project.ui.accent = { romance: "#e77aaa", horror: "#c44251", minimal: "#a8a8a8" }[template] ?? "#ac6bff";
  if (template === "minimal") { project.ui.dialogueOpacity = 72; project.ui.showQuickMenu = false; }
  if (template === "cinematic") project.ui.dialogueOpacity = 68;
  if(template!=='tutorial')project.ui.layout=defaultGameUi(project,true);
  return project;
}
