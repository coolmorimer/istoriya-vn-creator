import {uiResourceReferenceEntries} from '../../runtime/game-ui.mjs';

// One project traversal, not one traversal per resource card. The index is derived
// authoring data only; it never mutates the project or expands media bodies.
export function resourceUsageIndex(project){
 const result=new Map(),sources=new Map(),keys=new Map();
 for(const resource of project.resources??[]){result.set(resource.id,[]);keys.set(resource.id,new Set());if(resource.source){if(!sources.has(resource.source))sources.set(resource.source,[]);sources.get(resource.source).push(resource.id);}}
 const add=(ids,usage,key)=>{for(const id of new Set(ids)){if(!result.has(id)||keys.get(id).has(key))continue;keys.get(id).add(key);result.get(id).push({...usage,key});}};
 const linked=(id,source,usage,key)=>add(result.has(id)?[id]:sources.get(source)??[],usage,key);
 for(const scene of Object.values(project.scenes??{})){
  linked(scene.backgroundResourceId,scene.background,{kind:'scene',id:scene.id,background:true,label:`Фон сцены «${scene.title}»`},`scene:${scene.id}:background`);
  for(const [layerIndex,layer]of (scene.images??[]).entries()){
   add([layer.resourceId],{kind:'scene',id:scene.id,layerId:layer.id,label:`Слой «${layer.name||'Предмет'}» · ${scene.title}`},`scene:${scene.id}:layer:${layer.id}`);
   for(const [reactionIndex,reaction]of (layer.interactions??[]).entries())add([reaction.voiceAssetId,reaction.soundAssetId,reaction.resultResourceId],{kind:'scene',id:scene.id,layerId:layer.id,...(reaction.id?{reactionId:reaction.id}:{reactionIndex}),label:`Реакция «${reaction.label||'Действие'}» · ${layer.name||'Предмет'} · ${scene.title}`},`scene:${scene.id}:reaction:${layerIndex}:${reactionIndex}`);
  }
  for(const [actionIndex,action] of (scene.actions??[]).entries()){
   const text=String(action.text??action.prompt??'').replace(/\s+/g,' ').slice(0,70);
   add([action.assetId,action.voiceAssetId,action.soundAssetId],{kind:'scene',id:scene.id,actionId:action.id,label:`Шаг ${actionIndex+1} · ${scene.title}${text?` · ${text}`:''}`},`scene:${scene.id}:action:${action.id}`);
   add([action.textStyle?.font],{kind:'scene',id:scene.id,actionId:action.id,label:`Шрифт реплики · ${scene.title}`},`scene:${scene.id}:action:${action.id}:font`);
  }
 }
 for(const character of project.characters??[]){
  linked(character.portraitResourceId,character.portrait,{kind:'character',id:character.id,label:`Портрет «${character.name}»`},`character:${character.id}:portrait`);
  for(const sprite of character.sprites??[])linked(sprite.resourceId,sprite.source,{kind:'character',id:character.id,spriteId:sprite.id,label:`Спрайт «${sprite.name||'Основной'}» · ${character.name}`},`character:${character.id}:sprite:${sprite.id}`);
 }
 for(const item of project.items??[])add([item.iconResourceId],{kind:'inventory',id:item.id,label:`Иконка инвентаря «${item.name}»`},`inventory:${item.id}`);
 for(const section of project.gallery?.sections??[])for(const [i,item]of (section.items??[]).entries())add([item.resourceId],{kind:'gallery',id:section.id,...(item.id?{itemId:item.id}:{itemIndex:i}),label:`Галерея «${section.title}» · ${item.title||'Изображение'}`},`gallery:${section.id}:${item.id??i}`);
 for(const {resourceId,usage}of uiResourceReferenceEntries(project))add([resourceId],usage,`interface:${usage.id}`);
 const legacy=[['dialogueBackground','dialogue','window','Окно диалога','dialogue:window:resourceId'],['mainMenuBackground','menu','screen','Главное меню','menu:screen:resourceId'],['choiceButton','choice','screen','Кнопка выбора','choice:button:idleResourceId'],['choiceButtonHover','choice','screen','Наведение кнопки выбора','choice:button:hoverResourceId']];
 for(const [field,screen,target,label,id]of legacy)linked(project.ui?.[`${field}ResourceId`],project.ui?.[field],{kind:'interface',screen,target,id,label},`interface:${id}`);
 for(const [field,label]of [['icon','Значок игры'],['cursor','Курсор игры']])linked(project.meta?.[`${field}ResourceId`],project.meta?.[field],{kind:'project',id:field,label},`project:${field}`);
 return result;
}

export function filterResources(resources,category='all',query=''){
 const needle=query.trim().normalize('NFC').toLocaleLowerCase('ru');
 return resources.filter(resource=>(category==='all'||resource.category===category)&&(!needle||[resource.name,resource.fileName].some(value=>String(value??'').normalize('NFC').toLocaleLowerCase('ru').includes(needle))));
}
