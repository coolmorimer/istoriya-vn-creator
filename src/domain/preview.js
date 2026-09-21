import { timelineEvents } from "../../runtime/timeline-model.mjs";
const actionsFor = scene => scene?.timelineEnabled ? timelineEvents(scene) : scene?.actions ?? [];
import { resolveStoryProject, targetScene } from "../../runtime/story-routing.mjs";
export function initialPreview(project, sceneId, actionId) {
  const scene = project.scenes[sceneId];
  return { sceneId, index: Math.max(0, actionsFor(scene).findIndex((action) => action.id === actionId) ?? 0), variables: Object.fromEntries(project.variables.map((v) => [v.id, v.initial])), flags: Object.fromEntries(project.flags.map((f) => [f.id, f.initial])), background: scene?.background, layers: structuredClone(scene?.characters ?? []), audio: {}, cg: null, notification: null, waiting: null, timelineTime:0, displayText:null, ended: false };
}
export function conditionPass(condition, state, project) {
  if (!condition) return true;
  const variable = project.variables.find((v) => v.id === condition.variableId);
  const a = condition.flagId ? state.flags[condition.flagId] : state.variables[condition.variableId];
  const b = condition.flagId || variable?.type === "boolean" ? condition.value === true || condition.value === "true" : ["number", "relationship"].includes(variable?.type) ? Number(condition.value) : String(condition.value ?? "");
  return ({ eq: () => a === b, neq: () => a !== b, gt: () => a > b, gte: () => a >= b, lt: () => a < b, lte: () => a <= b }[condition.operator ?? "eq"] ?? (() => false))();
}
function changeValue(effect, state, project) {
  if (effect.kind === "flag" || effect.type === "flag") { state.flags[effect.flagId] = effect.value === true || effect.value === "true"; return; }
  const variable = project.variables.find((v) => v.id === effect.variableId);
  if (!variable) return;
  const numeric = ["number", "relationship"].includes(variable.type);
  const value = numeric ? Number(effect.value) || 0 : variable.type === "boolean" ? effect.value === true || effect.value === "true" : String(effect.value ?? "");
  state.variables[variable.id] = numeric && effect.operation === "add" ? Number(state.variables[variable.id]) + value : numeric && effect.operation === "subtract" ? Number(state.variables[variable.id]) - value : value;
  if (variable.type === "relationship") state.variables[variable.id] = Math.min(variable.max ?? 100, Math.max(variable.min ?? 0, state.variables[variable.id]));
}
export function advancePreview(project, previous, optionId) {
  project = resolveStoryProject(project);
  const state = structuredClone(previous);
  const enter = (id) => {
    const scene = project.scenes[id];
    if (!scene) { state.ended = true; state.error = "Сцена перехода не найдена"; return; }
    Object.assign(state, { sceneId:id, index:0, background:scene.background, layers:structuredClone(scene.characters ?? []), cg:null, waiting:null, timelineTime:0, displayText:null });
  };
  if (state.waiting?.type === "choice") {
    const option = state.waiting.options.find((o) => o.id === optionId && conditionPass(o.condition,state,project));
    if (!option) return state;
    for (const effect of option.effects ?? []) changeValue(effect,state,project);
    enter(targetScene(project, option));
  } else if (state.waiting) { if(state.waiting.timelineTextEnd)state.displayText=null; state.index++; state.waiting = null; }
  const order = project.chapters.flatMap((c) => c.scenes);
  for (let count = 0; count < 1000 && !state.ended; count++) {
    const scene = project.scenes[state.sceneId];
    const action = actionsFor(scene)[state.index];
    if (!action) { const next = order[order.indexOf(state.sceneId)+1]; if (next) { enter(next); continue; } state.ended=true; break; }
    if(action.type==='timelineWait') { const duration=action.time-(state.timelineTime??0);state.timelineTime=action.time;if(duration>.001){state.waiting={id:'timeline-'+state.index,type:'pause',duration};return state;}state.index++;continue; }
    if(action.type==='timelineTextEnd'){if(action.wait){state.waiting={...state.displayText,timelineTextEnd:true};return state;}state.displayText=null;state.index++;continue;}
    if(action.type==='timelineStopAudio'){delete state.audio[action.channel];state.index++;continue;}
    if(action.type==='timelineBackgroundEnd'){state.background=scene.background;state.index++;continue;}
    if(scene.timelineEnabled&&action.type==='pause'){state.index++;continue;}
    if(scene.timelineEnabled&&['dialogue','narration'].includes(action.type)){state.displayText=action;state.index++;continue;}
    if (["dialogue","narration","choice","pause"].includes(action.type)) {
      if (action.type === "dialogue" && action.spriteId) { const layer = state.layers.find((l) => l.characterId === action.speakerId); if (layer) layer.spriteId=action.spriteId; }
      if (action.voiceAssetId) state.audio.voice = {assetId:action.voiceAssetId, token:`${state.sceneId}-${state.index}`, volume:1};
      state.waiting = action.type === "choice" ? {...action,options:action.options.filter((o) => conditionPass(o.condition,state,project))} : action;
      if (action.type === "choice" && !state.waiting.options.length) { state.error="Все варианты скрыты условиями"; state.ended=true; }
      return state;
    }
    if (action.type === "jump") { enter(action.targetSceneId); continue; }
    if (action.type === "condition") { enter(conditionPass(action,state,project) ? action.trueSceneId : action.falseSceneId); continue; }
    if (action.type === "end") { state.ended=true; break; }
    if (["variable","flag"].includes(action.type)) changeValue(action,state,project);
    if (action.type === "background") { state.background=project.resources.find((r) => r.id===action.assetId)?.source; if(!scene.timelineEnabled)state.layers=[]; }
    if (["music","sound","voice","ambience"].includes(action.type)) state.audio[action.type]={...action,token:`${state.sceneId}-${state.index}`};
    if (action.type === "stopMusic") delete state.audio.music;
    if (action.type === "showCG") state.cg=project.resources.find((r) => r.id===action.assetId)?.source;
    if (action.type === "hideCG") state.cg=null;
    if (action.type === "event") state.notification=action.text;
    if (action.type === "hideCharacter") state.layers=state.layers.filter((l)=>l.characterId!==action.characterId);
    if (["showCharacter","changeSprite","moveCharacter"].includes(action.type)) {
      let layer=state.layers.find((l)=>l.characterId===action.characterId);
      if (!layer) { layer={characterId:action.characterId,x:50,y:100,scale:100,opacity:100,rotation:0,visible:true}; state.layers.push(layer); }
      if (["showCharacter", "changeSprite"].includes(action.type)) layer.spriteId=action.spriteId ?? null;
      if (action.position) layer.x=({left:25,center:50,right:75})[action.position];
      for (const key of ['x','y','scale']) if (action[key] != null) layer[key]=action[key];
    }
    state.index++;
  }
  if (!state.ended) { state.ended=true; state.error="Обнаружен бесконечный цикл без реплик или выбора"; }
  return state;
}
