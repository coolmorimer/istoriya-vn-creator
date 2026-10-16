import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject} from '../src/domain/projectFactory.js';
import {authorBackground,backgroundTarget} from '../src/domain/backgroundAuthoring.js';
import {useProjectStore as store,normalizeProject} from '../src/store/projectStore.js';
import {storyboardFrames} from '../src/domain/storyboard.js';
import {initialPreview,advancePreview} from '../src/domain/preview.js';
import {compilerInternals} from '../runtime/compiler.mjs';
import {validateProject} from '../src/domain/validator.js';
const ids={resourceId:'bg-resource',actionId:'bg-action'},image={name:'Лес',source:'data:image/png;base64,cG5n',mime:'image/png',width:1920,height:1080};
const fixture=()=>{const p=createProject(),s=Object.values(p.scenes)[0];return {p,s};};
test('first background is an atomic resource link with selection, undo/redo and reopen',()=>{
 const {p,s}=fixture();store.setState({project:p,activeSceneId:s.id,activeActionId:null,activeLayerId:null,past:[],future:[]});
 const result=store.getState().applyBackground({...backgroundTarget(p,s.id),mode:'current',resource:image,fit:'cover'});
 const authored=store.getState().project;assert.equal(authored.resources.length,1);assert.equal(authored.scenes[s.id].background,null);assert.equal(authored.scenes[s.id].backgroundResourceId,result.resourceId);assert.equal(authored.scenes[s.id].actions.length,0);
 assert.equal(validateProject(authored).issues.some(i=>i.code==='missing-background'),false);
 assert.equal(store.getState().activeLayerId,'__background');assert.equal(store.getState().past.length,1);
 store.getState().undo();assert.equal(store.getState().project.resources.length,0);assert.equal(store.getState().activeLayerId,null);
 store.getState().redo();assert.equal(normalizeProject(JSON.parse(JSON.stringify(store.getState().project))).scenes[s.id].backgroundResourceId,result.resourceId);
});
test('replace targets the contributing background action, not a hidden initial scene background',()=>{
 const {p,s}=fixture();p.resources=[{...image,id:'old'}];s.background='initial.png';s.actions=[{id:'bg',type:'background',assetId:'old',backgroundTransform:{x:20,y:80,scale:140}},{id:'text',type:'narration',text:'Hello'}];
 const target=backgroundTarget(p,s.id,'text');assert.equal(target.targetActionId,'bg');
 authorBackground(p,{...target,mode:'current',resource:image,fit:'contain'},ids);
 assert.equal(s.background,'initial.png');assert.equal(s.actions[0].assetId,ids.resourceId);assert.equal(s.actions[0].backgroundTransform.x,20);assert.equal(s.actions[0].backgroundTransform.scale,140);assert.equal(storyboardFrames(p,s)[1].frame.background,image.source);
});
test('insert reuses a resource, keeps actors explicitly, and old background actions still clear',()=>{
 const {p,s}=fixture();p.resources=[{...image,id:'existing'}];p.characters=[{id:'h',name:'Hero',sprites:[]}];s.characters=[{id:'layer',characterId:'h',scale:135,spriteId:'worried'}];s.actions=[{id:'text',type:'narration',text:'Before'}];
 authorBackground(p,{...backgroundTarget(p,s.id,'text'),mode:'insert',resourceId:'existing',preserveCharacters:true},ids);
 assert.equal(p.resources.length,1);assert.equal(s.actions[1].preserveCharacters,true);assert.equal(storyboardFrames(p,s)[1].frame.layers.length,1);
 s.actions.push({id:'after',type:'narration',text:'After'});let state=advancePreview(p,initialPreview(p,s.id));state=advancePreview(p,state);assert.equal(state.layers[0].spriteId,'worried');
 const script=compilerInternals.createScript(p,new Map(),new Map([['existing','forest.png']]),new Map([['h:worried','worried.png']]));assert.match(script,/show expression.*forest.png.*as istoriya_scene_bg zorder -100/);
 delete s.actions[1].preserveCharacters;assert.equal(storyboardFrames(p,s)[1].frame.layers.length,0);assert.equal(advancePreview(p,advancePreview(p,initialPreview(p,s.id))).layers.length,0);
});
test('stale project/scene/action/resource rejects before committing and timed insertion preserves clips',()=>{
 const {p,s}=fixture(),origin=backgroundTarget(p,s.id);
 for(const patch of [{projectId:'other'},{sceneId:'gone'},{afterId:'gone'},{targetActionId:'gone'},{resourceId:'gone'},{mode:'invalid'}])assert.throws(()=>authorBackground(p,{...origin,mode:'current',resource:image,...patch},ids));
 assert.equal(p.resources.length,0);s.timelineEnabled=true;s.actions=[{id:'old',type:'narration',text:'Keep',timeline:{start:0,duration:2}}];
 authorBackground(p,{...backgroundTarget(p,s.id,'old',3),mode:'insert',resource:image,duration:4},ids);assert.equal(s.actions.length,2);assert.equal(s.actions[1].timeline.start,3);assert.equal(s.actions[1].timeline.duration,4);
});
