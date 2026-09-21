import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCharacterSprite } from '../runtime/character-sprites.mjs';
import { useProjectStore } from '../src/store/projectStore.js';
import { createProject } from '../src/domain/projectFactory.js';
import { initialPreview, advancePreview } from '../src/domain/preview.js';
import { compileProject } from '../runtime/compiler.mjs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('Основной спрайт приоритетнее портрета, явное состояние приоритетнее основного', () => {
  const c={portrait:'portrait.png',defaultSpriteId:'b',sprites:[{id:'a',source:'a.png'},{id:'b',resourceId:'res'}]};
  const resources=[{id:'res',source:'b.png'}];
  assert.equal(resolveCharacterSprite(c,null,resources).source,'b.png');
  assert.equal(resolveCharacterSprite(c,'a',resources).source,'a.png');
  assert.equal(resolveCharacterSprite({...c,defaultSpriteId:'deleted'},null,resources).source,'a.png');
});

test('Загрузка после размещения, смена основного, название и Undo не теряют связь со сценой', () => {
  const p=createProject({title:'Sprite regression'});
  const scene=Object.values(p.scenes)[0];
  useProjectStore.setState({project:p,activeSceneId:scene.id,history:[],future:[]});
  const store=()=>useProjectStore.getState();
  store().addCharacter();
  const id=store().selectedCharacterId;
  store().addSceneCharacter(scene.id,id);
  store().addCharacterSprite(id,{id:'one',name:'Спокойный',source:'one.png'});
  store().addCharacterSprite(id,{id:'two',name:'Радость',source:'two.png'});
  store().updateCharacter(id,{defaultSpriteId:'two'});
  const saved=JSON.parse(JSON.stringify(store().project));
  const layer=saved.scenes[scene.id].characters[0];
  assert.equal(layer.spriteId,null);
  assert.equal(saved.characters[0].sprites[1].name,'Радость');
  assert.equal(resolveCharacterSprite(saved.characters[0],layer.spriteId).source,'two.png');
  store().undo();
  assert.equal(resolveCharacterSprite(store().project.characters[0],null).source,'one.png');
});

test('Изменить спрайт на основной сбрасывает предыдущее состояние в предпросмотре', () => {
  const p=createProject({title:'Preview'}),s=Object.values(p.scenes)[0];
  s.characters=[{characterId:'hero',spriteId:'old'}];
  s.actions=[{id:'change',type:'changeSprite',characterId:'hero',spriteId:null},{id:'text',type:'narration',text:'test'}];
  assert.equal(advancePreview(p,initialPreview(p,s.id)).layers[0].spriteId,null);
});

test('Собранная игра использует выбранный основной, а не портрет или первый спрайт', async () => {
  const p=createProject({title:'Sprite compile'}),s=Object.values(p.scenes)[0];
  const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aBZkAAAAASUVORK5CYII=';
  p.characters=[{id:'hero',name:'Герой',color:'#ffffff',portrait:png,defaultSpriteId:'happy',sprites:[{id:'sad',name:'Грусть',source:png},{id:'happy',name:'Радость',source:png}]}];
  s.characters=[{characterId:'hero',spriteId:null,x:50,y:100,scale:100,opacity:100,visible:true}];
  const dest=await fs.mkdtemp(path.join(os.tmpdir(),'istoriya-sprite-test-'));
  await compileProject(p,dest,{sdkPath:path.resolve('../renpy-8.5.3-sdk'),assetsRoot:path.resolve('public')});
  const script=await fs.readFile(path.join(dest,'game/script.rpy'),'utf8');
  assert.match(script,/show expression .*hero_happy/);
  assert.doesNotMatch(script,/show expression .*hero_portrait/);
});
