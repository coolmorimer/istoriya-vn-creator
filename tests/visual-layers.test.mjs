import test from 'node:test';
import assert from 'node:assert/strict';
import { storyboardFrames } from '../src/domain/storyboard.js';
import { visualLayerEdits } from '../src/domain/visualLayers.js';
import { createProject } from '../src/domain/projectFactory.js';
import { useProjectStore as store } from '../src/store/projectStore.js';
import { compilerInternals } from '../runtime/compiler.mjs';
test('layer edits target the contributing actions without leaving selected frame',()=>{
 const p=createProject(),s=Object.values(p.scenes)[0];s.actions=[{id:'show',type:'showCharacter',characterId:'a',name:'Лира',x:25,scale:75,locked:true},{id:'move',type:'moveCharacter',characterId:'a',x:70},{id:'line',type:'dialogue',speakerId:'a',spriteId:'happy',text:'Hi'}];
 const layer=storyboardFrames(p,s)[2].frame.layers[0];
 assert.equal(layer.name,'Лира');assert.equal(layer.locked,true);
 assert.deepEqual(visualLayerEdits(layer,{x:60,scale:90,spriteId:'sad'}),[{actionId:'move',patch:{x:60}},{actionId:'show',patch:{scale:90}},{actionId:'line',patch:{spriteId:'sad'}}]);
 store.setState({project:p,activeSceneId:s.id,activeActionId:'line',past:[],future:[]});store.getState().selectVisualLayer(layer.id);
 assert.equal(store.getState().activeActionId,'line');assert.equal(store.getState().activeLayerId,'show');assert.equal(store.getState().past.length,0);
 for(const edit of visualLayerEdits(layer,{x:60,opacity:0}))store.getState().updateAction(s.id,edit.actionId,edit.patch);
 const next=storyboardFrames(store.getState().project,store.getState().project.scenes[s.id])[2].frame.layers[0];assert.equal(next.x,60);assert.equal(next.opacity,0);
});
test('exported movement keeps active emotion, arbitrary coordinates and size',()=>{
 const p=createProject(),s=Object.values(p.scenes)[0];p.characters=[{id:'a',name:'A',sprites:[]}];
 s.actions=[{id:'show',type:'showCharacter',characterId:'a',spriteId:'neutral',scale:75,opacity:65,flip:true},{id:'say',type:'dialogue',speakerId:'a',spriteId:'happy',text:'Hi'},{id:'move',type:'moveCharacter',characterId:'a',x:63,y:94,duration:1}];
 const script=compilerInternals.createScript(p,new Map(),new Map(),new Map([['a:default','default.png'],['a:neutral','neutral.png'],['a:happy','happy.png']]));
 assert.match(script,/happy\.png.*xpos=0\.63, ypos=0\.94.*zoom=0\.75.*alpha=0\.65.*xzoom=-1/);
});
