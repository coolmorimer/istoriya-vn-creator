import { timelineEvents } from "../../runtime/timeline-model.mjs";
const actionsFor = scene => scene?.timelineEnabled ? timelineEvents(scene) : scene?.actions ?? [];
import { resolveStoryProject, targetScene, orderedStoryScenes } from "../../runtime/story-routing.mjs";
import {backgroundTransform,backgroundSource} from '../../runtime/background-transform.mjs';
import {animationSettings,animationEnd} from '../../runtime/character-animation.mjs';
import {sceneCharacterLayers,shownCharacterLayer} from '../../runtime/visual-order.mjs';
import {availableReactions,applyReactionState,explorationReady} from '../../runtime/interactions.mjs';
import {evaluateCondition,applyGameplayEffect,scalarValue} from '../../runtime/game-logic.mjs';
import {AUDIO_CHANNELS,audioVolume,audioFade} from '../../runtime/audio-model.mjs';
import {sceneImages} from '../../runtime/image-layers.mjs';
import {applyMotion,cameraPose,motionDuration,motionTargetKey} from '../../runtime/keyframes.mjs';
import {initialRpg,changeRpgStat,rpgConfig,craftItem,beginEncounter,battleTurn} from '../../runtime/rpg-model.mjs';
let previewRun=0;
function stopPreviewAudio(state,channel,fadeOut=0){delete state.audio[channel];state.audioStops??={};state.audioStops[channel]={fadeOut:audioFade(fadeOut),token:`stop-${++previewRun}`};}
function playPreviewAudio(state,channel,track){state.audio[channel]=track;if(state.audioStops)delete state.audioStops[channel];}
export function initialPreview(project, sceneId, actionId) {
  const scene = project.scenes[sceneId];
  return { rpg:initialRpg(project),sceneId, index: Math.max(0, actionsFor(scene).findIndex((action) => action.id === actionId) ?? 0), variables: Object.fromEntries(project.variables.map((v) => [v.id, scalarValue(v.type,v.initial)])), flags: Object.fromEntries(project.flags.map((f) => [f.id, scalarValue('boolean',f.initial)])), background: backgroundSource(project,scene), backgroundTransform:backgroundTransform(scene?.backgroundTransform),layers: sceneCharacterLayers(scene), audio: {},inventory:{},hiddenProps:[],usedInteractions:[],propImages:{}, cg: null, notification: null, waiting: null, timelineTime:0, displayText:null, ended: false };
}
export function conditionPass(condition, state, project) {
  return evaluateCondition(condition,state,project);
}
function changeValue(effect, state, project) {
  applyGameplayEffect(effect,state,project);
}
function enterPreviewScene(project,state,id) {
 const scene=project.scenes[id];
 if(!scene){state.ended=true;state.error='Сцена перехода не найдена';return;}
 Object.assign(state,{sceneId:id,index:0,background:backgroundSource(project,scene),backgroundTransform:backgroundTransform(scene.backgroundTransform),backgroundActionId:null,layers:sceneCharacterLayers(scene),images:sceneImages(scene),camera:cameraPose(),motions:{},cg:null,cgAssetId:null,waiting:null,timelineTime:0,displayText:null,animations:{}});
}
export function interactPreview(project,previous,layerId,reactionId) {
 project=resolveStoryProject(project);const state=structuredClone(previous);
 if(state.waiting?.type!=='explore'||state.cg||state.ended)return state;
 const scene=project.scenes[state.sceneId],layer=scene.images?.find(l=>l.id===layerId);
 if(!layer)return state;
 const reaction=availableReactions(scene.id,layer,state,(c,s)=>conditionPass(c,s,project)).find(r=>r.id===reactionId);
 if(!reaction)return state;
 const exploration=state.waiting;
 applyReactionState(scene.id,layer,reaction,state);
 for(const effect of reaction.effects??[])changeValue(effect,state,project);
 const token=`reaction-${++previewRun}`;
 if(reaction.soundAssetId)playPreviewAudio(state,'sound',{assetId:reaction.soundAssetId,volume:reaction.soundVolume??1,token});
 if(reaction.voiceAssetId)playPreviewAudio(state,'voice',{assetId:reaction.voiceAssetId,volume:audioVolume(reaction.voiceVolume),token});
 else stopPreviewAudio(state,'voice');
 if(reaction.text||reaction.voiceAssetId){state.waiting={...reaction,text:reaction.text??'',type:reaction.speakerId?'dialogue':'narration',returnToExplore:exploration};state.displayText=state.waiting;return state;}
 if(reaction.targetSceneId){enterPreviewScene(project,state,reaction.targetSceneId);return advancePreview(project,state);}
 return state;
}
export function rpgPreview(project,previous,operation,id=''){
 const state=structuredClone(previous);if(!rpgConfig(project).enabled||state.waiting?.type!=='rpg'||state.ended)return state;
 const go=destination=>{enterPreviewScene(project,state,destination);return advancePreview(project,state);};
 if(operation==='close'){state.rpg.battle=null;state.waiting=null;state.index++;return advancePreview(project,state);}
 if(operation==='craft'){const result=craftItem(project,state,id);state.rpg.message=result.reason;return state;}
 if(operation==='travel'){const l=rpgConfig(project).locations.find(l=>l.id===id);if(l&&conditionPass(l.condition,state,project)&&project.scenes[l.sceneId])return go(l.sceneId);return state;}
 if(operation==='talk'){const a=rpgConfig(project).actors.find(a=>a.id===state.waiting.actorId&&a.role==='npc');if(!a)return state;const back=state.waiting;state.waiting={id:back.id+'-talk',type:a.characterId?'dialogue':'narration',speakerId:a.characterId,text:a.text,returnToRpg:back,targetSceneId:a.talkSceneId||null};state.displayText=state.waiting;return state;}
 if(operation==='attack'){const result=battleTurn(project,state,id);if(result.targetSceneId)return go(result.targetSceneId);if(result.outcome==='lose'){state.ended=true;state.error=state.rpg.message;}return state;}
 return state;
}
export function advancePreview(project, previous, optionId) {
  project = resolveStoryProject(project);
  const state = structuredClone(previous);
  state.images??=sceneImages(project.scenes[state.sceneId]);state.camera??=cameraPose();state.motions??={};
  state.animations??={};state.animationSequence??=0;state.runId??=++previewRun;
  const enter = id=>enterPreviewScene(project,state,id);
  if(state.waiting?.returnToRpg){const line=state.waiting;state.displayText=null;if(line.targetSceneId){enter(line.targetSceneId);}else{state.waiting=line.returnToRpg;return state;}}
  if(state.waiting?.type==='rpg')return state;
  if(state.waiting?.returnToExplore){
    const reaction=state.waiting;state.displayText=null;
    stopPreviewAudio(state,'voice');
    if(reaction.targetSceneId)enter(reaction.targetSceneId);else {state.waiting=reaction.returnToExplore;return state;}
  }
  if(state.waiting?.type==='explore'&&!explorationReady(state.waiting,state,project))return state;
  if (state.waiting?.type === "choice") {
    const option = state.waiting.options.find((o) => o.id === optionId && conditionPass(o.condition,state,project));
    if (!option) return state;
    for (const effect of option.effects ?? []) changeValue(effect,state,project);
    enter(targetScene(project, option));
  } else if (state.waiting) { if(state.waiting.timelineTextEnd)state.displayText=null; if(['dialogue','narration'].includes(state.waiting.type))stopPreviewAudio(state,'voice'); state.index++; state.waiting = null; }
  const order = orderedStoryScenes(project);
  for (let count = 0; count < 1000 && !state.ended; count++) {
    const scene = project.scenes[state.sceneId];
    const action = actionsFor(scene)[state.index];
    if(action?.type==='rpg'){state.rpg??=initialRpg(project);if(action.operation==='stat'){changeRpgStat(project,state,action.statId,action.statOperation,action.value);state.index++;continue;}if(action.operation==='actor')beginEncounter(project,state,action.actorId);state.waiting={...action,type:'rpg'};return state;}
    if(action?.type==='keyframes'){applyMotion(state,action);if(action.target.kind==='character')delete state.animations[action.target.id];state.motions[motionTargetKey(action.target)]={action,token:`motion-${++previewRun}`};if(!scene.timelineEnabled){state.waiting={id:action.id,type:'pause',duration:motionDuration(action)};return state;}state.index++;continue;}
    if(['showCharacter','hideCharacter','moveCharacter','characterAnimation'].includes(action?.type))for(const [key,m]of Object.entries(state.motions))if(m.action.target.kind==='character'&&m.action.target.id===action.characterId)delete state.motions[key];
    if(action?.type==='background')for(const [key,m]of Object.entries(state.motions))if(m.action.target.kind==='background')delete state.motions[key];
    if (!action) { const next = order[order.indexOf(state.sceneId)+1]; if (next) { enter(next); continue; } state.ended=true; break; }
    if(action.type==='timelineWait') { const duration=action.time-(state.timelineTime??0);state.timelineTime=action.time;if(duration>.001){state.waiting={id:'timeline-'+state.index,type:'pause',duration};return state;}state.index++;continue; }
    if(action.type==='timelineTextEnd'){if(action.wait){state.waiting={...state.displayText,timelineTextEnd:true};return state;}state.displayText=null;state.index++;continue;}
    if(action.type==='timelineStopAudio'){stopPreviewAudio(state,action.channel);state.index++;continue;}
    if(action.type==='timelineBackgroundEnd'){state.background=backgroundSource(project,scene);state.backgroundTransform=backgroundTransform(scene.backgroundTransform);state.backgroundActionId=null;state.index++;continue;}
    if(scene.timelineEnabled&&action.type==='pause'){state.index++;continue;}
    if(action.soundAssetId)playPreviewAudio(state,'sound',{assetId:action.soundAssetId,volume:action.soundVolume??1,token:`${state.runId}:${state.sceneId}-${state.index}`});
    if(action.type==='explore'){state.displayText=null;state.waiting=action;return state;}
    if (['dialogue','narration'].includes(action.type)) {
      if (action.type === 'dialogue' && action.spriteId) { const layer=state.layers.find(l=>l.characterId===action.speakerId); if(layer)layer.spriteId=action.spriteId; }
      if (action.voiceAssetId) playPreviewAudio(state,'voice',{assetId:action.voiceAssetId,token:`${state.runId}:${++previewRun}`,volume:audioVolume(action.voiceVolume)});
    }
    if(scene.timelineEnabled&&['dialogue','narration'].includes(action.type)){state.displayText=action;state.index++;continue;}
    if (["dialogue","narration","choice","pause"].includes(action.type)) {
      if(['dialogue','narration'].includes(action.type))state.displayText=action;
      if(action.type==='choice')state.displayText=null;
      state.waiting = action.type === "choice" ? {...action,options:action.options.filter((o) => conditionPass(o.condition,state,project))} : action;
      if (action.type === "choice" && !state.waiting.options.length) { state.error="Все варианты скрыты условиями"; state.ended=true; }
      return state;
    }
    if (action.type === "jump") { enter(action.targetSceneId); continue; }
    if (action.type === "condition") { enter(conditionPass(action.condition??action,state,project) ? action.trueSceneId : action.falseSceneId); continue; }
    if (action.type === "end") { state.ended=true; break; }
    if (["variable","flag"].includes(action.type)) changeValue(action,state,project);
    if (action.type === "background") { state.background=project.resources.find((r) => r.id===action.assetId)?.source;state.backgroundTransform=backgroundTransform(action.backgroundTransform);state.backgroundActionId=action.id; if(!scene.timelineEnabled&&action.preserveCharacters!==true){state.layers=[];state.animations={};state.cg=null;state.cgAssetId=null;} }
    if (AUDIO_CHANNELS.includes(action.type)) playPreviewAudio(state,action.type,{...action,volume:audioVolume(action.volume),loop:action.loop??['music','ambience'].includes(action.type),token:`${state.runId}:${++previewRun}`});
    if (action.type === "stopMusic") stopPreviewAudio(state,'music',action.fadeOut);
    if (action.type === 'stopAudio'&&AUDIO_CHANNELS.includes(action.channel)) stopPreviewAudio(state,action.channel,action.fadeOut);
    if (action.type === "showCG") {state.cg=project.resources.find((r) => r.id===action.assetId)?.source;state.cgAssetId=action.assetId;}
    if (action.type === "hideCG") {state.cg=null;state.cgAssetId=null;}
    if (action.type === "event") state.notification=action.text;
    if (action.type === "hideCharacter") state.layers=state.layers.filter((l)=>l.characterId!==action.characterId);
    if (['showCharacter','hideCharacter','changeSprite','moveCharacter'].includes(action.type))delete state.animations[action.characterId];
    if (action.type==='characterAnimation') {
      const layer=state.layers.find(l=>l.characterId===action.characterId&&l.visible!==false);
      if(layer){
        const {duration}=animationSettings(action);
        state.animations[action.characterId]={token:`${state.runId}:${++state.animationSequence}`,base:structuredClone(layer),action};
        Object.assign(layer,animationEnd(layer,action));
        if(!scene.timelineEnabled){state.waiting={id:action.id,type:'pause',duration};return state;}
      }
    }
    if (["showCharacter","changeSprite","moveCharacter"].includes(action.type)) {
      let layer=state.layers.find((l)=>l.characterId===action.characterId);
      if(action.type==='showCharacter') {
        const shown=shownCharacterLayer(scene,action,scene.actions.findIndex(a=>a.id===action.id),layer);
        if(layer)Object.assign(layer,shown);else state.layers.push(shown);
        state.index++;continue;
      }
      if (!layer) { layer={characterId:action.characterId,x:50,y:100,scale:100,opacity:100,rotation:0,visible:true}; state.layers.push(layer); }
      if (["showCharacter", "changeSprite"].includes(action.type)) layer.spriteId=action.spriteId ?? null;
      if (action.position) layer.x=({left:25,center:50,right:75})[action.position];
      for (const key of ['x','y','scale','rotation','opacity','flip']) if (action[key] != null) layer[key]=action[key];
    }
    state.index++;
  }
  if (!state.ended) { state.ended=true; state.error="Обнаружен бесконечный цикл без реплик или выбора"; }
  return state;
}
