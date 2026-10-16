import test from 'node:test';
import assert from 'node:assert/strict';
const cache=new Map(),writes=[];let flushes=0,fail=false;
globalThis.window={addEventListener(){},istoriya:{storage:{
 getItem:key=>cache.get(key)??null,setItem:(key,value)=>{writes.push(key);cache.set(key,value);},removeItem:key=>cache.delete(key),
 async flush(){flushes++;if(fail)throw Error('checkpoint failure');},
}}};
const {useProjectStore:store}=await import('../src/store/projectStore.js');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

test('typing is coalesced into a durable draft; explicit save removes it permanently',async()=>{
 for(let i=0;i<20;i++)store.getState().updateMeta({title:`Typing ${i}`});
 assert.equal(writes.filter(key=>key==='istoriya-project-recovery-v1').length,0);
 await wait(350);
 assert.equal(writes.filter(key=>key==='istoriya-project-recovery-v1').length,1);
 assert.equal(JSON.parse(cache.get('istoriya-project-recovery-v1')).project.meta.title,'Typing 19');
 assert.ok(flushes>0);
 assert.equal(await store.getState().saveNow(),true);
 assert.equal(cache.has('istoriya-project-recovery-v1'),false);
 await wait(350);assert.equal(cache.has('istoriya-project-recovery-v1'),false);
});

test('checkpoint failure is visible and a later save can recover',async()=>{
 fail=true;store.getState().updateMeta({title:'Still in memory'});
 await wait(350);
 assert.equal(store.getState().saveState,'error');assert.match(store.getState().saveError,/checkpoint failure/);
 assert.equal(store.getState().project.meta.title,'Still in memory');
 fail=false;assert.equal(await store.getState().saveNow(),true);
});

test('save before debounce captures edits without a stale checkpoint returning',async()=>{
 store.getState().updateMeta({title:'Save immediately'});
 assert.equal(await store.getState().saveNow(),true);
 await wait(350);
 assert.equal(cache.has('istoriya-project-recovery-v1'),false);
 assert.equal(JSON.parse(cache.get('istoriya-project-v2')).meta.title,'Save immediately');
});

test('history is capped, no-op is not an edit, and a new branch clears redo',async()=>{
 store.setState({past:[],future:[]});
 for(let i=0;i<65;i++)store.getState().updateMeta({title:`Edit ${i}`});
 assert.equal(store.getState().past.length,50);
 const same=store.getState().project;
 store.getState().updateMeta({title:'Edit 64'});assert.strictEqual(store.getState().project,same);
 for(let i=0;i<50;i++)store.getState().undo();
 assert.equal(store.getState().project.meta.title,'Edit 14');
 assert.equal(store.getState().future.length,50);
 store.getState().redo();assert.equal(store.getState().project.meta.title,'Edit 15');
 store.getState().updateMeta({title:'New branch'});assert.equal(store.getState().future.length,0);
 assert.equal(await store.getState().saveNow(),true);
});
