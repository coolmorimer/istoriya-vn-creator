import {renpyFloat} from './renpy-transform.mjs';
export const CHARACTER_ANIMATIONS=['shake','strongShake','jump','bounce','pulse','zoomIn','stepForward','stepBack'];
const finite=(value,fallback)=>Number.isFinite(Number(value))&&value!=null?Number(value):fallback;
const round=value=>Math.round(value*1e8)/1e8;
export function animationSettings(action={}) {
 return {name:CHARACTER_ANIMATIONS.includes(action.animation)?action.animation:'shake',duration:Math.max(.1,Math.min(120,finite(action.duration,.5))),intensity:Math.max(.2,Math.min(3,finite(action.intensity,1)))};
}
export function animationPlan(action) {
 const {name,intensity:i}=animationSettings(action);
 const point=(at,zoom=1,dx=0,dy=0)=>({at,zoom,dx:Math.round(dx),dy:Math.round(dy)});
 if(name==='shake'||name==='strongShake')return Array.from({length:11},(_,n)=>point(n/10,1,n===0||n===10?0:(n%2?1:-1)*(name==='shake'?18:40)*i,name==='strongShake'&&n!==0&&n!==10?(n%2?-12:12)*i:0));
 if(name==='jump')return [point(0),point(.5,1,0,-90*i),point(1)];
 if(name==='bounce')return [point(0),point(.25,1,0,-55*i),point(.5),point(.75,1,0,-28*i),point(1)];
 if(name==='pulse')return [point(0),point(.5,1+.08*i),point(1)];
 if(name==='zoomIn')return [point(0,Math.max(.1,1-.25*i)),point(1)];
 return [point(0),point(1,name==='stepForward'?1+.12*i:Math.max(.1,1-.12*i))];
}
export function animationEnd(layer,action) {
 const factor=animationPlan(action).at(-1).zoom;
 return {...layer,scale:round((layer.scale??100)*factor),...(action.spriteId!=null?{spriteId:action.spriteId}:{})};
}
export function animationSample(action,fraction) {
 const points=animationPlan(action),t=Math.max(0,Math.min(1,finite(fraction,0)));
 const next=points.findIndex(p=>p.at>=t);
 if(next<=0)return {...points[0],at:t};
 const a=points[next-1],b=points[next],progress=(t-a.at)/(b.at-a.at),ease=.5-.5*Math.cos(progress*Math.PI);
 return {at:t,...Object.fromEntries(['zoom','dx','dy'].map(key=>[key,a[key]+(b[key]-a[key])*ease]))};
}
export function actorTransformStyle(layer,sample={zoom:1,dx:0,dy:0},pixelRatio=1) {
 const scale=(layer.scale??100)/100*sample.zoom;
 return `translate(calc(-50% + ${sample.dx*pixelRatio}px), calc(-100% + ${sample.dy*pixelRatio}px)) rotate(${layer.rotation??0}deg) scale(${(layer.flip?-1:1)*scale}, ${scale})`;
}
export function animationKeyframes(layer,action,pixelRatio=1) {
 // Linear samples of the same cosine ease used by Ren'Py's ATL ease warper.
 return Array.from({length:121},(_,index)=>{const offset=index/120;return {offset,transform:actorTransformStyle(layer,animationSample(action,offset),pixelRatio)};});
}
export function renpyAnimationLines(layer,action) {
 const {duration}=animationSettings(action),points=animationPlan(action),start=points[0];
 const sample=p=>`zoom ${round((layer.scale??100)/100*p.zoom)} xoffset ${p.dx} yoffset ${p.dy}`;
 return [
  `        xpos ${renpyFloat((layer.x??({left:25,center:50,right:75})[layer.position]??50)/100)} ypos ${renpyFloat((layer.y??100)/100)}`,
  '        xanchor 0.5 yanchor 1.0',
  `        rotate ${layer.rotation??0} alpha ${(layer.opacity??100)/100} xzoom ${layer.flip?-1:1}`,
  '        rotate_pad False transform_anchor True',
  `        ${sample(start)}`,
  ...points.slice(1).map((p,index)=>`        ease ${round(duration*(p.at-points[index].at))} ${sample(p)}`),
 ];
}
