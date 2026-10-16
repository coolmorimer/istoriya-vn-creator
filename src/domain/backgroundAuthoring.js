import {storyboardFrames} from './storyboard.js';
import {timelineFrame} from './timeline.js';
import {backgroundTransform,backgroundSource} from '../../runtime/background-transform.mjs';
import {materializeTimeline,roundTime} from '../../runtime/timeline-model.mjs';

export function backgroundTarget(project,sceneId,actionId,time=0) {
 const scene=project.scenes[sceneId];if(!scene)throw Error('Сцена больше не существует.');
 const frame=scene.timelineEnabled?timelineFrame(project,scene,time):storyboardFrames(project,scene).find(item=>item.action.id===actionId)?.frame;
 const resourceId=frame?.backgroundActionId?scene.actions.find(a=>a.id===frame.backgroundActionId)?.assetId:scene.backgroundResourceId;
 return {projectId:project.id,sceneId,afterId:actionId??null,targetActionId:frame?.backgroundActionId??null,currentResourceId:resourceId??null,timed:!!scene.timelineEnabled,time,hasBackground:!!(frame?frame.background:backgroundSource(project,scene)),transform:backgroundTransform(frame?.backgroundTransform??scene.backgroundTransform)};
}
export function authorBackground(project,input,ids) {
 if(project.id!==input.projectId)throw Error('Открыт другой проект. Закройте форму и повторите выбор фона.');
 const scene=project.scenes[input.sceneId];if(!scene||!!scene.timelineEnabled!==input.timed)throw Error('Сцена изменилась. Закройте форму и повторите выбор фона.');
 if(!['current','insert'].includes(input.mode))throw Error('Выберите способ применения фона.');
 const target=input.targetActionId?scene.actions.find(a=>a.id===input.targetActionId&&a.type==='background'):null;
 if(input.mode==='current'&&input.targetActionId&&!target)throw Error('Шаг с фоном удалён. Выберите текущий кадр заново.');
 if(input.afterId&&!scene.actions.some(a=>a.id===input.afterId))throw Error('Выбранный кадр удалён. Повторите добавление фона.');
 let resource=input.resourceId?project.resources.find(r=>r.id===input.resourceId):null;
 if(input.resourceId&&!resource)throw Error('Изображение удалено из ресурсов. Выберите его заново.');
 if(!resource){resource={...input.resource,id:ids.resourceId,category:'background'};}
 if(typeof resource.source!=='string'||!resource.source.trim())throw Error('Загрузите изображение или выберите ресурс.');
 if(resource.mime&&!['image/png','image/jpeg','image/webp'].includes(resource.mime))throw Error('Выберите PNG, WebP или JPEG.');
 const transform=backgroundTransform({...(input.mode==='current'?input.transform:{}),fit:input.fit??'cover'});
 if(!input.resourceId)project.resources.push(resource);
 let actionId=input.afterId;
 if(input.mode==='current'){
  if(target)Object.assign(target,{assetId:resource.id,assetName:resource.name,backgroundTransform:transform});
  else Object.assign(scene,{background:null,backgroundResourceId:resource.id,backgroundTransform:transform});
 }else{
  actionId=ids.actionId;
  const action={id:actionId,type:'background',assetId:resource.id,assetName:resource.name,backgroundTransform:transform,transition:['none','dissolve','fade'].includes(input.transition)?input.transition:'dissolve',preserveCharacters:input.preserveCharacters!==false};
  if(scene.timelineEnabled){materializeTimeline(scene);action.timeline={start:roundTime(Math.max(0,Number(input.time)||0)),duration:Math.max(.1,Math.min(3600,Number(input.duration)||5)),enabled:true};scene.actions.push(action);scene.actions.sort((a,b)=>a.timeline.start-b.timeline.start);}
  else{const index=scene.actions.findIndex(a=>a.id===input.afterId);scene.actions.splice(index>=0?index+1:scene.actions.length,0,action);}
 }
 return {resourceId:resource.id,actionId,mode:input.mode};
}
