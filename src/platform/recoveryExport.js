import {ASSET_FIELDS} from '../../runtime/asset-fields.mjs';
export async function recoveryProject(project,desktop,{referencesOnly=false}={}) {
 if(!referencesOnly&&desktop?.portableProject)return desktop.portableProject(project);
 const copy=desktop?.projectFileReferences?desktop.projectFileReferences(project):project;
 const inspect=(value,field='')=>{
  if(Array.isArray(value))value.forEach(v=>inspect(v));
  else if(value&&typeof value==='object')Object.entries(value).forEach(([key,v])=>inspect(v,key));
  else if(ASSET_FIELDS.has(field)&&typeof value==='string'&&/^(?:https?:\/\/asset\.localhost\/|asset:\/\/)/.test(value))throw Error('Не удалось восстановить ссылку на ресурс. Не закрывайте редактор; повторите резервное копирование.');
 };inspect(copy);return copy;
}
