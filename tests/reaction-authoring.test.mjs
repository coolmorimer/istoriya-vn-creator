import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject} from '../src/domain/projectFactory.js';
import {authorPropReaction,captureReactionTarget,reactionMode,reactionModePatch,reactionConsumptionPatch,reactionRequiredItemPatch,reactionItemStatus} from '../src/domain/reactionAuthoring.js';
import {useProjectStore as store} from '../src/store/projectStore.js';
import {advancePreview,initialPreview,interactPreview} from '../src/domain/preview.js';
import {inventoryTargets} from '../runtime/interactions.mjs';
import {createPreviewSession,previewSlot,previewRevision,loadPreviewSlot,changePreviewSession,rollbackPreview} from '../src/domain/previewSession.js';
import {compilerInternals} from '../runtime/compiler.mjs';
import {isAudioResource,authorAudioAttachment} from '../src/domain/audioAuthoring.js';
import {validateProject} from '../src/domain/validator.js';

const ids={reactionId:'react',itemId:'item',soundResourceId:'sound',voiceResourceId:'voice',actionId:'explore'};
function fixture(){const p=createProject(),s=Object.values(p.scenes)[0];p.resources=[{id:'image',name:'Ключ',mime:'image/png',category:'prop',source:'key.png'}];s.images=[{id:'key',name:'Ключ',resourceId:'image',interactions:[]}];return {p,s,input:{...captureReactionTarget(p,s.id,'key'),mode:'take',label:'Взять ключ',newItem:{name:'Латунный ключ',description:'От двери'},addExploration:true,text:'Ключ у меня.'}};}
const voice={name:'Ответ',fileName:'ответ.wav',mime:'audio/wav',source:'data:audio/wav;base64,dm9pY2U='};

test('interaction creates item, recordings, reply and exploration together, keeping explicit zero volume',()=>{
 const {p,s,input}=fixture();p.characters=[{id:'hero',name:'Герой',sprites:[]}];
 const result=authorPropReaction(p,{...input,speakerId:'hero',voiceResource:voice,soundResource:voice,soundVolume:0,voiceVolume:.35},ids);
 assert.deepEqual(result,{reactionId:'react',itemId:'item',actionId:'explore'});assert.equal(p.resources.length,2);assert.equal(p.items[0].description,'От двери');assert.equal(p.items[0].iconResourceId,'image');assert.equal(s.images[0].itemId,'item');
 const reaction=s.images[0].interactions[0];assert.equal(reaction.once,true);assert.equal(reaction.hideAfter,true);assert.equal(reaction.soundAssetId,reaction.voiceAssetId);assert.equal(reaction.soundVolume,0);assert.equal(reaction.voiceVolume,.35);
 let state=advancePreview(p,initialPreview(p,s.id));state=interactPreview(p,state,'key','react');assert.equal(state.inventory.item,1);assert.equal(state.waiting.text,'Ключ у меня.');assert.equal(state.audio.sound.volume,0);assert.equal(state.audio.voice.volume,.35);
});

test('reusable and consuming recipes route the same existing reaction through inventory in preview and export',()=>{
 const {p,s,input}=fixture();authorPropReaction(p,input,ids);
 for(const [id,consume]of [['reuse',false],['consume',true]]){
  s.images.push({id,name:id,resourceId:'image'});
  authorPropReaction(p,{...captureReactionTarget(p,s.id,id),label:id,mode:'use',itemId:'item',consume,text:`${id} reply`,voiceResource:voice},{...ids,reactionId:id});
 }
 let state=advancePreview(p,interactPreview(p,advancePreview(p,initialPreview(p,s.id)),'key','react'));
 assert.equal(inventoryTargets(p,state,'item').length,2);state=interactPreview(p,state,'reuse','reuse');assert.equal(state.inventory.item,1);assert.equal(state.waiting.text,'reuse reply');state=advancePreview(p,state);assert.equal(inventoryTargets(p,state,'item').length,2);
 const revision=previewRevision(p),session={...createPreviewSession(p,s.id),state},slot=previewSlot(p,session,revision);
 let changed=changePreviewSession(p,session,prev=>interactPreview(p,prev,'consume','consume'));assert.equal(changed.state.inventory.item,0);assert.equal(changed.state.waiting.text,'consume reply');assert.equal(inventoryTargets(p,advancePreview(p,changed.state),'item').length,0);
 assert.equal(rollbackPreview(p,changed).state.inventory.item,1);assert.equal(loadPreviewSlot(p,slot,revision).state.inventory.item,1);
 const script=compilerInternals.createScript(p,new Map(),new Map(p.resources.map(r=>[r.id,r.source])));assert.match(script,/voice "data:audio\/wav;base64,dm9pY2U="/);assert.match(script,/istoriya_inventory\[inv\["itemId"\]\] = max/);assert.match(script,/_istoriya_inventory_targets/);
});

test('atomic store Undo/Redo restores all reaction additions and visual selection',()=>{
 const {p,s,input}=fixture();store.setState({project:p,activeSceneId:s.id,activeActionId:null,activeLayerId:'key',past:[],future:[]});store.getState().createPropReaction({...input,voiceResource:voice});
 let current=store.getState();assert.equal(current.past.length,1);assert.equal(current.project.items.length,1);assert.equal(current.project.resources.length,2);assert.equal(current.activeActionId,current.project.scenes[s.id].actions[0].id);
 current.undo();current=store.getState();assert.equal(current.project.items.length,0);assert.equal(current.project.resources.length,1);assert.equal(current.project.scenes[s.id].actions.length,0);assert.deepEqual(current.project.scenes[s.id].images[0].interactions,[]);assert.equal(current.activeLayerId,'key');assert.equal(current.activeActionId,null);
 current.redo();current=store.getState();assert.equal(current.project.items.length,1);assert.equal(current.project.scenes[s.id].images[0].interactions.length,1);
});

test('stale targets and malformed media/rules never partially mutate the authoring document',()=>{
 for(const patch of [{projectId:'different'},{sceneId:'gone'},{layerId:'gone'},{resourceId:'changed'},{timed:true},{afterId:'gone'},{mode:'bad'},{label:' '},{newItem:{name:' '}},{newItem:null,itemId:'gone'},{quantity:0},{quantity:1.5},{speakerId:'gone'},{targetSceneId:'gone'},{targetChapterId:'gone'},{resultResourceId:'gone'},{condition:{flagId:'gone',value:true}},{effects:[{kind:'inventory',itemId:'gone',operation:'add',quantity:1}]},{voiceResource:{mime:'image/png',source:'bad'},soundResource:voice}]){
  const {p,input}=fixture(),before=structuredClone(p);assert.throws(()=>authorPropReaction(p,{...input,...patch},ids));assert.deepEqual(p,before,JSON.stringify(patch));
 }
});

test('existing items are reused, exploration is inserted before a terminal and never converts timed scenes',()=>{
 const {p,s,input}=fixture();p.items=[{id:'existing',name:'Ключ'}];s.actions=[{id:'end',type:'end'}];authorPropReaction(p,{...input,newItem:null,itemId:'existing',afterId:'end'},ids);assert.equal(p.items.length,1);assert.deepEqual(s.actions.map(a=>a.type),['explore','end']);
 authorPropReaction(p,{...captureReactionTarget(p,s.id,'key'),label:'Осмотреть',mode:'inspect',addExploration:true},{...ids,reactionId:'inspect'});assert.equal(s.actions.length,2);
 const timed=fixture();timed.s.timelineEnabled=true;const before=structuredClone(timed.p);assert.throws(()=>authorPropReaction(timed.p,{...timed.input,timed:true},ids),/Монтаж/);assert.deepEqual(timed.p,before);
 authorPropReaction(timed.p,{...timed.input,timed:true,addExploration:false},ids);assert.equal(timed.s.timelineEnabled,true);assert.equal(timed.s.actions.length,0);
});

test('mode changes do not silently choose the first inventory definition or overwrite authored reply/effects',()=>{
 const reaction={label:'Моя реакция',text:'Ответ',effects:[{kind:'flag',flagId:'open',value:true}]},patch=reactionModePatch(reaction,'use');
 assert.equal(patch.requiredItemId,'');assert.equal(reactionMode({...reaction,...patch}),'use');assert.equal(patch.inventory,null);assert.equal(patch.text,undefined);assert.equal(patch.effects,undefined);
 assert.equal(reactionModePatch({requiredItemId:'key'},'use',{consume:true}).inventory.itemId,'key');assert.equal(reactionMode({inventory:{operation:'remove',itemId:'key'}}),'use');assert.equal(reactionMode({hideAfter:true}),'hide');
});

test('audio selection accepts legacy ambience but rejects a mismatched MIME even if category says voice',()=>{
 assert.equal(isAudioResource({source:'a.ogg',category:'ambience'}),true);assert.equal(isAudioResource({source:'a.png',mime:'image/png',category:'voice'}),false);assert.equal(isAudioResource({source:'',mime:'audio/wav'}),false);
 const {p,s}=fixture();p.resources.push({id:'wrong',source:'image.png',mime:'image/png',category:'sound'});s.actions=[{id:'line',type:'narration',text:'Текст'}];const before=structuredClone(p);
 assert.throws(()=>authorAudioAttachment(p,{projectId:p.id,kind:'action',sceneId:s.id,actionId:'line',field:'voiceAssetId',resourceId:'wrong'},'new'),/недоступен/);assert.deepEqual(p,before);
});

test('an unfinished apply-item recipe fails closed, not an unguarded free interaction',()=>{
 const {p,s,input}=fixture();authorPropReaction(p,input,ids);s.images.push({id:'door',name:'Дверь',resourceId:'image',interactions:[{id:'unlinked',label:'Открыть',...reactionModePatch({},'use')}]});
 const state=advancePreview(p,interactPreview(p,advancePreview(p,initialPreview(p,s.id)),'key','react'));
 assert.deepEqual(interactPreview(p,state,'door','unlinked'),state);assert.equal(validateProject(p).issues.some(i=>i.code==='empty-reaction-item'),true);
});

test('inline item creation preserves an explicit missing icon and never grants an application requirement',()=>{
 const {p,s,input}=fixture();authorPropReaction(p,{...input,mode:'use',newItem:{name:'Пропуск',iconResourceId:null}},ids);
 assert.equal(p.items[0].iconResourceId,null);assert.equal(s.images[0].interactions[0].requiredItemId,'item');assert.equal(s.images[0].interactions[0].inventory,null);
 const state=advancePreview(p,initialPreview(p,s.id));assert.equal(state.inventory.item,undefined);assert.deepEqual(inventoryTargets(p,state,'item'),[]);
});

test('turning consumption off preserves secondary item and quantity gates, effects and reply',()=>{
 const {p,s}=fixture();p.items=[{id:'key',name:'Ключ'},{id:'pass',name:'Пропуск'}];p.flags=[{id:'access',name:'Доступ',initial:true}];s.actions=[{id:'explore',type:'explore'}];
 const original={id:'unlock',label:'Открыть',text:'Открыто',inventory:{operation:'remove',itemId:'key',quantity:2},requiredItemId:'pass',condition:{flagId:'access',value:true},effects:[]},changed={...original,...reactionConsumptionPatch(original,false)};s.images[0].interactions=[changed];
 let state=advancePreview(p,initialPreview(p,s.id));state.inventory={key:1,pass:1};assert.deepEqual(interactPreview(p,state,'key','unlock'),state);state.inventory={key:2,pass:0};assert.deepEqual(interactPreview(p,state,'key','unlock'),state);state.inventory.pass=1;
 const next=interactPreview(p,state,'key','unlock');assert.equal(next.waiting.text,'Открыто');assert.equal(next.inventory.key,2);assert.equal(next.inventory.pass,1);assert.deepEqual(original.condition,{flagId:'access',value:true});assert.equal(changed.effects,original.effects);
 assert.equal(reactionConsumptionPatch({inventory:{operation:'remove',itemId:null,quantity:1}},false).requiredItemId,'');
});

test('clearing a reusable requirement keeps use incomplete, never a free click; optional secondary requirements clear explicitly',()=>{
 const {p,s}=fixture();p.items=[{id:'key',name:'Ключ'}];s.actions=[{id:'explore',type:'explore'}];
 const reaction={id:'unlock',label:'Открыть',requiredItemId:'key',text:'Открыто'};
 Object.assign(reaction,reactionRequiredItemPatch(reaction,''));s.images[0].interactions=[reaction];
 assert.equal(reactionMode(reaction),'use');assert.equal(reaction.requiredItemId,'');assert.match(reactionItemStatus(reaction,p.items).problem,/Выберите предмет/);
 const state=advancePreview(p,initialPreview(p,s.id));state.inventory.key=1;
 assert.deepEqual(interactPreview(p,state,'key','unlock'),state);assert.ok(validateProject(p).issues.some(i=>i.code==='empty-reaction-item'));
 assert.deepEqual(reactionRequiredItemPatch({inventory:{operation:'remove',itemId:'key'},requiredItemId:'pass'},''),{requiredItemId:null});
 assert.deepEqual(reactionRequiredItemPatch({text:'Осмотреть'},''),{requiredItemId:null});
 assert.equal(reactionItemStatus({...reaction,requiredItemId:'key'},p.items).problem,null);
 assert.match(reactionItemStatus({...reaction,requiredItemId:'gone'},p.items).problem,/удалён/);
 assert.match(reactionItemStatus({inventory:{operation:'remove',itemId:'key'},requiredItemId:'gone'},p.items).problem,/Дополнительно/);
 assert.match(reactionItemStatus({inventory:{operation:'remove',itemId:null}},p.items).problem,/Выберите/);
 assert.match(reactionItemStatus({inventory:{operation:'remove',itemId:null},requiredItemId:'key'},p.items).problem,/Выберите/);
});
