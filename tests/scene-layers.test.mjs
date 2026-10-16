import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject} from '../src/domain/projectFactory.js';
import {backgroundTransform,backgroundStyle,renpyBackground} from '../runtime/background-transform.mjs';
import {sceneImages} from '../runtime/image-layers.mjs';
import {storyboardFrames} from '../src/domain/storyboard.js';
import {timelineFrame} from '../src/domain/timeline.js';
import {initialPreview,advancePreview} from '../src/domain/preview.js';
import {compilerInternals} from '../runtime/compiler.mjs';
import {canvasTransform} from '../src/domain/canvasTransform.js';
import {validateProject} from '../src/domain/validator.js';
import {useProjectStore as store,normalizeProject} from '../src/store/projectStore.js';
test('dragging coordinates remain unrestricted beyond every edge',()=>{
 const g={x:50,y:100,scale:100,clientX:0,clientY:0,width:100,height:100};
 assert.deepEqual(canvasTransform(g,-80,90),{x:-30,y:190,scale:100});
 assert.equal(canvasTransform(g,120,-140).x,170);assert.equal(canvasTransform(g,120,-140).y,-40);
});
test('background transform agrees in sequential frames, timed frame, preview and export',()=>{
 const p=createProject(),s=Object.values(p.scenes)[0],t={x:-12,y:135,width:120,height:85,scale:130,rotation:7,fit:'contain'};
 p.resources=[{id:'bg',category:'background',source:'bg.png'}];s.actions=[{id:'bg-action',type:'background',assetId:'bg',backgroundTransform:t,timeline:{start:0,duration:9}},{id:'text',type:'narration',text:'Hi'}];
 assert.deepEqual(storyboardFrames(p,s)[1].frame.backgroundTransform,t);
 assert.deepEqual(timelineFrame(p,s,1).backgroundTransform,t);
 assert.deepEqual(advancePreview(p,initialPreview(p,s.id)).backgroundTransform,t);
 assert.equal(backgroundStyle(t).left,'-12%');assert.match(renpyBackground('bg.png',1920,1080,t),/xpos=-0.12, ypos=1.35.*zoom=1.3/);
 const script=compilerInternals.createScript(p,new Map(),new Map([['bg','bg.png']]));assert.match(script,/xysize=\(2304, 918\), fit="contain"/);
 assert.equal(backgroundTransform({scale:-4}).scale,1);
});
test('independent table and tea layers roundtrip, undo, validate and export with zorder',()=>{
 const p=createProject(),s=Object.values(p.scenes)[0];p.resources=[{id:'table',name:'Стол',category:'prop',source:'table.png'},{id:'tea',name:'Посуда',category:'prop',source:'tea.png'}];
 store.setState({project:p,activeSceneId:s.id,activeActionId:null,past:[],future:[]});
 const id=store.getState().addSceneImage(s.id,'table');store.getState().updateSceneImage(s.id,id,{x:-20,y:120,zOrder:50});store.getState().addSceneImage(s.id,'tea');
 const saved=normalizeProject(JSON.parse(JSON.stringify(store.getState().project))),scene=saved.scenes[s.id];
 assert.equal(scene.images.length,2);assert.equal(sceneImages(scene)[0].x,-20);assert.equal(validateProject(saved).valid,true);
 const assets=new Map([['table','table.png'],['tea','tea.png']]);const script=compilerInternals.createScript(saved,new Map(),assets);
 assert.match(script,/table\.png.*xpos=-0.2, ypos=1.2.*zorder 50/);assert.ok(compilerInternals.usedResourceIds(saved).has('tea'));
 store.getState().undo();assert.equal(store.getState().project.scenes[s.id].images.length,1);
 scene.images[0].resourceId='missing';assert.equal(validateProject(saved).valid,false);
});
