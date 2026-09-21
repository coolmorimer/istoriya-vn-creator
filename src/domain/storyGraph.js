import { createId } from "../data/defaultProject.js";
import { targetScene, chapterEntry } from "../../runtime/story-routing.mjs";

export const isTerminal = (action) => ["jump", "choice", "condition", "end"].includes(action?.type);
export const sceneOrder = (project) => [...new Set([...project.chapters.flatMap((chapter) => chapter.scenes), ...Object.keys(project.scenes)])].filter((id) => project.scenes[id]);

export function sceneExits(project, sceneId) {
  const scene = project.scenes[sceneId];
  if (!scene) return [];
  const action = scene.actions.find(isTerminal);
  const edge = (key, target, label, extra = {}) => ({ id: `${sceneId}:${key}`, from: sceneId, to: target || null, label, actionId: action?.id, ...extra });
  if (action?.type === "end") return [];
  if (action?.type === "jump") return [edge(action.id, targetScene(project, action), "Переход", { kind: "jump", chapterId: action.targetChapterId })];
  if (action?.type === "choice") return action.options.map((option) => edge(option.id, targetScene(project, option), option.text || "Вариант без названия", { kind: "choice", optionId: option.id, chapterId: option.targetChapterId }));
  if (action?.type === "condition") return [edge(`${action.id}:yes`, targetScene(project,action,'trueSceneId'), "Если да", { kind: "condition", field: "trueSceneId", chapterId:action.trueChapterId }), edge(`${action.id}:no`, targetScene(project,action,'falseSceneId'), "Если нет", { kind: "condition", field: "falseSceneId", chapterId:action.falseChapterId })];
  const order = sceneOrder(project);
  const next = order[order.indexOf(sceneId) + 1];
  return next ? [edge("next", next, "По порядку глав", { kind: "implicit" })] : [];
}

export function connectScenes(project, from, to) {
  const chapterId = to?.startsWith('chapter:') ? to.slice(8) : null;
  if (chapterId) {
    const entry = chapterEntry(project, chapterId);
    if (!entry) throw new Error('Сначала добавьте в главу входную сцену.');
    connectScenes(project, from, entry);
    const terminal = project.scenes[from].actions.find(isTerminal);
    if (terminal.type === 'choice') terminal.options.at(-1).targetChapterId = chapterId;
    else terminal.targetChapterId = chapterId;
    return;
  }
  if (!project.scenes[from] || !project.scenes[to]) throw new Error("Сцена не найдена");
  const scene = project.scenes[from];
  const terminal = scene.actions.find(isTerminal);
  if (terminal?.type === "condition") throw new Error("У условия выберите ветку «Если да» или «Если нет» в свойствах связи.");
  if (terminal?.type === "choice") {
    terminal.options.push({ id: createId("choice"), text: `Вариант ${terminal.options.length + 1}`, targetSceneId: to, effects: [] });
    return;
  }
  if (terminal?.type === "jump") {
    if (targetScene(project,terminal) === to) { terminal.targetSceneId=to; delete terminal.targetChapterId; return; }
    const oldTarget = targetScene(project, terminal);
    const oldChapter = terminal.targetChapterId;
    Object.assign(terminal, { type: "choice", prompt: "Что сделать?", options: [{ id: createId("choice"), text: project.scenes[oldTarget]?.title ?? "Первый вариант", targetSceneId: oldTarget, effects: [] }, { id: createId("choice"), text: project.scenes[to].title, targetSceneId: to, effects: [] }] });
    delete terminal.targetSceneId;
    if (oldChapter) terminal.options[0].targetChapterId = oldChapter;
    delete terminal.targetChapterId;
    return;
  }
  if (terminal?.type === "end") Object.assign(terminal, { type: "jump", targetSceneId: to });
  else scene.actions.push({ id: createId("act"), type: "jump", targetSceneId: to });
}

export function updateExit(project, edge, patch) {
  if ('to' in patch && patch.to?.startsWith('chapter:')) {
    const chapterId = patch.to.slice(8), entry = chapterEntry(project, chapterId);
    if (!entry) throw new Error('Сначала добавьте в главу входную сцену.');
    updateExit(project, edge, { ...patch, to: entry });
    const action = project.scenes[edge.from]?.actions.find(isTerminal);
    const object = edge.kind === 'choice' ? action?.options.find(o => o.id === edge.optionId) : action;
    if (object) object[(edge.field ?? 'targetSceneId').replace('SceneId','ChapterId')] = chapterId;
    return;
  }
  const scene = project.scenes[edge.from];
  if (!scene) return;
  if (patch.to && !project.scenes[patch.to]) throw new Error("Сцена назначения не найдена");
  if (edge.kind === "implicit") { if (patch.to) connectScenes(project, edge.from, patch.to); return; }
  const action = scene.actions.find((item) => item.id === edge.actionId);
  if (!action) return;
  if ('to' in patch) {
    const object = edge.kind === 'choice' ? action.options.find(o => o.id === edge.optionId) : action;
    if (object) delete object[(edge.field ?? 'targetSceneId').replace('SceneId','ChapterId')];
  }
  if (edge.kind === "choice") {
    const option = action.options.find((item) => item.id === edge.optionId);
    if (option) { if ("to" in patch) option.targetSceneId = patch.to; if ("label" in patch) option.text = patch.label; }
  } else if ("to" in patch) action[edge.field ?? "targetSceneId"] = patch.to;
}

export function removeExit(project, edge) {
  const scene = project.scenes[edge.from];
  if (!scene) return;
  if (edge.kind === "implicit") { scene.actions.push({ id: createId("act"), type: "end" }); return; }
  const index = scene.actions.findIndex((item) => item.id === edge.actionId);
  const action = scene.actions[index];
  if (!action) return;
  if (edge.kind === "condition") { action[edge.field] = null; delete action[edge.field.replace('SceneId','ChapterId')]; return; }
  if (edge.kind === "choice" && action.options.length > 1) { action.options = action.options.filter((item) => item.id !== edge.optionId); return; }
  scene.actions[index] = { id: action.id, type: "end" };
}

export function renumberScenes(project) {
  project.chapters.forEach((chapter, ci) => chapter.scenes.forEach((id, si) => { if (project.scenes[id]) project.scenes[id].number = `${ci + 1}.${si + 1}`; }));
}
