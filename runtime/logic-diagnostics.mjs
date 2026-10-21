import {evaluateCondition,effectKind,scalarValue} from './game-logic.mjs';
// Conservative potential analysis. An unknown result is never called impossible.
export function logicPotential(project){
 const flags=new Map((project.flags??[]).map(f=>[f.id,new Set([scalarValue('boolean',f.initial)])])),variables=new Set(),items=new Set();
 const effect=e=>{const kind=effectKind(e);if(kind==='flag')flags.get(e.flagId)?.add(scalarValue('boolean',e.value));else if(kind==='inventory'){if(e.operation==='add'&&Number(e.quantity)>0)items.add(e.itemId);}else variables.add(e.variableId);};
 for(const scene of Object.values(project.scenes??{})){
  for(const action of scene.actions??[]){if(['flag','variable'].includes(action.type))effect(action);for(const option of action.options??[])for(const e of option.effects??[])effect(e);}
  for(const layer of scene.images??[])for(const reaction of layer.interactions??[]){if(reaction.inventory?.operation==='add')items.add(reaction.inventory.itemId);for(const e of reaction.effects??[])effect(e);}
 }
 const state={flags:Object.fromEntries((project.flags??[]).map(f=>[f.id,scalarValue('boolean',f.initial)])),variables:Object.fromEntries((project.variables??[]).map(v=>[v.id,scalarValue(v.type,v.initial)])),inventory:{}};
 for(const recipe of project.rpg?.recipes??[])for(const row of recipe.results??[])items.add(row.itemId);
 for(const actor of project.rpg?.actors??[])for(const row of actor.loot??[])items.add(row.itemId);
 const conditionPossible=c=>{
  if(!c)return true;let result;
  if(c.statId)return undefined;
  if(c.kind==='all'||c.kind==='any'){
   const values=(c.conditions??[]).map(conditionPossible);
   result=c.kind==='all'?values.includes(false)?false:values.every(v=>v===true)?true:undefined:values.includes(true)?true:values.every(v=>v===false)?false:undefined;
  }else{
   const leaf={...c,negate:false};
   if(c.flagId){const possibilities=[...(flags.get(c.flagId)??[])].map(value=>evaluateCondition(leaf,{...state,flags:{...state.flags,[c.flagId]:value}},project));result=possibilities.length&&possibilities.every(v=>v===true)?true:possibilities.length&&possibilities.every(v=>v===false)?false:undefined;}
   else if(c.itemId&&items.has(c.itemId)||c.variableId&&variables.has(c.variableId))result=undefined;
   else result=evaluateCondition(leaf,state,project);
  }
  return c.negate&&result!==undefined?!result:result;
 };
 return {conditionPossible,itemCanExist:id=>items.has(id),flagCanBeTrue:id=>flags.get(id)?.has(true)??false};
}
