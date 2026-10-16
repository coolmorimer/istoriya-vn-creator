import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject} from '../src/domain/projectFactory.js';
import {authorProp} from '../src/domain/propAuthoring.js';
import {useProjectStore as store} from '../src/store/projectStore.js';
import {advancePreview,initialPreview,interactPreview} from '../src/domain/preview.js';
const ids={resourceId:'picture',layerId:'key',reactionId:'take',itemId:'item',actionId:'explore'};
function fixture(){const p=createProject(),s=Object.values(p.scenes)[0];return {p,s,input:{projectId:p.id,sceneId:s.id,afterId:null,timed:false,name:'Ключ',mode:'take',text:'Ключ у меня.',addExploration:true,resource:{name:'key',mime:'image/png',source:'data:image/png;base64,YWJj',width:200,height:100}}};}
test('new prop creates actual inventory/reaction/exploration and preserves image ratio',()=>{
 const {p,s,input}=fixture();authorProp(p,input,ids);assert.equal(p.resources.length,1);assert.equal(p.items[0].name,'Ключ');assert.equal(s.actions[0].type,'explore');assert.equal(s.images[0].name,'Ключ');
 const layer=s.images[0];assert.equal(layer.width*p.meta.resolution.width/(layer.height*p.meta.resolution.height),2);
 let state=advancePreview(p,initialPreview(p,s.id));state=interactPreview(p,state,'key','take');assert.equal(state.inventory.item,1);assert.equal(state.waiting.text,'Ключ у меня.');assert.equal(p.items.length,1);
});
test('resource reuse, existing exploration and decorative layers do not add duplicate assets or steps',()=>{
 const {p,s,input}=fixture();authorProp(p,input,ids);authorProp(p,{...input,name:'Второй ключ'}, {...ids,layerId:'key2',itemId:'item2'});assert.equal(p.resources.length,1);assert.equal(s.actions.length,1);assert.equal(p.items.length,2);
 authorProp(p,{...input,resourceId:'picture',mode:'decoration'}, {...ids,layerId:'decoration'});assert.equal(s.images.at(-1).interactions.length,0);assert.equal(p.items.length,2);assert.equal(s.actions.length,1);
});
test('stale project, scene, frame, invalid mode/media/name and timed insertion fail without mutations',()=>{
 for(const patch of [{projectId:'old'},{sceneId:'deleted'},{afterId:'deleted'},{mode:'bad'},{name:' '},{resourceId:'deleted'},{resource:{source:'bad',mime:'audio/wav'}},{timed:true}]){
  const {p,input}=fixture(),before=structuredClone(p);assert.throws(()=>authorProp(p,{...input,...patch},ids));assert.deepEqual(p,before);
 }
 const {p,s,input}=fixture();s.timelineEnabled=true;const before=structuredClone(p);assert.throws(()=>authorProp(p,{...input,timed:true},ids),/Монтаж не изменён/);assert.deepEqual(p,before);authorProp(p,{...input,timed:true,mode:'decoration'},ids);assert.equal(s.timelineEnabled,true);assert.equal(s.actions.length,0);
});
test('atomic store Undo removes resource, layer, inventory and exploration and restores selection',()=>{
 const {p,s,input}=fixture();store.setState({project:p,activeSceneId:s.id,activeActionId:null,activeLayerId:null,selectedResourceId:null,past:[],future:[]});
 store.getState().createSceneProp(input);let current=store.getState();assert.equal(current.past.length,1);assert.equal(current.project.items.length,1);assert.equal(current.activeLayerId,current.project.scenes[s.id].images[0].id);
 current.undo();current=store.getState();assert.equal(current.project.resources.length,0);assert.equal(current.project.items.length,0);assert.equal(current.project.scenes[s.id].images?.length??0,0);assert.equal(current.project.scenes[s.id].actions.length,0);assert.equal(current.activeLayerId,null);
 current.redo();current=store.getState();assert.equal(current.project.items.length,1);assert.equal(current.activeLayerId,current.project.scenes[s.id].images[0].id);assert.equal(current.activeActionId,current.project.scenes[s.id].actions[0].id);
});
test('exploration inserted before a selected terminal, without changing existing transitions',()=>{
 const {p,s,input}=fixture();s.actions=[{id:'line',type:'narration',text:'Начало'},{id:'end',type:'end'}];authorProp(p,{...input,afterId:'end'},ids);assert.deepEqual(s.actions.map(a=>a.id),['line','explore','end']);
});

test('prop creation stages sound, voice and speaker in the same Undo transaction',()=>{
 const {p,s,input}=fixture();p.characters=[{id:'hero',name:'Герой',sprites:[]}];
 const soundResource={name:'Щелчок',mime:'audio/wav',source:'data:audio/wav;base64,Y2xpY2s='};
 const voiceResource={name:'Ответ',mime:'audio/wav',source:'data:audio/wav;base64,dm9pY2U='};
 store.setState({project:p,activeSceneId:s.id,activeActionId:null,activeLayerId:null,past:[],future:[]});
 store.getState().createSceneProp({...input,speakerId:'hero',soundResource,voiceResource,soundVolume:0,voiceVolume:.35});
 let current=store.getState();const reaction=current.project.scenes[s.id].images[0].interactions[0];
 assert.equal(current.past.length,1);assert.equal(current.project.resources.length,3);
 assert.equal(reaction.speakerId,'hero');assert.equal(reaction.soundVolume,0);assert.equal(reaction.voiceVolume,.35);
 assert.equal(current.project.resources.find(r=>r.id===reaction.voiceAssetId).source,voiceResource.source);
 const state=interactPreview(current.project,advancePreview(current.project,initialPreview(current.project,s.id)),current.activeLayerId,reaction.id);
 assert.equal(state.waiting.type,'dialogue');assert.equal(state.audio.voice.assetId,reaction.voiceAssetId);assert.equal(state.audio.sound.volume,0);
 current.undo();current=store.getState();assert.equal(current.project.resources.length,0);assert.equal(current.project.items.length,0);assert.equal(current.project.scenes[s.id].actions.length,0);
 current.redo();assert.equal(store.getState().project.resources.length,3);
});

test('pending recordings reuse assets, reject stale attachments without mutation and are omitted for decoration',()=>{
 const idsWithAudio={...ids,soundResourceId:'sound',voiceResourceId:'voice'};
 const audio={name:'Запись',mime:'audio/wav',source:'data:audio/wav;base64,YQ=='};
 const {p,s,input}=fixture();authorProp(p,{...input,soundResource:audio,voiceResource:audio},idsWithAudio);
 assert.equal(p.resources.length,2);assert.equal(s.images[0].interactions[0].soundAssetId,s.images[0].interactions[0].voiceAssetId);
 for(const patch of [{speakerId:'deleted'},{voiceResourceId:'deleted'},{soundResource:audio,voiceResource:{mime:'image/png',source:'bad'}}]){
  const value=fixture(),before=structuredClone(value.p);assert.throws(()=>authorProp(value.p,{...value.input,...patch},idsWithAudio));assert.deepEqual(value.p,before);
 }
 const value=fixture();authorProp(value.p,{...value.input,mode:'decoration',speakerId:'deleted',soundResource:audio,voiceResource:audio},idsWithAudio);
 assert.equal(value.p.resources.length,1);assert.equal(value.s.images[0].interactions.length,0);
});

test('existing legacy recordings without MIME remain selectable, but incorrect media and undecoded uploads fail',()=>{
 const {p,s,input}=fixture();p.resources=[{id:'legacy',name:'Старая запись',category:'voice',source:'data:audio/wav;base64,YQ=='}];
 authorProp(p,{...input,voiceResourceId:'legacy'},ids);assert.equal(s.images[0].interactions[0].voiceAssetId,'legacy');assert.equal(p.resources.length,2);
 for(const audio of [{category:'voice',source:'data:audio/wav;base64,YQ=='},{category:'sound',mime:'image/png',source:'data:image/png;base64,YQ=='}]){
  const value=fixture(),before=structuredClone(value.p);assert.throws(()=>authorProp(value.p,{...value.input,voiceResource:audio},{...ids,voiceResourceId:'voice'}));assert.deepEqual(value.p,before);
 }
});

test('legacy ambience selected from the common audio field can attach to a new prop',()=>{
 const {p,s,input}=fixture();p.resources=[{id:'ambience',name:'Лес',category:'ambience',source:'forest.ogg'}];
 authorProp(p,{...input,soundResourceId:'ambience'},ids);assert.equal(s.images[0].interactions[0].soundAssetId,'ambience');
});
