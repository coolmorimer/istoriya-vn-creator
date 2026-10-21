import {advancePreview,initialPreview} from './preview.js';
import {backgroundSource} from '../../runtime/background-transform.mjs';
import {ASSET_FIELDS} from '../../runtime/asset-fields.mjs';
import {sceneImages} from '../../runtime/image-layers.mjs';
import {MOTION_FIELDS,cameraPose} from '../../runtime/keyframes.mjs';
import {initialRpg,validRpgState} from '../../runtime/rpg-model.mjs';
const LIMIT=60;
const media=(key,value)=>ASSET_FIELDS.has(key)?undefined:value;
export function previewRevision(project){
 // Rust's serde maps sort keys, while freshly authored JS objects retain
 // insertion order. Equivalent narratives must survive this round trip.
 const canonical=(key,value)=>ASSET_FIELDS.has(key)?undefined:value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(k=>[k,value[k]])):value;
 const data=JSON.stringify({scenes:project.scenes,chapters:project.chapters,characters:project.characters,variables:project.variables,flags:project.flags,items:project.items,...(project.rpg?.enabled?{rpg:project.rpg}:{}),resources:project.resources.map(({source,...r})=>r),resolution:project.meta.resolution,...(project.meta.mediaRevision?{mediaRevision:project.meta.mediaRevision}:{})},canonical);
 let a=2166136261,b=5381;for(let i=0;i<data.length;i++){a=Math.imul(a^data.charCodeAt(i),16777619);b=Math.imul(b,33)^data.charCodeAt(i);}return `${data.length}-${a>>>0}-${b>>>0}`;
}
export function packPreview(state){
 const {background,cg,animations,audioStops,motions,...data}=state;
 if(data.images)data.images=data.images.map(l=>({id:l.id,...Object.fromEntries(MOTION_FIELDS.filter(k=>l[k]!=null).map(k=>[k,l[k]]))}));
 return JSON.parse(JSON.stringify(data,media));
}
let restoreToken=0;
export function unpackPreview(project,data){
 if(!data||!project.scenes[data.sceneId]||!Number.isInteger(data.index)||data.index<0||!Array.isArray(data.layers)||!Array.isArray(data.hiddenProps)||!Array.isArray(data.usedInteractions)||!data.inventory||!data.variables||!data.flags||!data.audio)throw Error('Тестовое сохранение повреждено. Выберите другой слот.');
 const object=v=>v&&typeof v==='object'&&!Array.isArray(v),numbers=['x','y','scale','rotation','opacity'];
 if(![data.inventory,data.variables,data.flags,data.audio,data.propImages??{}].every(object)||data.layers.some(l=>!object(l)||!project.characters.some(c=>c.id===l.characterId)||numbers.some(k=>l[k]!=null&&!Number.isFinite(l[k])))||data.hiddenProps.some(v=>typeof v!=='string')||data.usedInteractions.some(v=>typeof v!=='string')||Object.values(data.inventory).some(v=>!Number.isSafeInteger(v)||v<0)||Object.values(data.flags).some(v=>typeof v!=='boolean')||Object.values(data.variables).some(v=>!['string','number','boolean'].includes(typeof v)||(typeof v==='number'&&!Number.isFinite(v))))throw Error('Состояние тестового сохранения повреждено.');
 const s=structuredClone(data),scene=project.scenes[s.sceneId];
 if(project.rpg?.enabled&&!s.rpg||s.rpg&&!validRpgState(project,s.rpg))throw Error('Игровые показатели в сохранении повреждены.');s.rpg??=initialRpg(project);
 const validPose=p=>object(p)&&MOTION_FIELDS.every(k=>p[k]==null||Number.isFinite(p[k]))&&(p.scale==null||p.scale>=1&&p.scale<=2000)&&(p.opacity==null||p.opacity>=0&&p.opacity<=100)&&(p.blur==null||p.blur>=0&&p.blur<=100);
 if(s.camera&&!validPose(s.camera)||s.images&&(!Array.isArray(s.images)||s.images.some(l=>!validPose(l)||!scene.images?.some(source=>source.id===l.id))))throw Error('Положение камеры или предмета в тестовом сохранении повреждено.');
 s.camera??=cameraPose();const savedImages=new Map((s.images??[]).map(l=>[l.id,l]));s.images=sceneImages(scene).map(l=>({...l,...savedImages.get(l.id)}));
 if(s.waiting&&!['dialogue','narration','choice','explore','pause','rpg'].includes(s.waiting.type))throw Error('Неизвестный шаг в тестовом сохранении.');
 if(s.waiting?.type==='choice'&&(!Array.isArray(s.waiting.options)||s.waiting.options.some(o=>!object(o)||typeof o.id!=='string'||typeof o.text!=='string')))throw Error('Повреждены варианты тестового сохранения.');
 s.background=s.backgroundActionId?project.resources.find(r=>r.id===scene.actions.find(a=>a.id===s.backgroundActionId)?.assetId)?.source:backgroundSource(project,scene);
 s.cg=s.cgAssetId?project.resources.find(r=>r.id===s.cgAssetId)?.source:null;s.animations={};s.motions={};delete s.audioStops;
 for(const [channel,track]of Object.entries(s.audio)){if(!['music','voice','sound','ambience'].includes(channel)||!track||!project.resources.some(r=>r.id===track.assetId))throw Error('Запись в тестовом сохранении не найдена.');track.token=`restore-${++restoreToken}`;}
 return s;
}
const lineKey=state=>['dialogue','narration'].includes(state.waiting?.type)?JSON.stringify([state.sceneId,state.waiting.id,state.waiting.text]):null;
function lineEntry(project,state){const key=lineKey(state);return key?{key,speaker:project.characters.find(c=>c.id===state.waiting.speakerId)?.name??'',text:String(state.waiting.text??'')}:null;}
export function createPreviewSession(project,sceneId,actionId){const state=advancePreview(project,initialPreview(project,sceneId,actionId)),entry=lineEntry(project,state);return {state,past:[],history:entry?[entry]:[],seen:[]};}
export function changePreviewSession(project,session,change){
 const next=typeof change==='function'?change(session.state):change,previous=packPreview(session.state),packed=packPreview(next);
 if(JSON.stringify(previous)===JSON.stringify(packed))return session;
 const previousKey=lineKey(session.state),entry=lineEntry(project,next),added=entry&&entry.key!==previousKey,removed=added&&session.history.length>=500?1:0,history=added?[...session.history,entry].slice(-500):session.history;
 const seen=previousKey&&!session.seen.includes(previousKey)?[...session.seen,previousKey].slice(-2000):session.seen;
 const checkpoints=session.state.waiting?.type==='pause'?session.past:[...session.past,{state:previous,history:session.history.length}].slice(-LIMIT),past=removed?checkpoints.map(c=>({...c,history:Math.max(0,c.history-removed)})):checkpoints;
 return {...session,state:next,past,history,seen};
}
export function rollbackPreview(project,session){const checkpoint=session.past.at(-1);return checkpoint?{...session,state:unpackPreview(project,checkpoint.state),past:session.past.slice(0,-1),history:session.history.slice(0,checkpoint.history)}:session;}
export const previewLineSeen=session=>session.seen.includes(lineKey(session.state));
export function previewSlot(project,session,revision=previewRevision(project)){
 if(session.state.waiting?.type==='pause')throw Error('Дождитесь завершения анимации или паузы перед сохранением теста.');
 const result={version:1,projectId:project.id,revision,state:packPreview(session.state),past:session.past,history:session.history,seen:session.seen,sceneTitle:project.scenes[session.state.sceneId]?.title??'',excerpt:session.state.waiting?.text??session.state.waiting?.prompt??(session.state.ended?'Игра завершена':'Осмотр сцены')};
 if(JSON.stringify(result).length>2*1024*1024)throw Error('Тестовое сохранение больше 2 МБ. Используйте сохранение в отдельном окне игры.');return result;
}
export function loadPreviewSlot(project,slot,revision=previewRevision(project)){
 if(slot?.version!==1||slot.projectId!==project.id)throw Error('Слот принадлежит другому проекту или версии редактора.');
 if(slot.revision!==revision)throw Error('Сценарий изменён после сохранения. Начните тест заново или перезапишите слот.');
 if(!Array.isArray(slot.past)||slot.past.length>LIMIT||!Array.isArray(slot.history)||slot.history.length>500||!Array.isArray(slot.seen)||slot.seen.length>2000||slot.history.some(e=>!e||typeof e.text!=='string'||typeof e.speaker!=='string')||slot.seen.some(e=>typeof e!=='string'))throw Error('История тестового сохранения повреждена.');
 for(const checkpoint of slot.past){if(!Number.isInteger(checkpoint.history)||checkpoint.history<0)throw Error('История возврата повреждена.');unpackPreview(project,checkpoint.state);}
 return {state:unpackPreview(project,slot.state),past:structuredClone(slot.past),history:structuredClone(slot.history),seen:[...slot.seen]};
}
export const DEFAULT_PREVIEW_PREFERENCES={music:1,sound:1,voice:1,ambience:1,textSpeed:null,autoDelay:2,skipSeenOnly:true};
export function previewPreferences(value){const p={...DEFAULT_PREVIEW_PREFERENCES};for(const key of ['music','sound','voice','ambience'])if(Number.isFinite(value?.[key]))p[key]=Math.max(0,Math.min(1,value[key]));if(Number.isFinite(value?.textSpeed))p.textSpeed=Math.max(0,Math.min(150,value.textSpeed));if(Number.isFinite(value?.autoDelay))p.autoDelay=Math.max(.2,Math.min(10,value.autoDelay));if(typeof value?.skipSeenOnly==='boolean')p.skipSeenOnly=value.skipSeenOnly;return p;}
