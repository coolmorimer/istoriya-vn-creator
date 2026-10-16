import {renpyFloat} from './renpy-transform.mjs';
const number=(value,fallback)=>value!=null&&Number.isFinite(Number(value))?Number(value):fallback;
export function backgroundSource(project,scene) {return project.resources?.find(resource=>resource.id===scene?.backgroundResourceId)?.source??scene?.background??null;}
export function backgroundTransform(value={}) {
  value ||= {};
  return {x:number(value.x,50),y:number(value.y,50),scale:Math.max(1,Math.min(2000,number(value.scale,100))),width:Math.max(1,Math.min(2000,number(value.width,100))),height:Math.max(1,Math.min(2000,number(value.height,100))),rotation:number(value.rotation,0),fit:['contain','cover','fill'].includes(value.fit)?value.fit:'fill'};
}
export function backgroundStyle(value) {
 const t=backgroundTransform(value);
 return {position:'absolute',left:`${t.x}%`,top:`${t.y}%`,width:`${t.width}%`,height:`${t.height}%`,objectFit:t.fit,transform:`translate(-50%,-50%) rotate(${t.rotation}deg) scale(${t.scale/100})`};
}
export function renpyBackground(source,width,height,value) {
 const t=backgroundTransform(value),fit=t.fit==='fill'?'fill':t.fit;
 return `Transform(Transform(${JSON.stringify(String(source))}, xysize=(${Math.round(width*t.width/100)}, ${Math.round(height*t.height/100)}), fit=${JSON.stringify(fit)}), xpos=${renpyFloat(t.x/100)}, ypos=${renpyFloat(t.y/100)}, xanchor=0.5, yanchor=0.5, zoom=${t.scale/100}, rotate=${t.rotation}, rotate_pad=False, transform_anchor=True)`;
}
