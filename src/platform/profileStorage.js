import {nativeError} from './nativeError.js';
const LIMIT=64*1024*1024;
const layoutKey=key=>key==='istoriya-workspace-v1'||key.startsWith('istoriya-tree-v1:');
const receiptKey=id=>`istoriya-profile-import-v1:${id}`;
const databaseReceipt=id=>JSON.stringify(['__profile-import__',id]);
function internalReceipt(row){try{const key=JSON.parse(row[0]);return Array.isArray(key)&&key[0]==='__profile-import__'&&typeof key[1]==='string'&&row[1]?.version===1&&row[1]?.applied===true;}catch{return false;}}
function validateSnapshot(snapshot){
 if(snapshot?.version!==1||!Array.isArray(snapshot.localStorage)||!Array.isArray(snapshot.preview))throw Error('Файл настроек профиля повреждён. Старые данные не удалены.');
 for(const row of snapshot.localStorage)if(!Array.isArray(row)||row.length!==2||typeof row[0]!=='string'||!layoutKey(row[0])||typeof row[1]!=='string')throw Error('Неподдерживаемая настройка редактора.');
 const keys=new Set();for(const row of snapshot.preview){if(!Array.isArray(row)||row.length!==2||typeof row[0]!=='string'||keys.has(row[0]))throw Error('Повреждены тестовые сохранения.');keys.add(row[0]);let key;try{key=JSON.parse(row[0]);}catch{throw Error('Неизвестный тестовый слот.');}if(!Array.isArray(key)||key.length!==2||typeof key[0]!=='string'||!key[0]||!(key[1]==='preferences'||Number.isInteger(key[1])&&key[1]>=1&&key[1]<=6)||!row[1]||typeof row[1]!=='object')throw Error('Неизвестный тестовый слот.');if(key[1]!=='preferences'&&(row[1].version!==1||row[1].projectId!==key[0]))throw Error('Тестовое сохранение относится к другому проекту.');}
 if(new TextEncoder().encode(JSON.stringify(snapshot)).byteLength>LIMIT)throw Error('Настройки и тестовые сохранения больше64 МБ. Перенос не начат; исходный профиль сохранён.');return snapshot;
}
function open(factory,name){if(!factory)throw Error('Не удалось открыть тестовые сохранения. Можно повторить перенос или явно оставить настройки в старом профиле.');return new Promise((resolve,reject)=>{let settled=false;const request=factory.open(name,1);request.onupgradeneeded=()=>request.result.createObjectStore('values');request.onerror=()=>{settled=true;reject(request.error);};request.onblocked=()=>{settled=true;reject(Error('Закройте другие окна предпросмотра и повторите перенос.'));};request.onsuccess=()=>{if(settled)request.result.close();else{settled=true;resolve(request.result);}};});}
export async function exportProfileUi({factory=globalThis.indexedDB,storage=globalThis.localStorage,name='istoriya-preview-v1',includeUi=true}={}){
 if(!includeUi)return {version:1,localStorage:[],preview:[],omitted:true};
 const local=[];try{for(let n=0;n<storage.length;n++){const key=storage.key(n);if(layoutKey(key))local.push([key,storage.getItem(key)]);}}catch{throw Error('Не удалось прочитать компоновку редактора. Исходные настройки не изменены.');}
 const db=await open(factory,name);try{const preview=await new Promise((resolve,reject)=>{const tx=db.transaction('values','readonly'),store=tx.objectStore('values'),keys=store.getAllKeys(),values=store.getAll();tx.oncomplete=()=>resolve(keys.result.map((key,n)=>[key,values.result[n]]).filter(row=>!internalReceipt(row)));tx.onabort=()=>reject(tx.error??Error('Не удалось прочитать тестовые сохранения.'));tx.onerror=()=>{};});return validateSnapshot({version:1,localStorage:local,preview});}finally{db.close();}
}
export async function importProfileUi(id,snapshot,{factory=globalThis.indexedDB,storage=globalThis.localStorage,name='istoriya-preview-v1'}={}){
 if(typeof id!=='string'||!id||id.length>200)throw Error('Нет идентификатора переносимого профиля.');validateSnapshot(snapshot);
 if(storage.getItem(receiptKey(id))==='applied')return {applied:true,alreadyApplied:true};
 const db=await open(factory,name);try{await new Promise((resolve,reject)=>{const tx=db.transaction('values','readwrite'),store=tx.objectStore('values'),receipt=store.get(databaseReceipt(id));let conflict;receipt.onsuccess=()=>{if(receipt.result?.version===1&&receipt.result?.applied===true)return;const count=store.count();count.onsuccess=()=>{if(count.result){conflict=Error('В новом профиле уже есть тестовые сохранения. Они не перезаписаны.');tx.abort();return;}for(const [key,value]of snapshot.preview)store.put(value,key);store.put({version:1,applied:true},databaseReceipt(id));};};tx.oncomplete=resolve;tx.onabort=()=>reject(conflict??tx.error??Error('Не удалось перенести тестовые сохранения.'));tx.onerror=()=>{};});
  const previous=[];try{for(const [key,value]of snapshot.localStorage){previous.push([key,storage.getItem(key)]);storage.setItem(key,value);}storage.setItem(receiptKey(id),'applied');}catch(error){for(const [key,value]of previous.reverse())try{if(value==null)storage.removeItem(key);else storage.setItem(key,value);}catch{/* Original profile and the DB receipt remain available for retry. */}throw nativeError(error);}return {applied:true};
 }finally{db.close();}
}
export function createProfileService(call,{capture=exportProfileUi,restore=importProfileUi,prepare=async()=>{}}={}){
 const request=async(op,payload=null)=>{try{return await call(op,payload);}catch(error){throw nativeError(error);}};
 return {status:()=>request('profile-status'),async choose(){await prepare();return request('profile-choose');},async start(planId,{includeUi=true}={}){await prepare();let ui;try{ui=await capture({includeUi});}catch(error){const result=nativeError(error);result.uiTransferFailed=true;throw result;}return request('profile-start',{planId,ui});},cancel:()=>request('profile-cancel'),rollback:async()=>{await prepare();return request('profile-rollback');},restart:()=>request('profile-restart'),async restoreUi(){const pending=await request('profile-ui-state');if(!pending)return;await restore(pending.id,pending.snapshot);const result=await request('profile-ui-ack',{id:pending.id});if(result?.applied!==true)throw Error('Перенос настроек не подтверждён. Исходные данные сохранены.');}};
}
export async function prepareProfileTransfer(){
 const {useProjectStore}=await import('../store/projectStore.js');let state=useProjectStore.getState();if(state.recovery)throw Error('Сначала восстановите или отклоните найденный черновик.');await state.waitForPendingWrites();state=useProjectStore.getState();if(state.saveState!=='saved'&&!await state.saveNow())throw Error('Не удалось сохранить проект. Сделайте резервную копию и исправьте ошибку перед переносом.');await useProjectStore.getState().waitForPendingWrites();
}
export function openProfileStorage(){globalThis.window?.dispatchEvent(new Event('istoriya-open-profile-storage'));}
