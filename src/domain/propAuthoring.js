// Commit media, layer, first reaction and optional exploration as one edit.
// Validate the captured authoring target before touching project collections.
import {audioVolume} from '../../runtime/audio-model.mjs';
export function authorProp(project,input,ids) {
 if(project.id!==input.projectId)throw Error('Открыт другой проект. Повторите добавление предмета.');
 const scene=project.scenes[input.sceneId];
 if(!scene||!!scene.timelineEnabled!==input.timed)throw Error('Сцена изменилась. Повторите добавление предмета.');
 if(input.afterId&&!scene.actions.some(a=>a.id===input.afterId))throw Error('Выбранный кадр удалён. Повторите добавление предмета.');
 if(!['decoration','inspect','take'].includes(input.mode))throw Error('Выберите действие предмета.');
 if(input.mode!=='decoration'&&input.addExploration&&scene.timelineEnabled)throw Error('Осмотр доступен в последовательных кадрах. Монтаж не изменён.');
 const name=String(input.name??'').trim();if(!name)throw Error('Укажите название предмета.');
 let resource=input.resourceId?project.resources.find(r=>r.id===input.resourceId):input.resource;
 if(!resource?.source||typeof resource.source!=='string'||!['image/png','image/webp','image/jpeg'].includes(resource.mime))throw Error('Выберите исправное изображение PNG, WebP или JPEG.');
 if(!input.resourceId)resource=project.resources.find(r=>r.source===resource.source&&r.mime===resource.mime)??{...resource,id:ids.resourceId,category:'prop'};
 // Stage all attachments before mutating anything: failed/stale imports and Cancel
 // must never leave library records, inventory entries or half-created layers.
 const recordings=[];
 const recording=kind=>{
  const existingId=input[`${kind}ResourceId`],uploaded=input[`${kind}Resource`];
  if(!existingId&&!uploaded)return null;
  let audio=existingId?project.resources.find(r=>r.id===existingId):uploaded;
  const legacyAudio=existingId&&!audio?.mime&&['voice','sound','music','ambience'].includes(audio?.category);
  if(!audio?.source||!(audio.mime?.startsWith('audio/')||legacyAudio))throw Error('Аудиозапись недоступна. Выберите звук заново.');
  if(!existingId){
   audio=[...project.resources,...recordings].find(r=>r.source===audio.source&&r.mime===audio.mime)??{...audio,id:ids[`${kind}ResourceId`],category:kind==='voice'?'voice':'sound'};
   if(!audio.id)throw Error('Не удалось добавить запись. Повторите добавление предмета.');
   if(!project.resources.some(r=>r.id===audio.id)&&!recordings.some(r=>r.id===audio.id))recordings.push(audio);
  }
  return audio.id;
 };
 if(input.mode!=='decoration'&&input.speakerId&&!project.characters.some(c=>c.id===input.speakerId))throw Error('Персонаж больше не существует. Выберите говорящего заново.');
 const soundAssetId=input.mode==='decoration'?null:recording('sound'),voiceAssetId=input.mode==='decoration'?null:recording('voice');
 const resolution=project.meta.resolution,ratio=(Number(resource.width)>0&&Number(resource.height)>0)?resource.width/resource.height:1;
 const width=Math.min(35,45*resolution.height/resolution.width*ratio),height=width*resolution.width/resolution.height/ratio;
 const layer={id:ids.layerId,name,resourceId:resource.id,x:50,y:80,width,height,scale:100,rotation:0,opacity:100,visible:true,locked:false,zOrder:50+(scene.images?.length??0),interactions:[]};
 let item;
 if(input.mode!=='decoration'){
  const take=input.mode==='take';
  if(take){item={id:ids.itemId,name,description:'',iconResourceId:resource.id};layer.itemId=item.id;}
  layer.interactions.push({id:ids.reactionId,label:take?'Взять':'Осмотреть',text:String(input.text??''),speakerId:input.speakerId||null,once:take,hideAfter:take,voiceAssetId,soundAssetId,voiceVolume:audioVolume(input.voiceVolume),soundVolume:audioVolume(input.soundVolume),resultResourceId:null,requiredItemId:null,inventory:take?{operation:'add',itemId:item.id,quantity:1}:null,effects:[]});
 }
 let actionId=input.afterId??null,explore=scene.actions.find(a=>a.type==='explore');
 if(input.mode!=='decoration'&&input.addExploration){
  if(explore)actionId=explore.id;
  else{
   explore={id:ids.actionId,type:'explore',prompt:'Осмотрите сцену',requiredItemId:null,requiredFlagId:null};
   const index=scene.actions.findIndex(a=>a.id===input.afterId),terminal=['end','jump','choice','condition'].includes(scene.actions[index]?.type);
   scene.actions.splice(index<0?scene.actions.length:index+(terminal?0:1),0,explore);actionId=explore.id;
  }
 }
 if(!project.resources.some(r=>r.id===resource.id))project.resources.push(resource);
 project.resources.push(...recordings);
 if(item){project.items??=[];project.items.push(item);}
 scene.images??=[];scene.images.push(layer);
 return {layerId:layer.id,resourceId:resource.id,actionId};
}

export function addPropReaction(project,sceneId,layerId,id) {
 const layer=project.scenes[sceneId]?.images?.find(l=>l.id===layerId);
 if(!layer)throw Error('Предмет больше не существует.');
 layer.interactions??=[];
 const reaction={id,label:'Осмотреть',text:'',once:false,hideAfter:false,voiceAssetId:null,soundAssetId:null,resultResourceId:null,requiredItemId:null,inventory:null,effects:[]};
 layer.interactions.push(reaction);return reaction;
}
export function changePropReaction(project,sceneId,layerId,reactionId,patch,newItemId) {
 const layer=project.scenes[sceneId]?.images?.find(l=>l.id===layerId),reaction=layer?.interactions?.find(r=>r.id===reactionId);
 if(!reaction)throw Error('Реакция больше не существует.');
 if(patch.inventory?.operation==='add'&&!patch.inventory.itemId) {
  project.items??=[];
  let item=project.items.find(i=>i.id===layer.itemId);
  if(!item){item={id:newItemId,name:layer.name||'Предмет',description:'',iconResourceId:layer.resourceId};project.items.push(item);layer.itemId=item.id;}
  patch={...patch,inventory:{...patch.inventory,itemId:item.id}};
 }
 Object.assign(reaction,patch);
}
