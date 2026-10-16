import {mediaGroups,mediaKind,mediaNode,mediaSignature,resourceMediaTarget} from './mediaReferences.js';
const kinds={image:'изображение',audio:'аудиозапись',font:'шрифт',video:'видео'};
export function authorMediaImports(project,request,ids){
 if(project.id!==request.projectId)throw Error('Открыт другой проект. Повторите загрузку файлов.');
 if(!Array.isArray(request.resources)||!request.resources.length)throw Error('Выберите файлы.');
 for(const r of request.resources)if(!['image','audio','font'].includes(mediaKind(r))||!r.source||!r.mime||!(r.size>0)||mediaKind(r)==='image'&&!(r.width>0&&r.height>0)||mediaKind(r)==='audio'&&!(r.duration>0))throw Error('Не удалось проверить один из файлов. Ничего не добавлено.');
 const result=[];for(const [i,r]of request.resources.entries()){const existing=project.resources.find(old=>old.source===r.source&&old.mime===r.mime);if(existing)result.push(existing.id);else{project.resources.push({...r,id:ids[i],importedAt:new Date().toISOString()});result.push(ids[i]);}}return result;
}
export function captureResourceRepair(project,resourceId){const target=resourceMediaTarget(project,resourceId);return {projectId:project.id,resourceId,source:target.source,signature:target.signature,kind:mediaKind(project.resources.find(r=>r.id===resourceId))};}
export function authorMediaRepairs(project,request){
 if(project.id!==request.projectId)throw Error('Открыт другой проект. Повторите выбор файлов.');
 if(!Array.isArray(request.entries)||!request.entries.length)throw Error('Выберите файлы для восстановления.');
 const groups=mediaGroups(project),seen=new Set(),plans=[];
 for(const entry of request.entries){
  if(seen.has(entry.source))throw Error('Один файл указан дважды.');seen.add(entry.source);
  const target=entry.resourceId?resourceMediaTarget(project,entry.resourceId):groups.find(g=>g.source===entry.source);
  if(!target||target.source!==entry.source||mediaSignature(target.refs)!==entry.signature)throw Error('Связи с файлом изменились. Повторите проверку и выбор файла.');
  const resource=entry.resource,kind=mediaKind(resource);
  if(!kind||typeof resource.source!=='string'||!resource.source||!resource.mime||!Number.isFinite(resource.size)||resource.size<=0)throw Error('Выберите проверенный непустой файл.');
  if(resource.source.startsWith('data:')&&!resource.source.startsWith(`data:${resource.mime};base64,`))throw Error('Формат файла не совпадает с его данными.');
  if(target.refs.some(ref=>!ref.kind||ref.kind!==kind))throw Error(`Для этой связи требуется ${kinds[target.refs[0].kind]??'другой тип файла'}, а не ${kinds[kind]}.`);
  if(kind==='image'&&!(resource.width>0&&resource.height>0))throw Error('Не удалось определить размер изображения.');
  if(kind==='audio'&&!(resource.duration>0))throw Error('Не удалось прочитать аудиозапись.');
  plans.push({refs:target.refs,resource,kind});
 }
 const now=new Date().toISOString();
 for(const {refs,resource,kind}of plans)for(const ref of refs){
  const parent=mediaNode(project,ref.path.slice(0,-1)),field=ref.path.at(-1);parent[field]=resource.source;
  if(ref.ownerRoot==='resources'||(ref.ownerRoot==='characters'&&field==='source')){
   for(const key of ['mime','fileName','size',...(kind==='image'?['width','height']:kind==='audio'?['duration','channels','sampleRate']:[])])if(resource[key]!=null)parent[key]=resource[key];
   parent.replacedAt=now;
  }
 }
 project.meta.mediaRevision=(Number.isSafeInteger(project.meta.mediaRevision)?project.meta.mediaRevision:0)+1;
 return plans.reduce((count,plan)=>count+plan.refs.length,0);
}
