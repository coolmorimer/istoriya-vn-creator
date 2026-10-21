import {motionDuration} from './keyframes.mjs';
export const durationField = action => ({moveCharacter:'duration',characterAnimation:'duration',event:'duration',pause:'duration',music:'fadeIn',stopMusic:'fadeOut',stopAudio:'fadeOut'})[action.type] ?? null;
export const waitsForPlayer = action => ['dialogue','narration','choice','explore'].includes(action.type);
export const canSplitClip = action => ['background','showCG','showCharacter','dialogue','narration','pause'].includes(action.type);
export const trackFor = action => action.type==='keyframes'?`motion:${action.target?.kind??'camera'}:${action.target?.id??''}`:['background','showCG','hideCG'].includes(action.type)?'background':(/Character|Sprite/.test(action.type)||action.type==='characterAnimation')?`character:${action.characterId??'none'}`:['dialogue','narration'].includes(action.type)?'text':action.type==='choice'?'choice':['music','stopMusic','stopAudio','sound','voice','ambience'].includes(action.type)?`audio:${action.type==='stopMusic'?'music':action.type==='stopAudio'?action.channel:action.type}`:'logic';
export const roundTime = n => Math.round(n*100)/100;
export function timelineClips(scene) {
  let cursor=0;
  return (scene.actions??[]).map((action,index)=>{
    const duration=action.type==='keyframes'?motionDuration(action):Math.max(.1,Number(action.timeline?.duration) || (waitsForPlayer(action)?3:['music','sound','voice','ambience','background','showCG','showCharacter'].includes(action.type)?5:Number(action.duration)||1));
    const start=Math.max(0,Number.isFinite(action.timeline?.start)?action.timeline.start:cursor);
    if(waitsForPlayer(action)||['pause','moveCharacter','characterAnimation','keyframes','event'].includes(action.type))cursor=start+duration;
    return {action,index,start,duration,end:roundTime(start+duration),track:trackFor(action),enabled:action.timeline?.enabled!==false,locked:!!action.timeline?.locked};
  });
}
export function materializeTimeline(scene) {
  for(const clip of timelineClips(scene))clip.action.timeline={...clip.action.timeline,start:clip.start,duration:clip.duration};
  scene.timelineEnabled=true;
}
export function snapTime(value, points, threshold=.12) {
  const closest=points.reduce((best,p)=>Math.abs(p-value)<Math.abs(best-value)?p:best,Infinity);
  return roundTime(Math.max(0,Math.abs(closest-value)<=threshold?closest:value));
}
export function timelineEvents(scene) {
  const events=[];
  for(const clip of timelineClips(scene).filter(c=>c.enabled)) {
    const {action,start,end,duration}=clip;
    const a={...action,timeline:{...action.timeline,start,duration}};
    if(['moveCharacter','characterAnimation','event','pause'].includes(a.type))a.duration=duration;
    events.push({time:start,order:1,index:clip.index,action:a});
    let ending;
    if(['dialogue','narration'].includes(a.type))ending={type:'timelineTextEnd',wait:a.timeline.waitForClick!==false};
    if(a.type==='showCharacter')ending={type:'hideCharacter',characterId:a.characterId,transition:'none'};
    if(a.type==='showCG')ending={type:'hideCG',transition:'none'};
    if(['music','sound','voice','ambience'].includes(a.type))ending={type:'timelineStopAudio',channel:a.type};
    if(a.type==='background')ending={type:'timelineBackgroundEnd'};
    if(ending)events.push({time:end,order:0,index:clip.index,action:ending});
  }
  events.sort((a,b)=>a.time-b.time||a.order-b.order||a.index-b.index);
  const output=[];
  for(const event of events){output.push({type:'timelineWait',time:event.time});output.push(event.action);}
  output.push({type:'timelineWait',time:Math.max(0,...timelineClips(scene).filter(c=>c.enabled).map(c=>c.end))});
  return output;
}

export function timelineConflicts(scene) {
  const clips=timelineClips(scene).filter(c=>c.enabled);
  const durationTypes=new Set(['background','showCG','showCharacter','dialogue','narration','music','sound','voice','ambience']);
  return clips.flatMap((a,i)=>clips.slice(i+1).filter(b=>a.start<b.end&&b.start<a.end&&((durationTypes.has(a.action.type)&&durationTypes.has(b.action.type)&&a.track===b.track)||(a.action.type==='keyframes'&&b.action.type==='keyframes'&&a.track===b.track))).map(b=>[a,b]));
}
