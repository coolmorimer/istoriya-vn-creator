import {isAudioResource} from '../../runtime/audio-model.mjs';
export {isAudioResource};
// A broken reference is not the same author choice as “Без записи”.
export function audioAttachmentStatus(resources,value,draft) {
 const resource=draft?.resource??resources.find(record=>record.id===value);
 if(!resource&&!value)return {resource:null,problem:null};
 if(!resource)return {resource:null,problem:'Запись не найдена. Загрузите файл заново или выберите другую запись.'};
 if(!resource.source)return {resource,problem:'У записи нет файла. Восстановите его в разделе «Ресурсы» или выберите другую запись.'};
 if(!isAudioResource(resource))return {resource,problem:'Выбранный файл не является аудиозаписью. Выберите MP3, WAV или OGG.'};
 return {resource,problem:null};
}
export function authorAudioAttachment(project,request,resourceId) {
 if(request.projectId!==project.id)throw Error('Открыт другой проект. Выберите звук заново.');
 if(!['voiceAssetId','soundAssetId','assetId'].includes(request.field))throw Error('Неизвестный вид звука.');
 const scene=project.scenes[request.sceneId];
 const target=request.kind==='reaction'?scene?.images?.find(l=>l.id===request.layerId)?.interactions?.find(r=>r.id===request.reactionId):scene?.actions?.find(a=>a.id===request.actionId);
 if(!target)throw Error('Действие больше не существует. Выберите звук заново.');
 if(request.field==='assetId'&&(request.kind==='reaction'||!['music','sound','voice','ambience'].includes(target.type)))throw Error('Это действие не использует аудиофайл.');
 let resource=project.resources.find(r=>r.id===request.resourceId);
 if(request.resource) {
  if(!request.resource.mime?.startsWith('audio/')||!request.resource.source)throw Error('Нужен исправный аудиофайл.');
  resource=project.resources.find(r=>r.source===request.resource.source&&r.mime===request.resource.mime);
  if(!resource){resource={...request.resource,id:resourceId};project.resources.push(resource);}
 }
 if(request.resourceId||request.resource){if(!isAudioResource(resource))throw Error('Аудиоресурс недоступен.');}
 target[request.field]=resource?.id??null;return resource?.id??null;
}

export async function readAudioResource(file,{AudioContextClass=globalThis.AudioContext??globalThis.webkitAudioContext}={}) {
 const extension=file.name.split('.').at(-1).toLowerCase(),mime={mp3:'audio/mpeg',wav:'audio/wav',ogg:'audio/ogg'}[extension];
 if(!mime)throw Error('Выберите MP3, WAV или OGG.');
 if(!file.size)throw Error('Файл пустой. Выберите другую запись.');
 if(file.size>64*1024*1024)throw Error('Запись больше 64 МБ. Разделите её на реплики или используйте MP3/OGG.');
 if(!AudioContextClass)throw Error('Проверка аудио недоступна. Обновите WebView2 или браузер.');
 const bytes=await file.arrayBuffer(),context=new AudioContextClass();let audio;
 try{audio=await context.decodeAudioData(bytes.slice(0));}catch{throw Error('Не удалось прочитать звук. Пересохраните запись в MP3, WAV или OGG.');}finally{await context.close();}
 const source=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Не удалось прочитать файл.'));reader.readAsDataURL(new Blob([bytes],{type:mime}));});
 return {name:file.name.replace(/\.[^.]+$/,''),fileName:file.name,mime,size:file.size,duration:audio.duration,channels:audio.numberOfChannels,sampleRate:audio.sampleRate,source};
}
