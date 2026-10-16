import {ASSET_FIELDS} from '../../runtime/asset-fields.mjs';
const imageFields=new Set(['portrait','background','icon','cursor','dialogueBackground','mainMenuBackground','choiceButton','choiceButtonHover']);
export function mediaKind(resource={}){
 const mime=resource.mime??'';if(mime.startsWith('image/'))return 'image';if(mime.startsWith('audio/'))return 'audio';if(mime.startsWith('video/'))return 'video';if(mime.startsWith('font/'))return 'font';
 return ['voice','sound','music','ambience'].includes(resource.category)?'audio':resource.category==='font'?'font':resource.category==='video'?'video':['background','cg','sprite','prop','ui'].includes(resource.category)?'image':null;
}
export function mediaNode(project,path){let node=project;for(const key of path){node=typeof key==='object'?node?.find?.(entry=>entry.id===key.id):node?.[key];}return node;}
export function mediaFileName(source){try{const pathname=new URL(source).pathname;return decodeURIComponent(pathname.slice(pathname.lastIndexOf('/')+1));}catch{try{return decodeURIComponent(String(source).split(/[\\/]/).at(-1));}catch{return String(source).split(/[\\/]/).at(-1);}}}
export function mediaGroups(project){
 const groups=new Map(),usages=new Map();
 const visit=(value,path=[])=>{
  if(Array.isArray(value)){const ids=new Map();for(const entry of value)if(typeof entry?.id==='string')ids.set(entry.id,(ids.get(entry.id)??0)+1);value.forEach((entry,i)=>visit(entry,[...path,entry&&typeof entry.id==='string'&&ids.get(entry.id)===1?{id:entry.id}:i]));return;}
  if(!value||typeof value!=='object')return;
  for(const [field,source]of Object.entries(value)){
   const leaf=[...path,field];
   if(typeof source==='string'&&(field==='resourceId'||field==='assetId'||/(ResourceId|AssetId)$/.test(field))){const scene=path[0]==='scenes'?project.scenes[path[1]]:null,character=path[0]==='characters'?mediaNode(project,path.slice(0,2)):null,label=scene?`Сцена «${scene.title}» · ${value.name||value.label||value.type||field}`:character?`Персонаж «${character.name}» · ${value.name||field}`:path[0]==='items'?`Инвентарь · ${value.name||field}`:`Интерфейс / проект · ${field}`;if(!usages.has(source))usages.set(source,[]);usages.get(source).push(label);}
   if(ASSET_FIELDS.has(field)&&typeof source==='string'&&source){
    const root=path[0],character=root==='characters'?mediaNode(project,path.slice(0,2)):null,scene=root==='scenes'?project.scenes[path[1]]:null;
    const kind=imageFields.has(field)?'image':mediaKind(value)??(character?'image':mediaKind({category:value.type}));
    const resourceId=root==='resources'?value.id:field==='portrait'?value.portraitResourceId:field==='background'?value.backgroundResourceId:field==='source'?value.resourceId:value[`${field}ResourceId`];
    const label=root==='resources'?`Ресурс «${value.name||value.id}»`:character?(field==='portrait'?`Портрет «${character.name}»`:`Спрайт «${value.name||value.id||'Основной'}» · ${character.name}`):scene?(field==='background'?`Фон сцены «${scene.title}»`:`Сцена «${scene.title}» · ${value.name||field}`):root==='meta'?({icon:'Значок проекта',cursor:'Курсор проекта'}[field]??`Проект · ${field}`):`Интерфейс · ${{dialogueBackground:'окно диалога',mainMenuBackground:'главное меню',choiceButton:'кнопка выбора',choiceButtonHover:'наведение выбора'}[field]??field}`;
    const ref={key:JSON.stringify(leaf),path:leaf,kind,label,resourceId:resourceId??null,ownerRoot:root,fileName:value.fileName??null};
    if(!groups.has(source))groups.set(source,{source,refs:[],embedded:source.startsWith('data:')});groups.get(source).refs.push(ref);
   } else if(source&&typeof source==='object')visit(source,leaf);
  }
 };visit(project);
 return [...groups.values()].map(group=>({...group,id:group.refs[0].key,label:group.refs[0].label,usages:[...new Set(group.refs.flatMap(r=>[r.label,...(r.ownerRoot==='resources'?usages.get(r.resourceId)??[]:[])]))],names:[...new Set(group.refs.map(r=>r.fileName).filter(Boolean).concat(group.embedded?[]:[mediaFileName(group.source)]))],signature:mediaSignature(group.refs)}));
}
export function mediaSignature(refs){return JSON.stringify(refs.map(r=>[r.key,r.kind,r.resourceId]).sort((a,b)=>a[0].localeCompare(b[0])));}
export function resourceMediaTarget(project,resourceId){
 const resource=project.resources.find(r=>r.id===resourceId);if(!resource)throw Error('Ресурс больше не существует.');
 const group=mediaGroups(project).find(g=>g.source===resource.source);if(!group)throw Error('У ресурса нет файла.');
 const unique=project.resources.filter(r=>r.source===resource.source).length===1;
 const refs=group.refs.filter(r=>r.resourceId===resourceId||(unique&&!r.resourceId));
 return {source:group.source,signature:mediaSignature(refs),refs};
}
export function folderMediaCandidates(group,files){
 const names=new Set(group.names.map(name=>name.normalize('NFC').toLocaleLowerCase('ru')));
 return files instanceof Map?[...new Set([...names].flatMap(name=>files.get(name)??[]))]:Array.from(files??[]).filter(file=>names.has(file.name.normalize('NFC').toLocaleLowerCase('ru')));
}
export function indexMediaFolder(files){const index=new Map();for(const file of Array.from(files??[])){const name=file.name.normalize('NFC').toLocaleLowerCase('ru');if(!index.has(name))index.set(name,[]);index.get(name).push(file);}return index;}
