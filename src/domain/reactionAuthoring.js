import {audioVolume} from '../../runtime/audio-model.mjs';
import {conditionProblems,effectProblems} from '../../runtime/game-logic.mjs';

export const REACTION_MODES=[['inspect','Осмотреть / ответить'],['take','Взять в инвентарь'],['use','Применить предмет'],['hide','Убрать со сцены']];
export const reactionMode=reaction=>reaction.inventory?.operation==='add'?'take':reaction.inventory?.operation==='remove'||typeof reaction.requiredItemId==='string'?'use':reaction.hideAfter?'hide':'inspect';

export function reactionRequiredItemPatch(reaction,itemId) {
 // Empty is an unfinished primary use requirement; null is an intentionally
 // absent optional/secondary requirement. Never turn use into a free click.
 return {requiredItemId:itemId||((reactionMode(reaction)==='use'&&!reaction.inventory)?'':null)};
}

export function reactionItemStatus(reaction,items=[]) {
 const inventory=reaction.inventory,primary=inventory?inventory.itemId:reaction.requiredItemId;
 const required=!!inventory||reactionMode(reaction)==='use';
 if(required&&!primary)return {problem:'Выберите предмет инвентаря. Это действие недоступно игроку, пока выбор не завершён.'};
 if(primary&&!items.some(item=>item.id===primary))return {problem:'Выбранный предмет удалён. Выберите другой предмет инвентаря.'};
 if(reaction.requiredItemId&&!items.some(item=>item.id===reaction.requiredItemId))return {problem:'Дополнительно требуемый предмет удалён. Выберите другой или явно уберите это требование.'};
 return {problem:null};
}

// A recipe writes the existing runtime fields, never parallel editor-only logic.
export function reactionModePatch(reaction,mode,{consume=false,itemId}={}) {
 if(!REACTION_MODES.some(([key])=>key===mode))throw Error('Выберите результат взаимодействия.');
 const chosen=itemId??reaction.inventory?.itemId??reaction.requiredItemId??null;
 return {inventory:mode==='take'?{operation:'add',itemId:chosen,quantity:1}:mode==='use'&&consume?{operation:'remove',itemId:chosen,quantity:1}:null,requiredItemId:mode==='use'&&!consume?chosen??'':null,hideAfter:['take','hide'].includes(mode),once:['take','hide'].includes(mode)};
}

export function reactionConsumptionPatch(reaction,consume) {
 const removing=reaction.inventory?.operation==='remove',primary=(removing?reaction.inventory.itemId:reaction.requiredItemId)??reaction.requiredItemId??'';
 if(consume)return {inventory:{operation:'remove',itemId:primary||null,quantity:removing?reaction.inventory.quantity??1:1},requiredItemId:removing&&reaction.requiredItemId&&reaction.requiredItemId!==primary?reaction.requiredItemId:null};
 // Switching consumption off must not erase a second required item or a
 // quantity gate from an imported reaction. Keep them as ordinary visual rules.
 const extra=[];
 if(reaction.requiredItemId&&reaction.requiredItemId!==primary)extra.push({itemId:reaction.requiredItemId,operator:'gte',value:1});
 if(removing&&Number(reaction.inventory.quantity)>1)extra.push({itemId:primary,operator:'gte',value:Number(reaction.inventory.quantity)});
 return {inventory:null,requiredItemId:primary,...(extra.length?{condition:{kind:'all',conditions:[...(reaction.condition?[reaction.condition]:[]),...extra]}}:{})};
}

export function captureReactionTarget(project,sceneId,layerId,afterId=null) {
 const scene=project.scenes[sceneId],layer=scene?.images?.find(l=>l.id===layerId);
 if(!layer)throw Error('Предмет больше не существует.');
 return {projectId:project.id,sceneId,layerId,resourceId:layer.resourceId,timed:!!scene.timelineEnabled,afterId};
}

export function authorPropReaction(project,input,ids) {
 if(project.id!==input.projectId)throw Error('Открыт другой проект. Повторите добавление реакции.');
 const scene=project.scenes[input.sceneId],layer=scene?.images?.find(l=>l.id===input.layerId);
 if(!layer||layer.resourceId!==input.resourceId||!!scene.timelineEnabled!==input.timed)throw Error('Предмет или сцена изменились. Откройте добавление реакции заново.');
 if(input.afterId&&!scene.actions.some(a=>a.id===input.afterId))throw Error('Выбранный кадр удалён. Откройте добавление реакции заново.');
 if(input.addExploration&&scene.timelineEnabled)throw Error('Осмотр доступен только в последовательных кадрах. Монтаж не изменён.');
 if(!REACTION_MODES.some(([key])=>key===input.mode))throw Error('Выберите результат взаимодействия.');
 const label=String(input.label??'').trim();if(!label)throw Error('Укажите название действия.');
 if(label.length>200)throw Error('Название действия должно быть не длиннее 200 символов.');
 if(input.speakerId&&!project.characters.some(c=>c.id===input.speakerId))throw Error('Персонаж больше не существует. Выберите говорящего заново.');
 if(input.targetSceneId&&!project.scenes[input.targetSceneId])throw Error('Сцена назначения больше не существует.');
 if(input.targetChapterId&&!project.chapters.some(c=>c.id===input.targetChapterId))throw Error('Глава назначения больше не существует.');
 if(input.targetSceneId&&input.targetChapterId)throw Error('Выберите одну сцену или одну главу назначения.');
 if(input.resultResourceId&&!project.resources.some(r=>r.id===input.resultResourceId&&r.source&&r.mime?.startsWith('image/')))throw Error('Изображение результата больше не доступно.');
 let item=null;
 if(['take','use'].includes(input.mode)) {
  if(input.newItem){
   const name=String(input.newItem.name??'').trim();if(!name||name.length>200)throw Error('Укажите название предмета инвентаря, не длиннее 200 символов.');
   const iconResourceId=Object.hasOwn(input.newItem,'iconResourceId')?input.newItem.iconResourceId:layer.resourceId;
   if(iconResourceId&&!project.resources.some(r=>r.id===iconResourceId&&r.source&&r.mime?.startsWith('image/')))throw Error('Выберите исправную иконку предмета.');
   item={id:ids.itemId,name,description:String(input.newItem.description??''),iconResourceId};
  }else item=project.items?.find(i=>i.id===input.itemId);
  if(!item)throw Error('Выберите предмет инвентаря или создайте новый здесь.');
 }
 const rulesProject=item&&input.newItem?{...project,items:[...(project.items??[]),item]}:project;
 const problems=[...conditionProblems(input.condition,rulesProject),...(input.effects??[]).flatMap(e=>effectProblems(e,rulesProject))];
 if(problems.length)throw Error(problems[0]);
 const quantity=Number(input.quantity??1);
 if(item&&(!Number.isSafeInteger(quantity)||quantity<1))throw Error('Количество должно быть целым числом от 1.');
 const recordings=[];
 const audio=kind=>{
  const existingId=input[`${kind}ResourceId`],upload=input[`${kind}Resource`];if(!existingId&&!upload)return null;
  let record=existingId?project.resources.find(r=>r.id===existingId):upload;
  if(!record?.source||!(record.mime?.startsWith('audio/')||existingId&&!record.mime&&['voice','sound','music','ambience'].includes(record.category)))throw Error('Запись недоступна. Выберите MP3, WAV или OGG заново.');
  if(!existingId){record=[...project.resources,...recordings].find(r=>r.source===record.source&&r.mime===record.mime)??{...record,id:ids[`${kind}ResourceId`],category:kind==='voice'?'voice':'sound'};if(!record.id)throw Error('Не удалось добавить запись. Повторите выбор файла.');if(!project.resources.some(r=>r.id===record.id)&&!recordings.some(r=>r.id===record.id))recordings.push(record);}
  return record.id;
 };
 const recipe=reactionModePatch({},input.mode,{consume:!!input.consume,itemId:item?.id});
 if(recipe.inventory)recipe.inventory.quantity=quantity;
 const reaction={id:ids.reactionId,label,text:String(input.text??''),speakerId:input.speakerId||null,...recipe,once:input.once??recipe.once,hideAfter:input.hideAfter??recipe.hideAfter,soundAssetId:audio('sound'),voiceAssetId:audio('voice'),soundVolume:audioVolume(input.soundVolume),voiceVolume:audioVolume(input.voiceVolume),resultResourceId:input.resultResourceId||null,targetSceneId:input.targetSceneId||null,targetChapterId:input.targetChapterId||null,condition:input.condition??null,effects:input.effects??[]};
 // All stale/reference/media validation above precedes the first mutation.
 if(item&&input.newItem){project.items??=[];project.items.push(item);}
 if(item&&input.mode==='take'&&!layer.itemId)layer.itemId=item.id;
 project.resources.push(...recordings);layer.interactions??=[];layer.interactions.push(reaction);
 let actionId=null;
 if(input.addExploration){
  const existing=scene.actions.find(a=>a.type==='explore');
  if(existing)actionId=existing.id;
  else {const index=scene.actions.findIndex(a=>a.id===input.afterId),terminal=['end','jump','choice','condition'].includes(scene.actions[index]?.type);actionId=ids.actionId;scene.actions.splice(index<0?scene.actions.length:index+(terminal?0:1),0,{id:actionId,type:'explore',prompt:'Осмотрите сцену',requiredItemId:null,requiredFlagId:null});}
 }
 return {reactionId:reaction.id,itemId:item?.id??null,actionId};
}
