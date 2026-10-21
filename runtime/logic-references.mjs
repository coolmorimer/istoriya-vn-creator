import {conditionReferences,effectKind} from './game-logic.mjs';
export function logicReferences(project,kind,id){
 const uses=[],effectUses=e=>kind==='item'?effectKind(e)==='inventory'&&e.itemId===id:kind==='flag'?effectKind(e)==='flag'&&e.flagId===id:effectKind(e)==='variable'&&e.variableId===id;
 if(kind==='item'){for(const recipe of project.rpg?.recipes??[])if([...(recipe.ingredients??[]),...(recipe.results??[])].some(i=>i.itemId===id))uses.push({rpg:true,label:`Рецепт «${recipe.name}»`});for(const actor of project.rpg?.actors??[])if(actor.loot?.some(i=>i.itemId===id))uses.push({rpg:true,label:`Добыча «${actor.name}»`});}
 for(const location of project.rpg?.locations??[])if(conditionReferences(location.condition,kind,id))uses.push({rpg:true,label:`Условия локации «${location.name}»`});
 for(const scene of Object.values(project.scenes??{})){
  for(const action of scene.actions??[]){
   const direct=kind==='item'?action.requiredItemId===id:kind==='flag'?action.requiredFlagId===id||action.type==='flag'&&action.flagId===id:action.type==='variable'&&action.variableId===id;
   if(direct||conditionReferences(action.condition??(action.type==='condition'?action:null),kind,id))uses.push({sceneId:scene.id,actionId:action.id,label:`Шаг «${{explore:'Осмотреть сцену',condition:'Условие',flag:'Изменить флаг',variable:'Изменить переменную'}[action.type]??'Действие'}» · ${scene.title}`});
   for(const option of action.options??[])if(conditionReferences(option.condition,kind,id)||option.effects?.some(effectUses))uses.push({sceneId:scene.id,actionId:action.id,optionId:option.id,label:`Вариант «${option.text}» · ${scene.title}`});
  }
  for(const layer of scene.images??[])for(const reaction of layer.interactions??[]){
   const direct=kind==='item'&&(reaction.requiredItemId===id||reaction.inventory?.itemId===id);
   if(direct||conditionReferences(reaction.condition,kind,id)||reaction.effects?.some(effectUses))uses.push({sceneId:scene.id,layerId:layer.id,reactionId:reaction.id,label:`«${reaction.label}» · ${layer.name} · ${scene.title}`});
  }
 }
 return uses;
}
