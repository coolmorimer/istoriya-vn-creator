export { durationField, waitsForPlayer, timelineClips, materializeTimeline, snapTime, trackFor, roundTime, canSplitClip } from '../../runtime/timeline-model.mjs';
import { timelineClips } from '../../runtime/timeline-model.mjs';
import {backgroundSource} from '../../runtime/background-transform.mjs';
import {animationSample} from '../../runtime/character-animation.mjs';
import {sceneCharacterLayers,shownCharacterLayer} from '../../runtime/visual-order.mjs';
import {sceneImages} from '../../runtime/image-layers.mjs';
import {applyMotion,cameraPose} from '../../runtime/keyframes.mjs';
export function timelineLayout(actions,pixels=70) { return timelineClips({actions}).map(c=>({...c,left:c.start*pixels,width:c.duration*pixels,field:null})); }
export function timelineFrame(project,scene,time) {
  const frame={camera:cameraPose(),images:sceneImages(scene),background:backgroundSource(project,scene),backgroundTransform:scene.backgroundTransform,backgroundActionId:null,layers:sceneCharacterLayers(scene),text:null,choice:null,cg:null};
  for(const clip of timelineClips(scene).filter(c=>c.enabled&&c.start<=time).sort((a,b)=>a.start-b.start||a.index-b.index)) {
    const a=clip.action,active=time<clip.end,resource=project.resources.find(r=>r.id===a.assetId);
    if(a.type==='keyframes'){const source=a.target.kind==='background'?timelineClips(scene).filter(c=>c.enabled&&c.action.type==='background'&&c.start<=clip.start&&c.end>clip.start).at(-1):null;if(!source||time<source.end)applyMotion(frame,a,Math.min(time-clip.start,clip.duration));}
    if(a.type==='background'&&active){frame.background=resource?.source??null;frame.backgroundTransform=a.backgroundTransform;frame.backgroundActionId=a.id;}
    if(a.type==='showCG'&&active)frame.cg=resource?.source;
    if(a.type==='hideCG')frame.cg=null;
    if(['dialogue','narration'].includes(a.type)&&active)frame.text=a;
    if(a.type==='choice'&&active)frame.choice=a;
    let layer=frame.layers.find(l=>l.characterId===a.characterId);
    if(a.type==='showCharacter') {
      const shown=shownCharacterLayer(scene,a,clip.index,layer);
      if(!layer){layer=shown;frame.layers.push(layer);}else Object.assign(layer,shown);
      Object.assign(layer,{visible:active,locked:clip.locked});
    }
    if(a.type==='hideCharacter'&&layer)layer.visible=false;
    if(a.type==='changeSprite'&&layer)layer.spriteId=a.spriteId;
    if(a.type==='characterAnimation'&&layer&&layer.visible!==false){const sample=animationSample(a,(time-clip.start)/clip.duration);layer.scale=(layer.scale??100)*sample.zoom;layer.x=(layer.x??50)+sample.dx/(project.meta.resolution.width||1920)*100;layer.y=(layer.y??100)+sample.dy/(project.meta.resolution.height||1080)*100;if(a.spriteId!=null)layer.spriteId=a.spriteId;}
    if(a.type==='moveCharacter'&&layer){const destination=({left:25,center:50,right:75})[a.position]??50;layer.x=(layer.x??50)+(destination-(layer.x??50))*Math.min(1,(time-clip.start)/clip.duration);}
  }
  return frame;
}
