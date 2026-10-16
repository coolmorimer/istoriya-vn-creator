import {nativeError} from './nativeError.js';
export async function createNativeStorage(call,media) {
 const cache=new Map(),pending=new Map();let loadError=null,queue=Promise.resolve();
 const transform=(raw,method,key)=>{if(raw==null)return raw;let value;try{value=JSON.parse(raw);}catch(error){if(key==='istoriya-project-recovery-v1')return raw;throw error;}return JSON.stringify(media[method](value));};
 try{for(const [key,value]of Object.entries(await call('load')))cache.set(key,transform(value,'toRenderer',key));}
 catch(error){loadError=nativeError(error);}
 return {
  getItem(key){if(loadError)throw loadError;return cache.get(key)??null;},
  setItem(key,value){if(loadError)throw loadError;cache.set(key,value);pending.set(key,value);},
  removeItem(key){if(loadError)throw loadError;cache.delete(key);pending.set(key,null);},
  flush(){
   const flush=async()=>{
    if(loadError)throw loadError;if(!pending.size)return;
    const snapshot=Object.fromEntries(pending),batch=Object.fromEntries(Object.entries(snapshot).map(([key,raw])=>[key,transform(raw,'toNative',key)]));
    await call('flush',batch);
    // Compare the original renderer snapshot, not its transformed native batch.
    for(const [key,raw]of Object.entries(snapshot))if(pending.get(key)===raw)pending.delete(key);
   };
   queue=queue.catch(()=>{}).then(flush);return queue;
  },
 };
}
