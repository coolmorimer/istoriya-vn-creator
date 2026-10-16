// Separate database: test playthroughs must never become authoring projects or
// exported Ren'Py saves. A slot write uses optimistic concurrency, not last-wins.
export async function createPreviewStorage({factory=globalThis.indexedDB,name='istoriya-preview-v1'}={}){
 if(!factory)throw Error('Тестовые сохранения недоступны: нет IndexedDB. Используйте отдельное окно игры.');
 const db=await new Promise((resolve,reject)=>{const r=factory.open(name,1);r.onupgradeneeded=()=>r.result.createObjectStore('values');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Закройте другие окна предпросмотра и повторите открытие.'));});
 let closed=false;db.onversionchange=()=>{closed=true;db.close();};
 const key=(projectId,slot)=>{if(typeof projectId!=='string'||!projectId||!Number.isInteger(slot)||slot<1||slot>6)throw Error('Неизвестный тестовый слот.');return JSON.stringify([projectId,slot]);};
 const read=id=>new Promise((resolve,reject)=>{if(closed){reject(Error('Хранилище теста закрыто. Откройте предпросмотр заново.'));return;}const tx=db.transaction('values'),r=tx.objectStore('values').get(id);let value;r.onsuccess=()=>{value=r.result??null;};tx.oncomplete=()=>resolve(value);tx.onabort=()=>reject(tx.error);tx.onerror=()=>{};});
 const write=(id,value,expected,check)=>new Promise((resolve,reject)=>{if(closed){reject(Error('Хранилище теста закрыто. Откройте предпросмотр заново.'));return;}const tx=db.transaction('values','readwrite'),store=tx.objectStore('values'),r=store.get(id);let conflict;r.onsuccess=()=>{if(check&&(r.result?.id??null)!==expected){conflict=Error('Слот изменён в другом окне. Закройте и снова откройте меню сохранений.');tx.abort();return;}if(value===null)store.delete(id);else store.put(value,id);};tx.oncomplete=()=>resolve(value);tx.onabort=()=>reject(conflict??tx.error??Error('Не удалось записать тестовое сохранение.'));tx.onerror=()=>{};});
 return {
  list:projectId=>Promise.all(Array.from({length:6},(_,i)=>read(key(projectId,i+1)))),
  async save(projectId,slot,value,expected=null){if(value?.projectId!==projectId||value?.version!==1)throw Error('Некорректное тестовое сохранение.');const record={...value,id:crypto.randomUUID(),savedAt:new Date().toISOString()};return write(key(projectId,slot),record,expected,true);},
  remove:(projectId,slot,expected)=>write(key(projectId,slot),null,expected,true),
  preferences:projectId=>read(JSON.stringify([projectId,'preferences'])),
  setPreferences:(projectId,value)=>write(JSON.stringify([projectId,'preferences']),value,null,false),
  close(){closed=true;db.close();},
 };
}
