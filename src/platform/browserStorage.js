import {assertProjectShape} from '../../runtime/project-format.mjs';
const KEYS=['istoriya-project-v2','istoriya-project-library-v1','istoriya-project-recovery-v1'];
function validate(key,raw){const value=JSON.parse(raw);if(key===KEYS[0])assertProjectShape(value);if(key===KEYS[1]){if(!Array.isArray(value))throw Error('Повреждён список проектов');for(const project of value)assertProjectShape(project);}if(key===KEYS[2])assertProjectShape(value.project);}
export async function createBrowserStorage({factory=globalThis.indexedDB,legacy=globalThis.localStorage,name='istoriya-projects'}={}) {
 const cache=new Map(),pending=new Map();let blocked=null,queue=Promise.resolve(),db,migrated=false,revision=0;
 try {
  if(!factory)throw Error('Браузер не поддерживает IndexedDB. Откройте настольное приложение.');
  db=await new Promise((resolve,reject)=>{const request=factory.open(name,1);request.onupgradeneeded=()=>request.result.createObjectStore('values');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('Закройте другие вкладки редактора и повторите открытие.'));});
  db.onversionchange=()=>{blocked=Error('Хранилище обновлено в другой вкладке. Сохраните резервную копию и перезагрузите страницу.');db.close();};
  await new Promise((resolve,reject)=>{const tx=db.transaction('values','readonly'),store=tx.objectStore('values');for(const key of [...KEYS,'__legacy_imported','__revision']){const request=store.get(key);request.onsuccess=()=>{if(key==='__legacy_imported')migrated=!!request.result;else if(key==='__revision')revision=request.result??0;else if(request.result!=null)cache.set(key,request.result);};}tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);tx.onerror=()=>{};});
  if(!migrated)for(const key of KEYS)if(!cache.has(key)){const value=legacy?.getItem(key);if(value!=null){cache.set(key,value);pending.set(key,value);}}
  for(const [key,raw]of cache)validate(key,raw);
  if(!migrated){await new Promise((resolve,reject)=>{const tx=db.transaction('values','readwrite'),store=tx.objectStore('values');for(const [key,value]of pending)store.put(value,key);store.put(true,'__legacy_imported');tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);tx.onerror=()=>{};});pending.clear();}
 } catch(error){blocked=error instanceof Error?error:Error(String(error));}
 return {
  getItem(key){if(blocked)throw blocked;return cache.get(key)??null;},
  setItem(key,value){if(blocked)throw blocked;if(!KEYS.includes(key))throw Error('Неизвестный ключ проекта');cache.set(key,value);pending.set(key,value);},
  removeItem(key){if(blocked)throw blocked;cache.delete(key);pending.set(key,null);},
  flush(){const commit=async()=>{if(blocked)throw blocked;if(!pending.size)return;const batch=[...pending];for(const [key,value]of batch)if(value!=null)validate(key,value);await new Promise((resolve,reject)=>{const tx=db.transaction('values','readwrite'),store=tx.objectStore('values');let conflict=null;const check=store.get('__revision');check.onsuccess=()=>{if((check.result??0)!==revision){conflict=Error('Проект изменён в другой вкладке. Экспортируйте свою копию, затем перезагрузите редактор.');tx.abort();return;}for(const [key,value]of batch){if(value==null)store.delete(key);else store.put(value,key);}store.put(revision+1,'__revision');};tx.oncomplete=()=>{revision++;resolve();};tx.onabort=()=>reject(conflict??tx.error??Error('Не удалось сохранить проект в браузере. Экспортируйте резервную копию.'));tx.onerror=()=>{};});for(const [key,value]of batch)if(pending.get(key)===value)pending.delete(key);};queue=queue.catch(()=>{}).then(commit);return queue;},
  close(){db?.close();},
 };
}
