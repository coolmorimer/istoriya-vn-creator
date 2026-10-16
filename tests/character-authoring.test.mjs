import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject} from '../src/domain/projectFactory.js';
import {storyboardFrames} from '../src/domain/storyboard.js';
import {timelineFrame} from '../src/domain/timeline.js';
import {compilerInternals} from '../runtime/compiler.mjs';
import {validateProject} from '../src/domain/validator.js';
import {assertCharacterImageFile} from '../src/platform/characterImage.js';
const cache=new Map();globalThis.localStorage={getItem:key=>cache.get(key)??null,setItem:(key,value)=>cache.set(key,value),removeItem:key=>cache.delete(key)};
const {useProjectStore:store}=await import('../src/store/projectStore.js');
const resource={name:'hero',source:'data:image/png;base64,iVBORw0KGgo=',mime:'image/png',width:100,height:200,size:10};
const setup=()=>{const p=createProject(),scene=Object.values(p.scenes)[0];store.setState({project:p,activeSceneId:scene.id,activeActionId:null,past:[],future:[],saveState:'saved'});return{p,scene};};
const input=scene=>({sceneId:scene.id,name:'  Элира  ',spriteName:'Спокойствие',resource,position:'right'});

test('new hero, main sprite, resource and selected-frame appearance are one undoable transaction',async()=>{
 const {p,scene}=setup();scene.actions=[{id:'first',type:'narration',text:'First'},{id:'last',type:'narration',text:'Last'}];
 const before=structuredClone(p),created=store.getState().createCharacterOnScene({...input(scene),afterId:'first'}),state=store.getState();
 assert.equal(state.past.length,1);assert.equal(state.activeSection,'scenes');
 assert.equal(state.project.characters[0].name,'Элира');assert.equal(state.project.characters[0].defaultSpriteId,created.spriteId);
 assert.equal(state.project.scenes[scene.id].actions[1].id,created.actionId);
 const frame=storyboardFrames(state.project,state.project.scenes[scene.id])[1].frame;
 assert.equal(frame.layers[0].x,75);assert.equal(frame.layers[0].spriteId,created.spriteId);
 assert.equal(validateProject(state.project).valid,true);
 store.getState().undo();assert.deepEqual(store.getState().project,before);assert.equal(store.getState().activeActionId,'first');assert.equal(store.getState().selectedCharacterId,null);
 store.getState().redo();assert.equal(store.getState().project.resources.length,1);assert.equal(store.getState().activeActionId,created.actionId);
 assert.equal(await store.getState().saveNow(),true);
 assert.equal(JSON.parse(cache.get('istoriya-project-v2')).characters[0].defaultSpriteId,created.spriteId);
});

test('opening an authored scene selects its first frame instead of a blank canvas',async()=>{
 const {scene}=setup(),created=store.getState().createCharacterOnScene(input(scene));
 await store.getState().saveNow();const id=store.getState().project.id;
 await store.getState().newProject();await store.getState().openProject(id);
 assert.equal(store.getState().activeActionId,created.actionId);
 assert.equal(storyboardFrames(store.getState().project,store.getState().project.scenes[scene.id])[0].frame.layers[0].characterId,created.characterId);
});

test('existing resource is reused and a sprite can be supplied to an unfinished hero',()=>{
 const {p,scene}=setup();p.resources=[{...resource,id:'reused'}];p.characters=[{id:'unfinished',name:'Hero',sprites:[]}];
 const created=store.getState().createCharacterOnScene({...input(scene),characterId:'unfinished',resource:undefined,resourceId:'reused'});
 assert.equal(store.getState().project.characters.length,1);assert.equal(store.getState().project.resources.length,1);
 assert.equal(created.characterId,'unfinished');assert.equal(store.getState().project.characters[0].sprites[0].resourceId,'reused');
});

test('timeline placement uses requested time without dropping old clips; initial scene placement stays separate',()=>{
 const {scene}=setup();scene.timelineEnabled=true;scene.actions=[{id:'old',type:'narration',text:'Old',timeline:{start:0,duration:2}}];
 const created=store.getState().createCharacterOnScene({...input(scene),placement:'timeline',time:7.25}),p=store.getState().project,s=p.scenes[scene.id];
 assert.equal(s.actions.find(a=>a.id===created.actionId).timeline.start,7.25);assert.equal(s.actions.length,2);
 assert.equal(timelineFrame(p,s,8).layers[0].characterId,created.characterId);
 store.getState().undo();assert.equal(store.getState().project.scenes[scene.id].actions.length,1);
 const placed=store.getState().createCharacterOnScene({...input(scene),placement:'scene'});
 assert.equal(store.getState().project.scenes[scene.id].characters[0].id,placed.layerId);
});

test('invalid/stale input never leaves a partial hero or resource',()=>{
 for(const patch of [{name:' '},{spriteName:''},{name:'x'.repeat(101)},{resource:null},{resource:{...resource,mime:'image/svg+xml'}},{resourceId:'gone'},{characterId:'gone'},{sceneId:'gone'},{projectId:'other-project'},{placement:'timeline'}]){
  const {p,scene}=setup(),before=structuredClone(p);
  assert.throws(()=>store.getState().createCharacterOnScene({...input(scene),...patch}));
  assert.deepEqual(store.getState().project,before);assert.equal(store.getState().past.length,0);
 }
});

test('created image is resolved by the exported game, not an inline-only editor placeholder',()=>{
 const {scene}=setup(),created=store.getState().createCharacterOnScene(input(scene)),p=store.getState().project;
 const script=compilerInternals.createScript(p,new Map(),new Map([[created.resourceId,'assets/hero.png']]),new Map([[`${created.characterId}:${created.spriteId}`,'assets/hero.png']]));
 assert.match(script,/show expression Transform\("assets\/hero.png"/);
 assert.match(script,/xpos=0.75/);assert.ok(compilerInternals.usedResourceIds(p).has(created.resourceId));
});

test('file preflight rejects empty, huge and unsupported images with actionable messages',()=>{
 assert.doesNotThrow(()=>assertCharacterImageFile({type:'image/png',size:100}));
 for(const file of [null,{type:'image/png',size:0},{type:'image/png',size:101*1024*1024},{type:'image/svg+xml',size:100}])assert.throws(()=>assertCharacterImageFile(file));
});
