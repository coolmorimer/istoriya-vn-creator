import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {createBrowserStorage} from '../src/platform/browserStorage.js';
import {createProject} from '../src/domain/projectFactory.js';
const key='istoriya-project-v2',draft='istoriya-project-recovery-v1';
test('large browser projects persist through async storage without localStorage quota',async()=>{
 const factory=new IDBFactory(),legacy={getItem:()=>null,setItem(){throw Error('quota');}},project=createProject();project.meta.description='x'.repeat(8*1024*1024);
 const storage=await createBrowserStorage({factory,legacy}),raw=JSON.stringify(project);storage.setItem(key,raw);await storage.flush();storage.close();
 const reopened=await createBrowserStorage({factory,legacy});assert.equal(reopened.getItem(key),raw);reopened.close();
});
test('legacy migration retains originals and does not resurrect a removed recovery draft',async()=>{
 const project=createProject(),factory=new IDBFactory(),map=new Map([[key,JSON.stringify(project)],[draft,JSON.stringify({project,savedAt:'2026-01-01'})]]),legacy={getItem:key=>map.get(key)};
 const storage=await createBrowserStorage({factory,legacy});storage.removeItem(draft);await storage.flush();storage.close();
 const reopened=await createBrowserStorage({factory,legacy});assert.equal(reopened.getItem(draft),null);assert.ok(map.has(draft));reopened.close();
});
test('corruption blocks writes without replacing the original',async()=>{
 const factory=new IDBFactory(),legacy={getItem:key=>key==='istoriya-project-v2'?'broken':null},storage=await createBrowserStorage({factory,legacy});
 assert.throws(()=>storage.getItem(key));assert.throws(()=>storage.setItem(key,'{}'));await assert.rejects(()=>storage.flush());storage.close();
});
test('a stale browser tab cannot overwrite another tab',async()=>{
 const factory=new IDBFactory(),legacy={getItem:()=>null},a=await createBrowserStorage({factory,legacy}),b=await createBrowserStorage({factory,legacy});
 const p=createProject();a.setItem(key,JSON.stringify(p));await a.flush();b.setItem(key,JSON.stringify({...p,meta:{...p.meta,title:'Stale'}}));await assert.rejects(()=>b.flush(),/другой вкладке/);
 a.close();b.close();const reopened=await createBrowserStorage({factory,legacy});assert.equal(JSON.parse(reopened.getItem(key)).meta.title,p.meta.title);reopened.close();
});
