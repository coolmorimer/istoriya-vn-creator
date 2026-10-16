import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject} from '../src/domain/projectFactory.js';
import {authorChoiceBranch} from '../src/domain/branchAuthoring.js';
import {useProjectStore as store} from '../src/store/projectStore.js';
import {validateProject} from '../src/domain/validator.js';
import {initialPreview,advancePreview} from '../src/domain/preview.js';
import {sceneExits} from '../src/domain/storyGraph.js';
function fixture(){
 const p=createProject(),s=Object.values(p.scenes)[0];
 s.actions=[{id:'choice',type:'choice',prompt:'Куда?',options:[{id:'yes',text:'К огням',targetSceneId:null,effects:[]},{id:'no',text:'К рассвету',targetSceneId:null,effects:[]}]}];
 return {p,s,request:{projectId:p.id,sceneId:s.id,actionId:'choice',optionId:'yes'}};
}
test('new choice starts with two unique unlinked options; validation requires actual destinations',()=>{
 const p=createProject(),s=Object.values(p.scenes)[0];store.setState({project:p,activeSceneId:s.id,activeActionId:null,activeLayerId:null,past:[],future:[]});
 store.getState().addAction('choice');const current=store.getState().project,action=current.scenes[s.id].actions[0];
 assert.equal(action.options.length,2);assert.notEqual(action.options[0].id,action.options[1].id);assert.ok(action.options.every(o=>o.targetSceneId===null));
 assert.equal(validateProject(current).issues.filter(i=>i.code==='choice-without-target').length,2);
 store.getState().undo();assert.equal(store.getState().project.scenes[s.id].actions.length,0);store.getState().redo();assert.deepEqual(store.getState().project.scenes[s.id].actions[0],action);
});
test('branch creation and destination link form one Undo without navigating away or changing old options',()=>{
 const {p,s,request}=fixture();s.actions[0].options[1].condition={kind:'all',conditions:[]};
 store.setState({project:p,activeSceneId:s.id,activeActionId:'choice',activeLayerId:null,past:[],future:[]});
 const id=store.getState().createChoiceBranch(request);let state=store.getState(),branch=state.project.scenes[id];
 assert.equal(state.past.length,1);assert.equal(state.activeSceneId,s.id);assert.equal(state.activeActionId,'choice');
 assert.equal(branch.title,'К огням');assert.equal(branch.number,'1.2');assert.equal(branch.background,null);assert.equal(branch.characters.length,0);assert.equal(branch.actions.length,0);assert.equal(branch.images.length,0);
 assert.equal(state.project.scenes[s.id].actions[0].options[0].targetSceneId,id);assert.deepEqual(state.project.scenes[s.id].actions[0].options[1],p.scenes[s.id].actions[0].options[1]);
 state.undo();state=store.getState();assert.equal(state.project.scenes[id],undefined);assert.equal(state.project.scenes[s.id].actions[0].options[0].targetSceneId,null);assert.equal(state.project.chapters[0].scenes.length,1);
 state.redo();assert.equal(store.getState().project.scenes[s.id].actions[0].options[0].targetSceneId,id);
});
test('stale, linked, orphan and duplicate-ID branch requests reject before mutation',()=>{
 for(const change of ['project','scene','action','option','linked','chapter','duplicate']){
  const {p,s,request}=fixture();let id='new';
  if(['project','scene','action','option'].includes(change))request[change+'Id']='deleted';
  if(change==='linked')s.actions[0].options[0].targetSceneId=s.id;
  if(change==='chapter')p.chapters[0].scenes=[];
  if(change==='duplicate')id=s.id;
  const before=structuredClone(p);assert.throws(()=>authorChoiceBranch(p,request,id));assert.deepEqual(p,before);
 }
});
test('two authored branches are actual map/runtime destinations and do not fall through other endings',()=>{
 const {p,s,request}=fixture();authorChoiceBranch(p,request,'yes-scene');authorChoiceBranch(p,{...request,optionId:'no'},'no-scene');
 for(const [id,text] of [['yes-scene','Огни'],['no-scene','Рассвет']])p.scenes[id].actions=[{id:'line-'+id,type:'narration',text},{id:'end-'+id,type:'end'}];
 assert.equal(validateProject(p).valid,true);assert.deepEqual(sceneExits(p,s.id).map(e=>e.to),['yes-scene','no-scene']);
 for(const [option,text] of [['yes','Огни'],['no','Рассвет']]){
  let state=advancePreview(p,initialPreview(p,s.id));state=advancePreview(p,state,option);assert.equal(state.waiting.text,text);state=advancePreview(p,state);assert.equal(state.ended,true);assert.equal(state.error,undefined);
 }
});
test('creating a branch from a legacy timed choice does not rewrite clips or convert its source scene',()=>{
 const {p,s,request}=fixture();s.timelineEnabled=true;s.actions[0].timeline={start:3,duration:1,enabled:true};
 authorChoiceBranch(p,request,'branch');assert.equal(s.timelineEnabled,true);assert.deepEqual(s.actions[0].timeline,{start:3,duration:1,enabled:true});assert.equal(p.scenes.branch.timelineEnabled,undefined);
});
