import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createDiskStorage,portableProject,writeFolderProject,readFolderProject} from '../electron/project-storage.mjs';
import {createProject} from '../src/domain/projectFactory.js';
import {validateProject} from '../src/domain/validator.js';
const memory=new Map();let fail=false;
globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>{if(fail)throw new Error('Диск заполнен');memory.set(k,v);},removeItem:k=>memory.delete(k)};
const {useProjectStore:store,normalizeProject}=await import('../src/store/projectStore.js');

test('Ошибка записи отменяет новый проект, открытие и импорт, сохраняя изменения',async()=>{
  const p=await store.getState().newProject({title:'Ценный проект'});
  store.getState().updateMeta({title:'Несохранённая работа'});fail=true;
  try { for(const action of [()=>store.getState().newProject(),()=>store.getState().openProject(p.id),()=>store.getState().importProject(createProject())]) {
    await assert.rejects(action,/Диск заполнен/);assert.equal(store.getState().project.meta.title,'Несохранённая работа');
  } } finally {fail=false;await store.getState().saveNow();}
});
test('Повреждённая библиотека не перезаписывается пустой',async()=>{
  const before=memory.get('istoriya-project-v2'),library=memory.get('istoriya-project-library-v1');
  memory.set('istoriya-project-library-v1','{broken');
  store.getState().updateMeta({title:'Новое название'});
  assert.equal(await store.getState().saveNow(),false);
  assert.equal(memory.get('istoriya-project-v2'),before);assert.equal(memory.get('istoriya-project-library-v1'),'{broken');
  memory.set('istoriya-project-library-v1',library);await store.getState().saveNow();
});
test('Повреждённый JSON восстанавливается из предыдущей версии, удалённый черновик не возвращается',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'istoriya-backup-')),disk=createDiskStorage(dir),key='istoriya-project-recovery-v1';
  disk.setItem(key,JSON.stringify({version:1}));disk.setItem(key,JSON.stringify({version:2}));
  fs.writeFileSync(path.join(dir,key+'.json'),'{broken');
  assert.equal(JSON.parse(disk.getItem(key)).version,1);
  disk.removeItem(key);assert.equal(disk.getItem(key),null);
});
test('Текст реплики с file: или data: не читается как файл и не изменяется',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'istoriya-literal-')),p=createProject(),s=Object.values(p.scenes)[0];
  s.actions=[{id:'a',type:'narration',text:'file:///private/secret.txt'},{id:'b',type:'narration',text:'data:image/png;base64,AQID'}];
  assert.deepEqual(portableProject(p,dir),p);
  const file=path.join(dir,'project.vnproject');writeFolderProject(p,file,dir);
  assert.deepEqual(readFolderProject(file).scenes[s.id].actions,s.actions);
});
test('Повреждённые структуры и более новые версии отвергаются до смены проекта',()=>{
  for(const p of [{scenes:{x:null}},{scenes:{x:{actions:[null]}}},{scenes:{},characters:[null]},{scenes:{},meta:{title:5}},{scenes:{},schemaVersion:999}]) {
    assert.throws(()=>normalizeProject(p));assert.equal(validateProject(p).valid,false);
  }
});
