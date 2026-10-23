import { createId } from "../data/defaultProject.js";
import { targetScene, chapterEntry, storyActions, orderedStoryScenes } from "../../runtime/story-routing.mjs";
import { timelineClips } from "../../runtime/timeline-model.mjs";
import {resolveAuthorDestination} from './storyDestinations.js';

export const isTerminal = (action) => ["jump", "choice", "condition", "end"].includes(action?.type);
export const sceneOrder = orderedStoryScenes;

export function sceneExits(project, sceneId, navigation=null) {
  const scene = project.scenes[sceneId];
  if (!scene) return [];
  const action = storyActions(scene).find(isTerminal);
  const edge = (key, target, label, extra = {}) => ({ id: `${sceneId}:${key}`, from: sceneId, to: target || null, label, actionId: action?.id, ...extra });
  // Reactions are alternate exits, not the terminal storyboard action.
  const props=(scene.images??[]).flatMap(layer=>(layer.interactions??[]).filter(r=>r.targetSceneId||r.targetChapterId).map(r=>edge(`prop:${layer.id}:${r.id}`,targetScene(project,r),r.label||'Действие предмета',{kind:'prop',actionId:null,layerId:layer.id,reactionId:r.id,layerName:layer.name,chapterId:r.targetChapterId})));
  if (action?.type === "end") return props;
  if (action?.type === "jump") return [...props,edge(action.id, targetScene(project, action), "Переход", { kind: "jump", chapterId: action.targetChapterId })];
  if (action?.type === "choice") return [...props,...action.options.map((option) => edge(option.id, targetScene(project, option), option.text || "Вариант без названия", { kind: "choice", optionId: option.id, chapterId: option.targetChapterId }))];
  if (action?.type === "condition") return [...props,edge(`${action.id}:yes`, targetScene(project,action,'trueSceneId'), "Если да", { kind: "condition", field: "trueSceneId", chapterId:action.trueChapterId }), edge(`${action.id}:no`, targetScene(project,action,'falseSceneId'), "Если нет", { kind: "condition", field: "falseSceneId", chapterId:action.falseChapterId })];
  const order = navigation?null:sceneOrder(project);
  const next = navigation?navigation.nextSceneId:order[order.indexOf(sceneId) + 1];
  return next ? [...props,edge("next", next, "По порядку глав", { kind: "implicit" })] : props;
}

export function exitObject(project,edge) {
  if(!edge||!sceneExits(project,edge.from).some(e=>e.id===edge.id&&e.kind===edge.kind&&e.actionId===edge.actionId))return null;
  const scene=project.scenes[edge.from];
  if(edge.kind==='prop')return scene.images?.find(l=>l.id===edge.layerId)?.interactions?.find(r=>r.id===edge.reactionId)??null;
  const action=scene.actions.find(a=>a.id===edge.actionId);
  return edge.kind==='choice'?action?.options.find(o=>o.id===edge.optionId)??null:action??null;
}

function appendTerminal(scene,action) {
  if(scene.timelineEnabled)action.timeline={start:Math.max(0,...timelineClips(scene).filter(c=>c.enabled).map(c=>c.end)),duration:1,enabled:true};
  scene.actions.push(action);
}

export function connectScenes(project, from, to) {
  const {chapterId,sceneId}=resolveAuthorDestination(project,to);
  if (chapterId) {
    const entry = chapterEntry(project, chapterId);
    if (!entry) throw new Error('Сначала добавьте в главу входную сцену.');
    connectScenes(project, from, {sceneId:entry});
    const terminal = storyActions(project.scenes[from]).find(isTerminal);
    if (terminal.type === 'choice') terminal.options.at(-1).targetChapterId = chapterId;
    else terminal.targetChapterId = chapterId;
    return;
  }
  to=sceneId;
  if (!project.scenes[from] || !project.scenes[to]) throw new Error("Сцена не найдена");
  const scene = project.scenes[from];
  const terminal = storyActions(scene).find(isTerminal);
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
  else appendTerminal(scene,{ id: createId("act"), type: "jump", targetSceneId: to });
}

export function updateExit(project, edge, patch) {
  if(!sceneExits(project,edge.from).some(e=>e.id===edge.id&&e.kind===edge.kind&&e.actionId===edge.actionId))throw new Error('Переход уже изменён. Выберите актуальную связь на карте.');
  const {chapterId,sceneId:destination}=resolveAuthorDestination(project,patch.to);
  if(edge.kind==='implicit'){if(destination)connectScenes(project,edge.from,{sceneId:destination,chapterId});return;}
  const object=exitObject(project,edge);if(!object)return;
  if('to' in patch){const field=edge.field??'targetSceneId',chapterField=field.replace('SceneId','ChapterId');object[field]=destination;if(chapterId)object[chapterField]=chapterId;else delete object[chapterField];}
  if('label' in patch){if(edge.kind==='choice')object.text=patch.label;if(edge.kind==='prop')object.label=patch.label;}
  if('condition' in patch&&['choice','prop','condition'].includes(edge.kind))object.condition=edge.kind==='condition'?(patch.condition??{kind:'all',conditions:[]}):patch.condition;
  if('effects' in patch&&['choice','prop'].includes(edge.kind))object.effects=patch.effects;
  if('prompt' in patch&&edge.kind==='choice')project.scenes[edge.from].actions.find(a=>a.id===edge.actionId).prompt=patch.prompt;
}

export function removeExit(project, edge) {
  const scene = project.scenes[edge.from];
  if (!scene) return;
  if(!sceneExits(project,edge.from).some(e=>e.id===edge.id&&e.kind===edge.kind&&e.actionId===edge.actionId))return;
  if(edge.kind==='prop'){const object=exitObject(project,edge);delete object.targetSceneId;delete object.targetChapterId;return;}
  if (edge.kind === "implicit") { appendTerminal(scene,{ id: createId("act"), type: "end" }); return; }
  const index = scene.actions.findIndex((item) => item.id === edge.actionId);
  const action = scene.actions[index];
  if (!action) return;
  if (edge.kind === "condition") { action[edge.field] = null; delete action[edge.field.replace('SceneId','ChapterId')]; return; }
  if (edge.kind === "choice" && action.options.length > 1) { action.options = action.options.filter((item) => item.id !== edge.optionId); return; }
  scene.actions[index] = { id: action.id, type: "end",...(action.timeline?{timeline:action.timeline}:{}) };
}

export function renumberScenes(project) {
  project.chapters.forEach((chapter, ci) => chapter.scenes.forEach((id, si) => { if (project.scenes[id]) project.scenes[id].number = `${ci + 1}.${si + 1}`; }));
}
