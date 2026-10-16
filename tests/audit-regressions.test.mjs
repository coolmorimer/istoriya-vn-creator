import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject} from '../src/domain/projectFactory.js';
import {compilerInternals} from '../runtime/compiler.mjs';
import {textAppearance} from '../runtime/text-style.mjs';
import {safeProjectId} from '../runtime/project-path.mjs';
import {sceneExits} from '../src/domain/storyGraph.js';
import {validateProject} from '../src/domain/validator.js';
import {timelineFrame} from '../src/domain/timeline.js';
import {initialPreview,advancePreview} from '../src/domain/preview.js';
import {useProjectStore as store} from '../src/store/projectStore.js';

test('Перенос слоя на шкалу сохраняет трансформации, выделение и Undo',()=>{
  const p=createProject(),s=Object.values(p.scenes)[0];
  p.characters=[{id:'hero',name:'Hero',sprites:[]}];
  s.characters=[{id:'layer',characterId:'hero',x:24,y:82,scale:130,rotation:12,opacity:65,flip:true,visible:true}];
  store.setState({project:p,activeSceneId:s.id,past:[],future:[],timelineTime:2});
  assert.equal(store.getState().layerToTimeline(s.id,'layer'),true);
  const current=store.getState(),scene=current.project.scenes[s.id],frame=timelineFrame(current.project,scene,2);
  assert.equal(scene.characters.length,0);assert.equal(scene.actions.length,1);assert.equal(current.bottomTab,'timeline');
  for(const key of ['x','y','scale','rotation','opacity','flip'])assert.equal(frame.layers[0][key],s.characters[0][key]);
  store.getState().undo();assert.equal(store.getState().project.scenes[s.id].characters[0].id,'layer');
});
test('Карта игнорирует отключённый переход и выбирает первый по времени',()=>{
  const p=createProject(),s=Object.values(p.scenes)[0];s.timelineEnabled=true;
  p.scenes.a={id:'a',actions:[]};p.scenes.b={id:'b',actions:[]};
  s.actions=[{id:'disabled',type:'end',timeline:{start:0,enabled:false}},{id:'later',type:'jump',targetSceneId:'b',timeline:{start:5}},{id:'first',type:'jump',targetSceneId:'a',timeline:{start:2}}];
  assert.equal(sceneExits(p,s.id)[0].to,'a');
  assert.ok(validateProject(p).issues.some(i=>i.code==='unreachable-scene'&&i.sceneId==='b')===false); // a falls through to b
});
test('Флаг false и условия флагов одинаково компилируются, битые эффекты выявляются',()=>{
  const p=createProject(),s=Object.values(p.scenes)[0];p.flags=[{id:'f',initial:false}];
  s.actions=[{id:'set',type:'flag',flagId:'f',value:'false'},{id:'if',type:'condition',flagId:'f',value:true,trueSceneId:s.id,falseSceneId:s.id}];
  assert.equal(validateProject(p).valid,true);
  const script=compilerInternals.createScript(p,new Map());assert.match(script,/flag_f = False/);assert.match(script,/if flag_f == True:/);
  s.actions=[{id:'choice',type:'choice',options:[{id:'o',text:'bad',targetSceneId:s.id,condition:{flagId:'missing'},effects:[{variableId:'missing'}]}]}];
  const codes=validateProject(p).issues.map(i=>i.code);assert.ok(codes.includes('broken-choice-condition'));assert.ok(codes.includes('broken-choice-effect'));
});
test('Текст автора использует собственные цвет и размер в редакторе и runtime',()=>{
  const p=createProject(),s=Object.values(p.scenes)[0];p.ui.narratorTextColor='#aabbcc';p.ui.narratorFontSize=41;
  s.actions=[{id:'n',type:'narration',text:'Narrator'}];
  assert.equal(textAppearance(p,s.actions[0]).size,41);assert.equal(textAppearance(p,s.actions[0]).color,'#aabbcc');
  assert.match(compilerInternals.createScript(p,new Map()),/what_size=41, what_color="#aabbcc"/);
});
test('Папки сборки не используют точки или разделители как project id',()=>{
  for(const id of ['..','.','../escape','a/b','a\\b'])assert.ok(!['.','..'].includes(safeProjectId({id}))&&!/[\\/]/.test(safeProjectId({id})));
});

test('Отключённое завершение не убирает автоматический переход в следующую сцену',()=>{
  const p=createProject(),s=Object.values(p.scenes)[0];s.timelineEnabled=true;
  s.actions=[{id:'disabled',type:'end',timeline:{start:0,enabled:false}}];
  p.scenes.next={...structuredClone(s),id:'next',title:'Next',actions:[]};
  p.chapters[0].scenes.push('next');
  assert.match(compilerInternals.createScript(p,new Map()),/jump scene_next/);
});

test('Реплика на шкале применяет голос и спрайт в предпросмотре',()=>{
  const p=createProject(),s=Object.values(p.scenes)[0];s.timelineEnabled=true;
  p.characters=[{id:'hero',name:'Hero',sprites:[]}];s.characters=[{characterId:'hero',spriteId:'old'}];
  s.actions=[{id:'line',type:'dialogue',speakerId:'hero',spriteId:'new',voiceAssetId:'voice',text:'Hi',timeline:{start:0,duration:2,waitForClick:true}}];
  const state=advancePreview(p,initialPreview(p,s.id));
  assert.equal(state.layers[0].spriteId,'new');assert.equal(state.audio.voice.assetId,'voice');assert.equal(state.displayText.text,'Hi');
});
