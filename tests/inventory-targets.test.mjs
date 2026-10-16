import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject} from '../src/domain/projectFactory.js';
import {inventoryTargets,propKey,reactionKey} from '../runtime/interactions.mjs';
import {advancePreview,initialPreview,interactPreview} from '../src/domain/preview.js';
import {createPreviewSession,changePreviewSession,rollbackPreview,previewSlot,loadPreviewSlot,previewRevision} from '../src/domain/previewSession.js';
import {compilerInternals} from '../runtime/compiler.mjs';
function fixture(){
 const p=createProject(),s=Object.values(p.scenes)[0];p.items=[{id:'key',name:'Ключ'},{id:'note',name:'Записка'}];p.flags=[{id:'access',name:'Доступ',initial:true}];
 s.images=[{id:'door',name:'Дверь',interactions:[{id:'open',label:'Открыть ключом',inventory:{operation:'remove',itemId:'key',quantity:2},text:'Открыто.',once:true}]},{id:'statue',name:'Статуя',interactions:[{id:'touch',label:'Показать ключ',requiredItemId:'key',condition:{flagId:'access',value:true},text:'Печать узнала ключ.',once:true}]}];
 s.actions=[{id:'explore',type:'explore'},{id:'end',type:'end'}];
 const state=advancePreview(p,initialPreview(p,s.id));state.inventory={key:2,note:1};return {p,s,state};
}
test('inventory routes existing reactions by consumed or required item without changing authored data',()=>{
 const {p,state}=fixture(),original=structuredClone(p);
 assert.deepEqual(inventoryTargets(p,state,'key').map(t=>[t.layerId,t.reactionId,t.label]),[['door','open','Открыть ключом'],['statue','touch','Показать ключ']]);
 assert.deepEqual(inventoryTargets(p,state,'note'),[]);assert.deepEqual(inventoryTargets(p,state,'missing'),[]);assert.deepEqual(p,original);
});
test('inventory respects quantities, conditions, once, hidden layers, opacity and exploration lifecycle',()=>{
 const {p,s,state}=fixture();state.inventory.key=1;assert.deepEqual(inventoryTargets(p,state,'key').map(t=>t.layerId),['statue']);
 state.flags.access=false;assert.deepEqual(inventoryTargets(p,state,'key'),[]);state.flags.access=true;
 for(const patch of [{hiddenProps:[propKey(s.id,'statue')]},{usedInteractions:[reactionKey(s.id,'statue','touch')]},{cg:'covered'},{ended:true},{waiting:{type:'narration'}}])assert.deepEqual(inventoryTargets(p,{...state,...patch},'key'),[]);
 for(const patch of [{visible:false},{opacity:0}]){Object.assign(s.images[1],patch);assert.deepEqual(inventoryTargets(p,state,'key'),[]);Object.assign(s.images[1],{visible:true,opacity:100});}
 s.images[1].interactions[0].condition={flagId:'deleted',value:true};assert.deepEqual(inventoryTargets(p,state,'key'),[],'broken references fail closed');
});
test('reuse leaves inventory intact; consumption prevents repetition and cannot bypass an active reply',()=>{
 const {p,state}=fixture();let next=interactPreview(p,state,'statue','touch');assert.equal(next.inventory.key,2);assert.equal(next.waiting.text,'Печать узнала ключ.');
 assert.deepEqual(inventoryTargets(p,next,'key'),[]);assert.deepEqual(interactPreview(p,next,'door','open'),next);
 next=advancePreview(p,next);assert.deepEqual(inventoryTargets(p,next,'key').map(t=>t.layerId),['door']);next=interactPreview(p,next,'door','open');assert.equal(next.inventory.key,0);
 assert.deepEqual(inventoryTargets(p,advancePreview(p,next),'key'),[]);
});
test('inventory routing recalculates after test save/load/rollback instead of persisting transient target menus',()=>{
 const {p,s,state}=fixture();let session={...createPreviewSession(p,s.id),state},original=previewSlot(p,session,previewRevision(p));
 session=changePreviewSession(p,session,prev=>interactPreview(p,prev,'door','open'));assert.equal(session.state.inventory.key,0);
 session=rollbackPreview(p,session);assert.equal(session.state.inventory.key,2);assert.equal(inventoryTargets(p,session.state,'key').length,2);
 const restored=loadPreviewSlot(p,original,previewRevision(p));assert.equal(inventoryTargets(p,restored.state,'key').length,2);assert.ok(!JSON.stringify(original).includes('selectedItem'));
});
test('export routes inventory target through existing guarded labels and retains direct canvas clicks',()=>{
 const {p}=fixture(),script=compilerInternals.createScript(p,new Map(),new Map());
 assert.match(script,/def _istoriya_inventory_targets/);assert.match(script,/default selected_item = None/);
 assert.match(script,/Hide\("istoriya_inventory_screen"\), Return\(\(layer_id, r\["id"\]\)\)/);
 assert.match(script,/isinstance\(_istoriya_clicked, tuple\)/);assert.match(script,/elif _istoriya_options:/);
 assert.match(script,/if _istoriya_selected and _istoriya_allowed/);assert.match(script,/action Return\(layer_id\)/);
});
