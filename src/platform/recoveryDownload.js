import {recoveryProject} from './recoveryExport.js';
export function downloadJsonCopy(value,name='istoriya-recovery.vnproject'){
 const text=typeof value==='string'?value:JSON.stringify(value,null,2),url=URL.createObjectURL(new Blob([text],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export async function saveRecoveryCopy(project,desktop,{referencesOnly=false}={},download=downloadJsonCopy){
 if(desktop?.saveRecoveryProject)return desktop.saveRecoveryProject(project,{referencesOnly});
 if(desktop?.saveProject){if(referencesOnly)throw Error('Копия со ссылками доступна в Rust-версии или браузере.');return desktop.saveProject(await recoveryProject(project,desktop));}
 const copy=await recoveryProject(project,desktop,{referencesOnly});download(copy);return {canceled:false,browser:true};
}
export async function saveRawRecovery(raw,desktop,download=downloadJsonCopy){
 if(desktop?.saveRecoveryRaw)return desktop.saveRecoveryRaw(raw);
 download(raw,'istoriya-draft-original.json');return {canceled:false,browser:true};
}
