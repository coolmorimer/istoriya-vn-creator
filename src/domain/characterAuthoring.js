import {materializeTimeline,roundTime} from '../../runtime/timeline-model.mjs';

const text=(value,label,max)=>{
 const result=String(value??'').trim();
 if(!result)throw Error(`Укажите ${label}.`);
 if(result.length>max)throw Error(`${label}: не больше ${max} символов.`);
 return result;
};

// One authoring transaction: no half-created hero/resource if validation fails.
export function authorCharacterForScene(project,input,ids) {
 const scene=project.scenes[input.sceneId];
 if(!scene)throw Error('Сцена больше не существует. Закройте форму и выберите сцену.');
 if(input.projectId&&input.projectId!==project.id)throw Error('Открыт другой проект. Закройте форму и повторите добавление.');
 const name=text(input.name,'имя персонажа',100),spriteName=text(input.spriteName??'Основной','название спрайта',100);
 const position=['left','center','right'].includes(input.position)?input.position:'center';
 const mode=input.placement??(scene.timelineEnabled?'scene':'step');
 if(!['step','scene','timeline'].includes(mode)||(mode==='step'&&scene.timelineEnabled)||(mode==='timeline'&&!scene.timelineEnabled))throw Error('Режим сцены изменился. Закройте форму и повторите добавление.');
 const existing=input.characterId?project.characters.find(c=>c.id===input.characterId):null;
 if(input.characterId&&!existing)throw Error('Персонаж больше не существует. Выберите его заново.');
 let resource=input.resourceId?project.resources.find(r=>r.id===input.resourceId):null;
 if(input.resourceId&&!resource)throw Error('Изображение удалено из ресурсов. Выберите другое.');
 if(!resource)resource={...input.resource,id:ids.resourceId,category:'sprite'};
 if(typeof resource.source!=='string'||!resource.source.trim())throw Error('Загрузите изображение персонажа.');
 if(resource.mime&&!['image/png','image/jpeg','image/webp'].includes(resource.mime))throw Error('Выберите PNG, WebP или JPEG.');
 if(!input.resourceId)project.resources.push(resource);
 const character=existing??{id:ids.characterId,internalName:ids.characterId,name,color:'#c79af2',portrait:null,sprites:[]};
 const spriteId=ids.spriteId;
 character.name=name;character.defaultPosition=position;
 character.sprites.push({id:spriteId,name:spriteName,resourceId:resource.id});
 character.defaultSpriteId=spriteId;
 if(!existing)project.characters.push(character);
 const transform={characterId:character.id,spriteId,x:position==='left'?25:position==='right'?75:50,y:100,scale:100,rotation:0,opacity:100,flip:false};
 let actionId=null,layerId=null;
 if(mode==='scene'){
  layerId=ids.layerId;scene.characters??=[];
  scene.characters.push({...transform,id:layerId,name,visible:true,locked:false});
 }else{
  actionId=ids.actionId;
  const action={...transform,id:actionId,type:'showCharacter',position,transition:'dissolve'};
  if(mode==='timeline'){
   materializeTimeline(scene);
   action.timeline={start:roundTime(Math.max(0,Number(input.time)||0)),duration:5,enabled:true};
   scene.actions.push(action);scene.actions.sort((a,b)=>a.timeline.start-b.timeline.start);
  }else{
   const index=scene.actions.findIndex(a=>a.id===input.afterId);
   if(index>=0)scene.actions.splice(index+1,0,action);else scene.actions.push(action);
  }
 }
 return {characterId:character.id,resourceId:resource.id,spriteId,actionId,layerId,placement:mode};
}
