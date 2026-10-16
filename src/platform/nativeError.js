export function nativeError(value) {
 if(value instanceof Error)return value;
 const message=typeof value==='string'?value:typeof value?.message==='string'?value.message:'';
 return new Error(message.trim()||'Не удалось выполнить операцию. Повторите попытку.');
}
export function createNativeCaller(invoke) {
 return async(operation,payload=null)=>{
  try{return await invoke('desktop',{operation,payload});}
  catch(error){throw nativeError(error);}
 };
}
