// Runtime-neutral object logic. These are player states, never editor mutations.
import {evaluateCondition} from './game-logic.mjs';
export const propKey=(sceneId,layerId)=>JSON.stringify([sceneId,layerId]);
export const reactionKey=(sceneId,layerId,reactionId)=>JSON.stringify([sceneId,layerId,reactionId]);
export const itemQuantity=(inventory,itemId)=>Math.max(0,Math.floor(Number(inventory?.[itemId])||0));
export function reactionAvailable(sceneId,layer,reaction,state,passes=()=>true) {
 if(layer.visible===false||layer.opacity===0||state.hiddenProps?.includes(propKey(sceneId,layer.id)))return false;
 if(reaction.once&&state.usedInteractions?.includes(reactionKey(sceneId,layer.id,reaction.id)))return false;
 if(reaction.requiredItemId==='')return false;
 if(reaction.requiredItemId&&itemQuantity(state.inventory,reaction.requiredItemId)<1)return false;
 if(reaction.inventory?.operation==='remove'&&itemQuantity(state.inventory,reaction.inventory.itemId)<Math.max(1,Math.floor(Number(reaction.inventory.quantity)||1)))return false;
 return !reaction.condition||passes(reaction.condition,state);
}
export function availableReactions(sceneId,layer,state,passes) {return (layer.interactions??[]).filter(r=>reactionAvailable(sceneId,layer,r,state,passes));}
// Inventory actions are routes to existing prop reactions, never a second
// copy of their conditions/results. Re-evaluate at execution, after Save/Load.
export function inventoryTargets(project,state,itemId) {
 if(state.ended||state.cg||state.waiting?.type!=='explore'||itemQuantity(state.inventory,itemId)<1||!project.items?.some(i=>i.id===itemId))return [];
 const scene=project.scenes[state.sceneId];if(!scene)return [];
 return (scene.images??[]).flatMap(layer=>availableReactions(scene.id,layer,state,(condition,s)=>evaluateCondition(condition,s,project))
  .filter(r=>r.requiredItemId===itemId||(r.inventory?.operation==='remove'&&r.inventory.itemId===itemId))
  .map(reaction=>({layerId:layer.id,layerName:layer.name||'Предмет',reactionId:reaction.id,label:reaction.label||'Использовать'})));
}
export function explorationReady(action,state,project) {
 return (!action.requiredItemId||itemQuantity(state.inventory,action.requiredItemId)>0)&&(!action.requiredFlagId||state.flags?.[action.requiredFlagId]===true)&&(!action.condition||(project&&evaluateCondition(action.condition,state,project)));
}
export function applyReactionState(sceneId,layer,reaction,state) {
 state.inventory??={};state.hiddenProps??=[];state.usedInteractions??=[];state.propImages??={};
 const inventory=reaction.inventory;
 if(inventory?.itemId&&['add','remove'].includes(inventory.operation)) {
  const quantity=Math.max(1,Math.floor(Number(inventory.quantity)||1)),current=itemQuantity(state.inventory,inventory.itemId);
  state.inventory[inventory.itemId]=inventory.operation==='add'?current+quantity:Math.max(0,current-quantity);
 }
 const used=reactionKey(sceneId,layer.id,reaction.id);if(!state.usedInteractions.includes(used))state.usedInteractions.push(used);
 const key=propKey(sceneId,layer.id);if(reaction.hideAfter&&!state.hiddenProps.includes(key))state.hiddenProps.push(key);
 if(reaction.resultResourceId)state.propImages[key]=reaction.resultResourceId;
}
