export { durationField, waitsForPlayer, timelineClips, materializeTimeline, snapTime, trackFor, roundTime, canSplitClip } from '../../runtime/timeline-model.mjs';
import { timelineClips } from '../../runtime/timeline-model.mjs';
export function timelineLayout(actions,pixels=70) { return timelineClips({actions}).map(c=>({...c,left:c.start*pixels,width:c.duration*pixels,field:null})); }
export function timelineFrame(project,scene,time) {
  const frame={background:scene.background,layers:structuredClone(scene.characters??[]),text:null,choice:null,cg:null};
  for(const clip of timelineClips(scene).filter(c=>c.enabled&&c.start<=time).sort((a,b)=>a.start-b.start||a.index-b.index)) {
    const a=clip.action,active=time<clip.end,resource=project.resources.find(r=>r.id===a.assetId);
    if(a.type==='background'&&active)frame.background=resource?.source??null;
    if(a.type==='showCG'&&active)frame.cg=resource?.source;
    if(a.type==='hideCG')frame.cg=null;
    if(['dialogue','narration'].includes(a.type)&&active)frame.text=a;
    if(a.type==='choice'&&active)frame.choice=a;
    let layer=frame.layers.find(l=>l.characterId===a.characterId);
    if(a.type==='showCharacter') {
      if(!layer){layer={id:a.id,characterId:a.characterId,scale:100,y:100,opacity:100,rotation:0,flip:false};frame.layers.push(layer);}
      Object.assign(layer,{visible:active,spriteId:a.spriteId,sourceActionId:a.id,locked:clip.locked,x:a.x??(({left:25,center:50,right:75})[a.position]??50),y:a.y??100,scale:a.scale??100});
    }
    if(a.type==='hideCharacter'&&layer)layer.visible=false;
    if(a.type==='changeSprite'&&layer)layer.spriteId=a.spriteId;
    if(a.type==='moveCharacter'&&layer){const destination=({left:25,center:50,right:75})[a.position]??50;layer.x=(layer.x??50)+(destination-(layer.x??50))*Math.min(1,(time-clip.start)/clip.duration);}
  }
  return frame;
}
