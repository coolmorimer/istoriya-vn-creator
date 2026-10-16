// One stacking policy for editor snapshots and Ren'Py's integer zorder.
export const BACKGROUND_Z_ORDER = -100;
export function layerZOrder(value, fallback = 10) {
  return value != null && value !== '' && Number.isFinite(Number(value)) ? Math.round(Number(value)) : fallback;
}
export function sceneCharacterLayers(scene) {
  return (scene?.characters ?? []).map((layer,index)=>({
    x:50,y:100,scale:100,rotation:0,opacity:100,visible:true,flip:false,
    ...structuredClone(layer),zOrder:layerZOrder(layer.zOrder,10+index),_stackOrder:index+1,
  }));
}
export function shownCharacterLayer(scene, action, index, previous) {
  const zOrder=layerZOrder(action.zOrder);
  return {
    id:previous?.id ?? action.id,characterId:action.characterId,
    name:action.name,visible:true,locked:action.locked??false,spriteId:action.spriteId??null,
    x:action.x??({left:25,center:50,right:75})[action.position]??50,y:action.y??100,
    scale:action.scale??100,rotation:action.rotation??0,opacity:action.opacity??100,flip:action.flip??false,
    zOrder,_stackOrder:previous && previous.zOrder===zOrder ? previous._stackOrder : (scene.characters?.length??0)+(scene.images?.length??0)+index+1,
    sourceActionId:action.id,transformActionId:action.id,spriteActionId:action.id,animationScaleMultiplier:1,
  };
}
export function compareVisualLayers(a,b) {
  return layerZOrder(a.zOrder)-layerZOrder(b.zOrder)||(a._stackOrder??0)-(b._stackOrder??0);
}
// Compact positive CSS ranks avoid browser z-index limits and negative objects
// falling behind the canvas itself. CG and controls have separate stacking roots.
export function scenePaintOrder(scene,characters,images,backgroundActionId=null) {
  const background={kind:'background',zOrder:BACKGROUND_Z_ORDER,_stackOrder:0};
  if(scene.timelineEnabled&&backgroundActionId)background._stackOrder=(scene.characters?.length??0)+(scene.images?.length??0)+scene.actions.findIndex(a=>a.id===backgroundActionId)+1;
  const entries=[background,...characters.filter(l=>l.visible!==false).map(l=>({...l,kind:'character'})),...images.filter(l=>l.visible!==false)];
  const order={background:0,characters:new Map(),images:new Map()};
  entries.sort(compareVisualLayers).forEach((layer,index)=>{
    if(layer.kind==='background')order.background=index+1;
    else if(layer.kind==='image')order.images.set(layer.id,index+1);
    else order.characters.set(layer.characterId,index+1);
  });
  return order;
}
