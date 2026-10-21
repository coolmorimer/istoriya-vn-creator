// One 2D motion model shared by authoring, preview and generated ATL.
export const MOTION_FIELDS=['x','y','scale','rotation','opacity','blur'];
export const EASINGS={linear:t=>t,smooth:t=>t*t*(3-2*t),in:t=>t*t,out:t=>1-(1-t)*(1-t),hold:()=>0};
export const cameraPose=()=>({x:50,y:50,scale:100,rotation:0,opacity:100,blur:0});
export const motionTargetKey=target=>JSON.stringify([target?.kind??'',target?.id??'']);
export function pose(value={},kind='camera') {return Object.fromEntries(MOTION_FIELDS.map(k=>[k,Number(value[k]??(k==='x'?50:k==='y'?(kind==='character'||kind==='image'?100:50):['rotation','blur'].includes(k)?0:100))]));}
export function motionProblems(action,scene,project) {
 const issues=[],target=action.target;
 if(!target||!['camera','background','character','image'].includes(target.kind))issues.push('Выберите объект движения.');
 else if(target.kind==='character'&&!project.characters?.some(c=>c.id===target.id))issues.push('Персонаж движения удалён. Выберите другого.');
 else if(target.kind==='image'&&!scene.images?.some(l=>l.id===target.id))issues.push('Предмет движения удалён. Выберите другой.');
 if(!Array.isArray(action.keyframes)||action.keyframes.length<2||action.keyframes.length>128)return [...issues,'Нужно от 2 до 128 ключевых кадров.'];
 const ids=new Set();let previous=-1;
 for(const f of action.keyframes){
  if(!f||typeof f!=='object'){issues.push('Повреждён ключевой кадр.');continue;}
  if(typeof f.id!=='string'||!f.id||ids.has(f.id))issues.push('Повторный идентификатор ключевого кадра.');ids.add(f.id);
  if(!Number.isFinite(f.time)||f.time<0||f.time>600||f.time<=previous)issues.push('Время кадров должно возрастать от 0 до 600 секунд.');previous=f.time;
  if(!Object.hasOwn(EASINGS,f.easing??'linear'))issues.push('Неизвестная плавность движения.');
  for(const k of MOTION_FIELDS.filter(k=>k!=='blur'))if(!Number.isFinite(f[k])||Math.abs(f[k])>10000||(k==='scale'&&(f[k]<1||f[k]>2000))||(k==='opacity'&&(f[k]<0||f[k]>100)))issues.push('Недопустимое значение положения, размера или прозрачности.');
  if(f.blur!=null&&(!Number.isFinite(f.blur)||f.blur<0||f.blur>100))issues.push('Размытие должно быть от 0 до 100 пикселей.');
 }
 if(action.keyframes[0]?.time!==0)issues.push('Первый ключевой кадр должен начинаться в 0 секунд.');
 return [...new Set(issues)];
}
export const motionDuration=a=>a.keyframes?.at(-1)?.time??0;
export function motionSample(action,time) {
 const frames=action.keyframes;if(!frames?.length)return cameraPose();
 if(time<=0)return pose(frames[0],action.target?.kind);
 const end=frames.findIndex(f=>f.time>time);if(end<0)return pose(frames.at(-1),action.target?.kind);
 const a=frames[end-1],b=frames[end],easing=Object.hasOwn(EASINGS,b.easing??'linear')?EASINGS[b.easing??'linear']:EASINGS.linear,t=easing((time-a.time)/(b.time-a.time));
 return Object.fromEntries(MOTION_FIELDS.map(k=>[k,(a[k]??0)+((b[k]??0)-(a[k]??0))*t]));
}
export function applyMotion(frame,action,time=motionDuration(action)) {
 const p=motionSample(action,time),t=action.target??{};
 if(t.kind==='camera')frame.camera=p;
 if(t.kind==='background'){frame.backgroundTransform={...frame.backgroundTransform,...p};frame.backgroundMotionId=action.id;}
 if(t.kind==='image'){frame.images??=[];const layer=frame.images.find(l=>l.id===t.id);if(layer)Object.assign(layer,p,{motionActionId:action.id});}
 if(t.kind==='character'){const layer=frame.layers?.find(l=>l.characterId===t.id);if(layer)Object.assign(layer,p,{motionActionId:action.id,transformActionId:null,animationScaleMultiplier:1});}
 return frame;
}
export function cameraStyle(value=cameraPose(),pixel=1) {const p=pose(value);return {'--scene-pixel':pixel,transformOrigin:'50% 50%',transform:`translate(${p.x-50}%,${p.y-50}%) rotate(${p.rotation}deg) scale(${p.scale/100})`,opacity:p.opacity/100,filter:`blur(calc(${p.blur}px * var(--scene-pixel, 1)))`};}
export function cameraPoint(value,frame,x,y,inverse=false) {const p=pose(value),angle=p.rotation*Math.PI/180,s=p.scale/100,cx=frame.width/2,cy=frame.height/2,dx=(p.x-50)*frame.width/100,dy=(p.y-50)*frame.height/100;if(inverse){x=(x-cx-dx)/s;y=(y-cy-dy)/s;return{x:cx+x*Math.cos(angle)+y*Math.sin(angle),y:cy-x*Math.sin(angle)+y*Math.cos(angle)};}x=(x-cx)*s;y=(y-cy)*s;return{x:cx+dx+x*Math.cos(angle)-y*Math.sin(angle),y:cy+dy+x*Math.sin(angle)+y*Math.cos(angle)};}
export function renpyMotionLines(action,{indent='        ',flip=false}={}) {
 const center=['camera','background'].includes(action.target.kind),f=action.keyframes[0],number=n=>Number.isInteger(n)?`${n}.0`:String(n),properties=p=>`xpos ${number(p.x/100)} ypos ${number(p.y/100)} zoom ${number(p.scale/100)} rotate ${number(p.rotation)} alpha ${number(p.opacity/100)} blur ${number(p.blur??0)}`;
 const lines=[`${indent}anchor (0.5, ${center?'0.5':'1.0'})`,`${indent}rotate_pad False`,`${indent}transform_anchor True`,`${indent}xzoom ${flip?'-1.0':'1.0'}`,`${indent}${properties(f)}`];
 for(let i=1;i<action.keyframes.length;i++){const a=action.keyframes[i-1],b=action.keyframes[i],duration=number(b.time-a.time);if(b.easing==='hold')lines.push(`${indent}pause ${duration}`,`${indent}${properties(b)}`);else lines.push(`${indent}${b.easing==='linear'||!b.easing?'linear':'istoriya_motion_'+b.easing} ${duration} ${properties(b)}`);}
 return lines;
}
export const motionWarperScript=`python early hide:
    @renpy.atl_warper
    def istoriya_motion_smooth(t):
        return t*t*(3-2*t)
    @renpy.atl_warper
    def istoriya_motion_in(t):
        return t*t
    @renpy.atl_warper
    def istoriya_motion_out(t):
        return 1-(1-t)*(1-t)
`;
export function cameraPreset(name,base=cameraPose(),focus) {
 const start={...pose(base),id:'start',time:0,easing:'linear'},end={...start,id:'end',time:name==='cinema'?5:1.5,easing:'smooth'};
 if(name==='zoomIn'||name==='cinema')end.scale=Math.min(2000,start.scale*(name==='cinema'?1.5:1.25));
 if(name==='zoomOut')end.scale=Math.max(1,start.scale/1.25);
 if(['left','right'].includes(name))end.x+=name==='left'?10:-10;
 if(['up','down'].includes(name))end.y+=name==='up'?10:-10;
 if(name==='reset')Object.assign(end,cameraPose());
 if(name==='focus'&&focus){end.scale=Math.max(150,start.scale);const angle=start.rotation*Math.PI/180,dx=focus.x-50,dy=focus.y-50,aspect=focus.aspect??1;end.x=50-(dx*Math.cos(angle)-dy/aspect*Math.sin(angle))*end.scale/100;end.y=50-(dx*aspect*Math.sin(angle)+dy*Math.cos(angle))*end.scale/100;}
 if(name==='shake'||name==='strongShake'){const amount=name==='shake'?1.2:3;return [start,...Array.from({length:7},(_,i)=>({...start,id:'shake_'+i,time:(i+1)*.08,x:start.x+(i%2?-amount:amount),y:start.y+(i%3?-amount/2:amount/2)})),{...start,id:'end',time:.64}];}
 return [start,end];
}
