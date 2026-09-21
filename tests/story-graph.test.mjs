import test from 'node:test';
import assert from 'node:assert/strict';
import { connectScenes, sceneExits, updateExit, removeExit } from '../src/domain/storyGraph.js';

const project = () => ({ chapters: [{id:'chapter',scenes:['a','b','c']}], scenes: Object.fromEntries(['a','b','c'].map(id => [id,{id,title:id,actions:[]}])) });

test('Карта создаёт переход и ветвление, редактирует текст и назначение в сценарии', () => {
  const p = project();
  assert.equal(sceneExits(p,'a')[0].kind,'implicit');
  connectScenes(p,'a','b');
  connectScenes(p,'a','c');
  assert.equal(p.scenes.a.actions[0].type,'choice');
  assert.deepEqual(sceneExits(p,'a').map(e=>e.to),['b','c']);
  updateExit(p,sceneExits(p,'a')[0],{label:'Пойти дальше',to:'c'});
  assert.equal(p.scenes.a.actions[0].options[0].text,'Пойти дальше');
  assert.equal(sceneExits(p,'a')[0].to,'c');
  removeExit(p,sceneExits(p,'a')[0]);
  assert.equal(sceneExits(p,'a').length,1);
  removeExit(p,sceneExits(p,'a')[0]);
  assert.equal(p.scenes.a.actions[0].type,'end');
  assert.deepEqual(sceneExits(p,'a'),[]);
});

test('Удаление автоматической связи завершает сцену, новое соединение восстанавливает переход', () => {
  const p = project();
  removeExit(p,sceneExits(p,'a')[0]);
  assert.deepEqual(sceneExits(p,'a'),[]);
  connectScenes(p,'a','c');
  assert.equal(sceneExits(p,'a')[0].to,'c');
});

test('Карта использует первый выход, а условие позволяет переподключать отдельную ветку', () => {
  const p = project();
  p.scenes.a.actions=[{id:'condition',type:'condition',trueSceneId:'b',falseSceneId:'c'},{id:'unreachable',type:'jump',targetSceneId:'a'}];
  assert.equal(sceneExits(p,'a').length,2);
  updateExit(p,sceneExits(p,'a')[0],{to:'c'});
  assert.equal(p.scenes.a.actions[0].trueSceneId,'c');
  assert.throws(()=>connectScenes(p,'a','b'),/ветку/);
});
