import test from 'node:test';import assert from 'node:assert/strict';
import {orderedStoryScenes,storyStartScene} from '../runtime/story-routing.mjs';
import {applyNativeStoryPlan} from '../runtime/native-story-plan.mjs';
import {compilerInternals} from '../runtime/compiler.mjs';
import {sceneOrder,sceneExits} from '../src/domain/storyGraph.js';
import {sceneMapIndex} from '../src/domain/graphViewport.js';
import {validateProject} from '../src/domain/validator.js';
import {initialPreview,advancePreview} from '../src/domain/preview.js';
import {createProject} from '../src/domain/projectFactory.js';
import {normalizeProject,useProjectStore as store} from '../src/store/projectStore.js';
import {sceneTreeRows,sceneTreeGroups} from '../src/domain/sceneTree.js';
const fixture=()=>{const p=createProject();p.scenes={a:{id:'a',characters:[],actions:[{id:'a',type:'narration',text:'A'}]},b:{id:'b',characters:[],actions:[{id:'b',type:'narration',text:'B'}]},c:{id:'c',characters:[],actions:[{id:'c',type:'narration',text:'C'}]}};p.chapters=[{id:'first',scenes:['a','b'],entrySceneId:'b'},{id:'empty',scenes:[]}];return p;};
const plan=()=>({protocol:1,startSceneId:'b',startActionId:null,sceneOrder:['a','b','c'],chapterEntries:{first:'b'},nextScene:{a:'b',b:'c',c:null},transitions:[]});

test('chapter entry and unassigned fallthrough agree in map, preview and compatible export',()=>{
 const p=fixture();assert.deepEqual(orderedStoryScenes(p),['a','b','c']);assert.deepEqual(sceneOrder(p),['a','b','c']);assert.equal(storyStartScene(p),'b');assert.equal(sceneExits(p,'b')[0].to,'c');
 assert.equal(sceneMapIndex(p).startSceneId,'b');assert.ok(validateProject(p).issues.some(i=>i.code==='unreachable-scene'&&i.sceneId==='a'));assert.ok(!validateProject(p).issues.some(i=>i.code==='unreachable-scene'&&i.sceneId==='c'));
 let state=advancePreview(p,initialPreview(p,'b'));assert.equal(state.waiting.text,'B');state=advancePreview(p,state);assert.equal(state.sceneId,'c');assert.equal(state.waiting.text,'C');
 const script=compilerInternals.createScript(p,new Map());assert.match(script,/label start:\n    jump scene_b/);assert.match(script.split('label scene_b:\n')[1].split('\nlabel ')[0],/jump scene_c/);
});
test('deduplicated chapter order is independent of object insertion and numeric keys',()=>{
 const p=fixture();p.chapters[1].scenes=['b'];p.scenes['2']={actions:[]};p.scenes['10']={actions:[]};p.scenes['😀']={actions:[]};p.scenes['\ue000']={actions:[]};assert.deepEqual(orderedStoryScenes(p),['a','b','10','2','c','😀','\ue000']);assert.equal(storyStartScene(p,'c'),'c');assert.throws(()=>storyStartScene(p,'gone'),/Сцена запуска удалена/);
});
test('native plan uses resolved destinations without reinterpreting the chapter override',()=>{
 const p=fixture();p.scenes.a.actions=[{id:'j',type:'jump',targetChapterId:'first',targetSceneId:'a'}];const r=plan();r.transitions=[{pointer:'/scenes/a/actions/0/targetSceneId',destination:{kind:'chapter',chapterId:'first',sceneId:'c'}}];const before=structuredClone(p);
 const prepared=applyNativeStoryPlan(p,r);assert.equal(prepared.project.scenes.a.actions[0].targetSceneId,'c');assert.equal(prepared.project.scenes.a.actions[0].targetChapterId,'first');assert.deepEqual(p,before);
 // Deliberately differs from the current JS chapter entry. This proves the
 // private emitter consumes the checked native plan instead of re-resolving it.
 const script=compilerInternals.createScript(p,new Map(),new Map(),new Map(),null,null,r);assert.match(script.split('label scene_a:\n')[1].split('\nlabel ')[0],/jump scene_c/);
});
test('native resolution copies only changed parent branches and never clones media',()=>{
 const p=fixture(),resource={id:'large',source:'data:image/png;base64,'+'a'.repeat(2_000_000)};p.resources=[resource];p.scenes.a.images=[{id:'prop',source:resource.source,interactions:[{id:'open',targetChapterId:'first'}]}];
 const r=plan();r.transitions=[{pointer:'/scenes/a/images/0/interactions/0/targetSceneId',destination:{kind:'chapter',chapterId:'first',sceneId:'b'}}];const prepared=applyNativeStoryPlan(p,r).project;
 assert.equal(prepared.resources,p.resources);assert.equal(prepared.resources[0],resource);assert.equal(prepared.scenes.b,p.scenes.b);assert.equal(prepared.scenes.a.actions,p.scenes.a.actions);assert.notEqual(prepared.scenes.a.images,p.scenes.a.images);assert.equal(p.scenes.a.images[0].interactions[0].targetSceneId,undefined);assert.equal(prepared.scenes.a.images[0].interactions[0].targetSceneId,'b');
});
test('native pointers preserve literal slash and tilde scene IDs and fill missing legacy ID only in view',()=>{
 const p=fixture();p.scenes['~/']={actions:[{type:'jump',targetSceneId:'a'}]};const r=plan();r.sceneOrder.push('~/');r.nextScene.c='~/';r.nextScene['~/']=null;r.transitions=[{pointer:'/scenes/~0~1/actions/0/targetSceneId',destination:{kind:'scene',sceneId:'b'}}];const out=applyNativeStoryPlan(p,r).project;assert.equal(out.scenes['~/'].id,'~/');assert.equal(out.scenes['~/'].actions[0].targetSceneId,'b');assert.equal(p.scenes['~/'].id,undefined);
});
test('damaged plan shape and unsafe or stale paths cannot silently mutate a different record',()=>{
 for(const change of [r=>r.protocol=2,r=>r.startSceneId='gone',r=>r.startActionId='gone',r=>r.sceneOrder=['a','a','c'],r=>r.nextScene.b='gone',r=>delete r.nextScene.c,r=>r.transitions=[{pointer:'/meta/title',destination:{kind:'scene',sceneId:'b'}}],r=>r.transitions=[{pointer:'/scenes/a/actions/999/targetSceneId',destination:{kind:'scene',sceneId:'b'}}],r=>r.transitions=[{pointer:'/scenes/a~3/actions/0/targetSceneId',destination:{kind:'scene',sceneId:'b'}}],r=>r.transitions=[{pointer:'/scenes/a/actions/0/targetSceneId',destination:{kind:'scene',sceneId:'gone'}}]]){const p=fixture(),before=structuredClone(p),r=plan();change(r);assert.throws(()=>applyNativeStoryPlan(p,r),/План переходов Rust повреждён/);assert.deepEqual(p,before);}
});
test('import/save normalization preserves unassigned membership instead of changing the game order',()=>{
 const p=fixture(),before=structuredClone(p.chapters),n=normalizeProject(p);assert.deepEqual(n.chapters,before);assert.deepEqual(orderedStoryScenes(n),['a','b','c']);assert.ok(!n.chapters.some(c=>c.scenes.includes('c')));assert.deepEqual(normalizeProject(JSON.parse(JSON.stringify(n))).chapters,before);
});
test('virtual tree group is searchable, collapsible and never becomes an author chapter',()=>{
 const p=fixture(),before=structuredClone(p);p.scenes.c.title='Свободная сцена';p.chapters.push({id:'@istoriya:unassigned',title:'Real chapter',scenes:[]});const groups=sceneTreeGroups(p),virtual=groups.at(-1);assert.equal(virtual.virtual,true);assert.notEqual(virtual.chapter.id,p.chapters.at(-1).id);const model=sceneTreeRows(p),row=model.rows.find(r=>r.scene?.id==='c');assert.equal(row.parentKey,'group:unassigned');assert.equal(row.virtual,true);assert.ok(!sceneTreeRows(p,new Set([virtual.chapter.id])).rows.some(r=>r.scene?.id==='c'));assert.ok(sceneTreeRows(p,new Set([virtual.chapter.id]),'Свободная').rows.some(r=>r.scene?.id==='c'));assert.deepEqual(p.chapters.slice(0,2),before.chapters);assert.equal(p.chapters.length,3);
});
test('explicit detach and reassign update real membership with one Undo and keep chapter entrances valid',()=>{
 const p=fixture();store.setState({project:p,past:[],future:[]});store.getState().moveSceneToChapter('b','');let n=store.getState().project;assert.ok(!n.chapters.some(c=>c.scenes.includes('b')));assert.equal(n.chapters[0].entrySceneId,null);assert.equal(storyStartScene(n),'a');store.getState().undo();n=store.getState().project;assert.equal(n.chapters[0].entrySceneId,'b');assert.ok(n.chapters[0].scenes.includes('b'));store.getState().redo();store.getState().moveSceneToChapter('b','first');n=store.getState().project;assert.ok(n.chapters[0].scenes.includes('b'));assert.equal(n.chapters.some(c=>c.id==='@istoriya:unassigned'),false);
});
test('map arrangement includes free scenes without creating a chapter and Undo restores all positions',()=>{
 const p=fixture(),chapters=structuredClone(p.chapters);store.setState({project:p,past:[],future:[]});store.getState().arrangeMap();const n=store.getState().project,points=Object.values(n.scenes).map(s=>s.mapPosition);assert.ok(points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));assert.equal(new Set(points.map(p=>`${p.x}:${p.y}`)).size,points.length);assert.ok(n.scenes.c.mapPosition.y>n.scenes.b.mapPosition.y);assert.deepEqual(n.chapters,chapters);store.getState().undo();assert.ok(Object.values(store.getState().project.scenes).every(s=>s.mapPosition===undefined));
});
