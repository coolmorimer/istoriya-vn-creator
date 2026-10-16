import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject} from '../src/domain/projectFactory.js';
import {resourceUsageIndex,filterResources} from '../src/domain/resourceUsage.js';
import {resourceGridWindow,resourceGridScroll} from '../src/domain/resourceGrid.js';
import {uiResourceReferences,uiResourceReferenceEntries} from '../runtime/game-ui.mjs';

test('single-pass resource index includes gallery, inventory, line font and independent sound/voice with one place per action',()=>{
 const p=createProject(),s=Object.values(p.scenes)[0];p.resources=['image','voice','font'].map(id=>({id,source:`file:///${id}`}));
 s.backgroundResourceId='image';s.images=[{id:'layer',name:'Дверь',resourceId:'image',interactions:[{id:'reaction',label:'Открыть',voiceAssetId:'voice',soundAssetId:'voice',resultResourceId:'image'}]}];s.actions=[{id:'line',type:'narration',voiceAssetId:'voice',soundAssetId:'voice',textStyle:{font:'font'}}];p.items=[{id:'item',name:'Ключ',iconResourceId:'image'}];p.gallery.sections=[{id:'gallery',title:'CG',items:[{id:'cg',resourceId:'image'}]}];
 const before=JSON.stringify(p),index=resourceUsageIndex(p);assert.equal(index.get('image').length,5);assert.equal(index.get('voice').length,2);assert.equal(index.get('font').length,1);assert.ok(index.get('image').some(u=>u.kind==='inventory'));assert.equal(index.get('voice')[0].layerId,'layer');assert.equal(JSON.stringify(p),before);
});
test('resource index preserves source-only aliases without stealing another explicit resource and does not double-count legacy UI',()=>{
 const p=createProject(),s=Object.values(p.scenes)[0];p.resources=[{id:'a',source:'file:///same.png'},{id:'b',source:'file:///same.png'}];s.backgroundResourceId='a';s.background='file:///same.png';p.characters=[{id:'hero',name:'Герой',portrait:'file:///same.png',sprites:[{id:'main',resourceId:'b',source:'file:///same.png'}]}];p.ui.dialogueBackgroundResourceId='a';p.ui.layout.dialogue.window.resourceId='a';
 const index=resourceUsageIndex(p);assert.equal(index.get('a').length,3);assert.equal(index.get('b').length,2);assert.equal(index.get('a').filter(u=>u.kind==='interface').length,1);assert.equal(index.get('b').filter(u=>u.kind==='scene').length,0);
});
test('all UI reference entries retain per-field screen navigation and wrapper compatibility',()=>{
 const p=createProject();p.ui.layout.menu.buttons[0].idleResourceId='skin';p.ui.layout.menu.buttons[0].hoverResourceId='skin';p.ui.layout.choice.button.font='font';p.ui.textStyle={font:'font'};
 for(const id of ['skin','font'])assert.deepEqual(uiResourceReferences(p,id),uiResourceReferenceEntries(p).filter(e=>e.resourceId===id).map(e=>e.usage));assert.equal(uiResourceReferences(p,'skin').length,2);assert.ok(uiResourceReferences(p,'font').some(u=>u.screen==='choice'&&u.target==='screen'));
});
test('legacy reactions without IDs are distinct usage places, not silently collapsed',()=>{
 const p=createProject(),s=Object.values(p.scenes)[0];p.resources=[{id:'voice',source:'file:///voice.wav'}];s.images=[{id:'door',interactions:[{voiceAssetId:'voice',label:'Первый ответ'},{voiceAssetId:'voice',label:'Второй ответ'}]}];assert.equal(resourceUsageIndex(p).get('voice').length,2);
});
test('resource search combines category with NFC/case-insensitive name or original file, without editing data',()=>{
 const resources=[{id:'a',name:'ЙЁж',fileName:'forest.png',category:'background'},{id:'b',name:'Дверь',fileName:'КЛЮЧ.PNG',category:'prop'}];assert.deepEqual(filterResources(resources,'all','и\u0306ё'),[resources[0]]);assert.deepEqual(filterResources(resources,'all','ключ'),[resources[1]]);assert.deepEqual(filterResources(resources,'background','ключ'),[]);assert.equal(filterResources(resources).length,2);
});
test('virtual resource grid bounds DOM work and reaches every row after scroll/resize, including empty and last row',()=>{
 for(const width of [1,300,800,1500])for(const scrollTop of [0,177,20000,1e9]){const g=resourceGridWindow({count:5000,width,height:600,scrollTop});assert.ok(g.columns>=1);assert.ok(g.cellWidth>0);assert.ok(g.start>=0&&g.end<=5000);assert.ok(g.end-g.start<g.columns*10);if(scrollTop===1e9)assert.equal(g.end,5000);}
 const g=resourceGridWindow({count:5000,width:800,height:600,scrollTop:0});const tail=resourceGridScroll(4999,g,0,600);assert.ok(tail>10000);assert.equal(resourceGridWindow({count:5000,width:800,height:600,scrollTop:tail}).end,5000);assert.equal(resourceGridScroll(0,g,tail,600),12);assert.equal(resourceGridWindow({count:0,width:800,height:600,scrollTop:0}).end,0);
});
