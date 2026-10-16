// Visual snapshots only: do not execute choices, variable mutations or jumps while editing.
import {backgroundSource} from '../../runtime/background-transform.mjs';
import {animationEnd,animationPlan} from '../../runtime/character-animation.mjs';
import {sceneCharacterLayers,shownCharacterLayer} from '../../runtime/visual-order.mjs';
export function storyboardFrames(project, scene) {
  let frame={background:backgroundSource(project,scene),backgroundTransform:scene.backgroundTransform,backgroundActionId:null,layers:sceneCharacterLayers(scene),text:null,choice:null,cg:null};
  return scene.actions.map((action,index)=>{
    frame={...frame,layers:frame.layers.map(layer=>({...layer})),choice:null,exploration:null};
    const resource=project.resources.find(r=>r.id===action.assetId);
    if(action.type==='background'){frame.background=resource?.source??null;frame.backgroundTransform=action.backgroundTransform;frame.backgroundActionId=action.id;if(action.preserveCharacters!==true){frame.layers=[];frame.cg=null;}}
    if(action.type==='showCG')frame.cg=resource?.source??null;
    if(action.type==='hideCG')frame.cg=null;
    if(['dialogue','narration'].includes(action.type))frame.text=action;
    if(action.type==='choice'){frame.choice=action;frame.text=null;}
    if(action.type==='explore'){frame.exploration=action;frame.text=null;}
    let layer=frame.layers.find(l=>l.characterId===(action.characterId??action.speakerId));
    if(action.type==='hideCharacter')frame.layers=frame.layers.filter(l=>l.characterId!==action.characterId);
    if(action.type==='showCharacter'){
      const shown=shownCharacterLayer(scene,action,index,layer);
      if(layer)Object.assign(layer,shown);else {layer=shown;frame.layers.push(layer);}
    }
    if(['changeSprite','dialogue'].includes(action.type)&&layer&&(action.type==='changeSprite'||action.spriteId)){layer.spriteId=action.spriteId??null;layer.spriteActionId=action.id;}
    if(action.type==='moveCharacter'&&layer){layer.x=action.x??({left:25,center:50,right:75})[action.position]??50;layer.y=action.y??layer.y;layer.transformActionId=action.id;}
    if(action.type==='characterAnimation'&&layer&&layer.visible!==false){Object.assign(layer,animationEnd(layer,action),{animationScaleMultiplier:(layer.animationScaleMultiplier??1)*animationPlan(action).at(-1).zoom});if(action.spriteId!=null)layer.spriteActionId=action.id;}
    return {action,frame};
  });
}

export function sequentialActions(scene) {
  return scene.actions.map((action,index)=>({action,index})).filter(({action})=>action.timeline?.enabled!==false)
    .sort((a,b)=>(Number(a.action.timeline?.start)||0)-(Number(b.action.timeline?.start)||0)||a.index-b.index)
    .map(({action})=>{const result=structuredClone(action);delete result.timeline;return result;});
}
