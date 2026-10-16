import {timelineClips} from '../../runtime/timeline-model.mjs';
import {chapterEntry} from '../../runtime/story-routing.mjs';
const own=(map,id)=>id!=null&&Object.hasOwn(map??{},id)?map[id]:null;
export const editorLocationKey=location=>JSON.stringify([location.kind,location.id,location.actionId??null,location.layerId??null,location.reactionId??null,location.reactionIndex??null,location.spriteId??null,location.itemId??null,location.itemIndex??null,location.screen??null,location.target??null]);
export function editorNavigation(project,location) {
 if(location.projectId&&location.projectId!==project.id)throw Error('Открыт другой проект. Повторите поиск.');
 const target={...location,projectId:project.id},base={navigationTarget:target};
 if(location.kind==='scene'){
  const scene=own(project.scenes,location.id);if(!scene)throw Error('Сцена больше не существует. Повторите поиск.');
  const layer=location.layerId?scene.images?.find(l=>l.id===location.layerId):null;
  if(location.layerId&&!layer)throw Error('Предмет больше не существует. Повторите поиск.');
  const reaction=location.reactionId?layer?.interactions?.find(r=>r.id===location.reactionId):location.reactionIndex!=null?layer?.interactions?.[location.reactionIndex]:null;
  if((location.reactionId||location.reactionIndex!=null)&&!reaction)throw Error('Реакция больше не существует. Повторите поиск.');
  const action=location.actionId?scene.actions.find(a=>a.id===location.actionId):null;
  if(location.actionId&&!action)throw Error('Шаг больше не существует. Повторите поиск.');
  const selected=action??(layer?scene.actions.find(a=>a.type==='explore'):location.background?null:scene.actions[0])??null;
  const clip=scene.timelineEnabled&&selected?timelineClips(scene).find(c=>c.action.id===selected.id):null;
  return {...base,activeSection:'scenes',activeSceneId:scene.id,activeActionId:selected?.id??null,activeLayerId:layer?.id??(location.background?'__background':null),inspectorTab:'properties',bottomTab:scene.timelineEnabled?'timeline':'scenario',timelineTime:clip?.start??0,navigationTarget:{...target,focusKind:reaction?'reaction':layer?'layer':location.background?'background':selected?'action':'scene',focusId:reaction?.id??(reaction?`index:${location.reactionIndex}`:layer?.id??(location.background?'__background':selected?.id??scene.id))}};
 }
 if(location.kind==='character'){
  const hero=project.characters.find(c=>c.id===location.id);if(!hero)throw Error('Персонаж больше не существует.');if(location.spriteId&&!hero.sprites.some(s=>s.id===location.spriteId))throw Error('Спрайт больше не существует.');
  return {...base,activeSection:'characters',selectedCharacterId:hero.id,navigationTarget:{...target,focusKind:location.spriteId?'sprite':'character',focusId:location.spriteId??hero.id}};
 }
 if(location.kind==='resource'){if(!project.resources.some(r=>r.id===location.id))throw Error('Ресурс больше не существует.');return {...base,activeSection:'resources',selectedResourceId:location.id,navigationTarget:{...target,focusKind:'resource',focusId:location.id}};}
 if(location.kind==='inventory'){if(!project.items?.some(i=>i.id===location.id))throw Error('Предмет инвентаря больше не существует.');return {...base,activeSection:'story',logicTab:'inventory',selectedInventoryId:location.id,navigationTarget:{...target,focusKind:'inventory',focusId:location.id}};}
 if(location.kind==='gallery'){
  const section=project.gallery?.sections.find(s=>s.id===location.id);if(!section)throw Error('Раздел галереи больше не существует.');const item=location.itemId?section.items.find(i=>i.id===location.itemId):location.itemIndex!=null?section.items[location.itemIndex]:null;if((location.itemId||location.itemIndex!=null)&&!item)throw Error('Изображение галереи больше не существует.');
  return {...base,activeSection:'gallery',navigationTarget:{...target,focusKind:'gallery',focusId:item?.id??(item?`index:${location.itemIndex}`:section.id)}};
 }
 if(location.kind==='chapter'){const chapter=project.chapters.find(c=>c.id===location.id);if(!chapter)throw Error('Глава больше не существует.');const entry=chapterEntry(project,chapter.id);return {...base,activeSection:'story',logicTab:'map',...(own(project.scenes,entry)?{activeSceneId:entry}:{}),navigationTarget:{...target,focusKind:'chapter',focusId:chapter.id}};}
 if(location.kind==='interface'){if(!['menu','dialogue','choice','quick','pause','save','load','preferences','history','gallery','notify'].includes(location.screen))throw Error('Экран интерфейса недоступен.');return {...base,activeSection:'interface',uiScreen:location.screen,uiElement:location.target,navigationTarget:{...target,focusKind:'interface',focusId:location.screen}};}
 if(location.kind==='project')return {...base,openProjectSettings:true};
 throw Error('Место редактирования недоступно.');
}
