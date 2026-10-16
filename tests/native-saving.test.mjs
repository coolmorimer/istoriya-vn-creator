import test from 'node:test';
import assert from 'node:assert/strict';
const cache=new Map();let release,fail=false,block=false;const committed=[];
globalThis.window={addEventListener(){},istoriya:{storage:{
 getItem:key=>cache.get(key)??null,setItem:(key,value)=>cache.set(key,value),removeItem:key=>cache.delete(key),
 async flush(){if(fail)throw new Error('Ошибка Rust-хранилища');if(block){block=false;await new Promise(resolve=>{release=resolve;});}committed.push(cache.get('istoriya-project-v2'));},
}}};
const {useProjectStore:store}=await import('../src/store/projectStore.js');
test('Сохранение ждёт Rust и не теряет правку во время записи',async()=>{
 store.getState().updateMeta({title:'До записи'});block=true;
 const saving=store.getState().saveNow();await new Promise(setImmediate);
 assert.equal(store.getState().saveState,'saving');
 store.getState().updateMeta({title:'Правка во время записи'});release();
 assert.equal(await saving,true);assert.equal(store.getState().saveState,'saved');
 assert.equal(JSON.parse(committed.at(-1)).meta.title,'Правка во время записи');
});
test('Ошибка асинхронного native flush блокирует смену проекта и допускает повтор',async()=>{
 store.getState().updateMeta({title:'Ценная работа'});fail=true;
 try{await assert.rejects(()=>store.getState().newProject(),/Rust-хранилища/);assert.equal(store.getState().project.meta.title,'Ценная работа');assert.equal(store.getState().saveState,'error');}
 finally{fail=false;assert.equal(await store.getState().saveNow(),true);}
});
