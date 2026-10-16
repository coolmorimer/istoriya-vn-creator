import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject} from '../src/domain/projectFactory.js';
import {storyboardFrames,sequentialActions} from '../src/domain/storyboard.js';
import {advancePreview,initialPreview} from '../src/domain/preview.js';
import {useProjectStore as store} from '../src/store/projectStore.js';

test('Кадры накапливают фон, персонажа, трансформацию и смену спрайта как runtime',()=>{
 const p=createProject(),s=Object.values(p.scenes)[0];p.resources=[{id:'bg',source:'bg.png'}];p.characters=[{id:'hero',name:'Hero',sprites:[]}];
 s.actions=[{id:'b',type:'background',assetId:'bg'},{id:'h',type:'showCharacter',characterId:'hero',x:24,y:90,scale:75,rotation:10},{id:'t',type:'dialogue',speakerId:'hero',spriteId:'smile',text:'Hi'}];
 const frames=storyboardFrames(p,s),preview=advancePreview(p,initialPreview(p,s.id));
 assert.equal(frames[0].frame.background,'bg.png');assert.equal(frames[0].frame.layers.length,0);assert.equal(frames[2].frame.layers[0].spriteId,'smile');
 for(const key of ['x','y','scale','rotation','spriteId'])assert.equal(frames[2].frame.layers[0][key],preview.layers[0][key]);
 assert.equal(frames[1].frame.layers[0].spriteId,null);assert.equal(frames[2].frame.text.text,'Hi');
});
test('Вставка и дублирование идут после выбранного шага, сохраняют вкладку и Undo',()=>{
 const p=createProject(),s=Object.values(p.scenes)[0];s.actions=[{id:'a',type:'narration',text:'A'},{id:'b',type:'narration',text:'B'}];
 store.setState({project:p,activeSceneId:s.id,bottomTab:'scenario',past:[],future:[]});
 const id=store.getState().addAction('background',{afterId:'a'});assert.deepEqual(store.getState().project.scenes[s.id].actions.map(a=>a.id),['a',id,'b']);
 store.getState().pasteAction(s.id,s.actions[0],{afterId:'a'});assert.equal(store.getState().bottomTab,'scenario');assert.equal(store.getState().project.scenes[s.id].actions[1].text,'A');
 store.getState().undo();assert.equal(store.getState().project.scenes[s.id].actions.length,3);
});
test('Конвертация timed-сцены исключает отключённые клипы, хранит исходный монтаж и отменяется',()=>{
 const p=createProject(),s=Object.values(p.scenes)[0];s.timelineEnabled=true;s.actions=[{id:'late',type:'narration',text:'Late',timeline:{start:3}},{id:'off',type:'end',timeline:{start:0,enabled:false}},{id:'first',type:'narration',text:'First',timeline:{start:0}}];
 assert.deepEqual(sequentialActions(s).map(a=>a.id),['first','late']);
 store.setState({project:p,activeSceneId:s.id,past:[],future:[]});store.getState().convertSceneToStoryboard(s.id);
 const scene=store.getState().project.scenes[s.id];assert.equal(scene.timelineEnabled,false);assert.equal(scene.savedTimeline.actions.length,3);assert.ok(scene.actions.every(a=>!a.timeline));
 store.getState().undo();assert.equal(store.getState().project.scenes[s.id].timelineEnabled,true);
});
