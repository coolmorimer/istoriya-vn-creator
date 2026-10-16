import test from 'node:test';import assert from 'node:assert/strict';import {indexedDB} from 'fake-indexeddb';
import {createProject} from '../src/domain/projectFactory.js';
import {advancePreview,interactPreview} from '../src/domain/preview.js';
import {createPreviewSession,changePreviewSession,rollbackPreview,previewSlot,loadPreviewSlot,previewRevision,previewLineSeen,previewPreferences} from '../src/domain/previewSession.js';
import {createPreviewStorage} from '../src/platform/previewStorage.js';
function fixture(){const p=createProject(),s=Object.values(p.scenes)[0];p.items=[{id:'key',name:'Ключ'}];p.resources=[{id:'image',mime:'image/png',source:'data:image/png;base64,'+'a'.repeat(1000000)}];s.backgroundResourceId='image';s.images=[{id:'key-layer',name:'Ключ',resourceId:'image',interactions:[{id:'take',label:'Взять',text:'Взято',inventory:{operation:'add',itemId:'key',quantity:1},hideAfter:true}]}];s.actions=[{id:'one',type:'narration',text:'Начало'},{id:'explore',type:'explore'},{id:'after',type:'narration',text:'Конец'}];return {p,s};}
test('preview save/load/rollback restores inventory, hidden props, history and player state, never project media',()=>{
 const {p,s}=fixture(),original=structuredClone(p),revision=previewRevision(p);let run=createPreviewSession(p,s.id);assert.equal(previewLineSeen(run),false);
 run=changePreviewSession(p,run,state=>advancePreview(p,state));run=changePreviewSession(p,run,state=>interactPreview(p,state,'key-layer','take'));const saved=previewSlot(p,run,revision);assert.ok(JSON.stringify(saved).length<10000);assert.equal(run.state.inventory.key,1);assert.equal(run.history.length,2);
 run=changePreviewSession(p,run,state=>advancePreview(p,state));run=changePreviewSession(p,run,state=>advancePreview(p,state));run=loadPreviewSlot(p,saved,revision);assert.equal(run.state.waiting.text,'Взято');assert.equal(run.state.inventory.key,1);assert.equal(run.state.background,p.resources[0].source);
 run=rollbackPreview(p,run);assert.equal(run.state.waiting.type,'explore');assert.equal(run.state.inventory.key,undefined);assert.equal(run.state.hiddenProps.length,0);assert.equal(run.history.length,1);run=rollbackPreview(p,run);assert.equal(previewLineSeen(run),true);assert.deepEqual(p,original);
});
test('stale/foreign/corrupt slots fail clearly, media replacement remains current and history is bounded',()=>{
 const {p,s}=fixture();let run=createPreviewSession(p,s.id),slot=previewSlot(p,run);assert.throws(()=>loadPreviewSlot({...p,id:'other'},slot),/другому/);s.actions[0].text='Изменён';assert.throws(()=>loadPreviewSlot(p,slot),/изменён/);s.actions[0].text='Начало';
 p.resources[0].source='data:image/png;base64,new';assert.equal(loadPreviewSlot(p,slot).state.background,p.resources[0].source);assert.throws(()=>loadPreviewSlot(p,{...slot,history:[null]}),/повреждена/);
 assert.throws(()=>loadPreviewSlot(p,{...slot,state:{...slot.state,layers:[null]}}),/повреждено/);assert.throws(()=>loadPreviewSlot(p,{...slot,state:{...slot.state,inventory:[]}}),/повреждено/);
 for(let i=0;i<100;i++)run=changePreviewSession(p,run,state=>({...state,variables:{count:i}}));assert.equal(run.past.length,60);assert.equal(changePreviewSession(p,run,state=>state),run);
});
test('CG and audio are rehydrated by IDs, restored playback gets new tokens, active pauses cannot be saved',()=>{
 const {p,s}=fixture();s.actions=[{id:'cg',type:'showCG',assetId:'image'},{id:'sound',type:'sound',assetId:'image'},{id:'text',type:'narration',text:'CG'}];let run=createPreviewSession(p,s.id);const saved=previewSlot(p,run),restored=loadPreviewSlot(p,saved);assert.equal(restored.state.cg,p.resources[0].source);assert.notEqual(restored.state.audio.sound.token,run.state.audio.sound.token);assert.ok(!JSON.stringify(saved).includes('data:image'));
 s.actions=[{id:'pause',type:'pause',duration:2}];run=createPreviewSession(p,s.id);assert.throws(()=>previewSlot(p,run),/Дождитесь/);assert.equal(previewPreferences({voice:0,music:3,textSpeed:0}).voice,0);assert.equal(previewPreferences({music:3}).music,1);
});
test('separate preview DB persists slots across reopen, isolates projects and rejects stale overwrites/deletions',async()=>{
 const {p,s}=fixture(),name='preview-'+crypto.randomUUID(),slot=previewSlot(p,createPreviewSession(p,s.id));let db=await createPreviewStorage({factory:indexedDB,name});const first=await db.save(p.id,1,slot);assert.equal((await db.list('other')).filter(Boolean).length,0);db.close();db=await createPreviewStorage({factory:indexedDB,name});assert.equal((await db.list(p.id))[0].id,first.id);
 await assert.rejects(db.save(p.id,1,slot,null),/другом окне/);const second=await db.save(p.id,1,slot,first.id);await assert.rejects(db.remove(p.id,1,first.id),/другом окне/);await db.remove(p.id,1,second.id);assert.equal((await db.list(p.id))[0],null);await db.setPreferences(p.id,{voice:0});assert.equal((await db.preferences(p.id)).voice,0);db.close();
});
test('native sorted JSON maps do not invalidate an unchanged preview save',()=>{
 const {p,s}=fixture(),slot=previewSlot(p,createPreviewSession(p,s.id));
 const native=JSON.parse(JSON.stringify(p,(key,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))):value));
 assert.notEqual(JSON.stringify(native),JSON.stringify(p));assert.equal(previewRevision(native),previewRevision(p));assert.equal(loadPreviewSlot(native,slot).state.waiting.text,'Начало');
});
