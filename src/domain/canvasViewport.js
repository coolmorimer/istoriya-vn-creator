// Editor-only geometry. Nothing here changes project coordinates or history.
export const MIN_CANVAS_SCALE=.01,MAX_CANVAS_SCALE=8;
const number=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;
const positive=(value,fallback)=>Math.max(1,number(value,fallback));
export const canvasScale=value=>Math.max(MIN_CANVAS_SCALE,Math.min(MAX_CANVAS_SCALE,number(value,1)));
export const canvasResolution=resolution=>({width:positive(resolution?.width,1920),height:positive(resolution?.height,1080)});
export function fitCanvasView(viewport,resolution,margin=24){
 const size=canvasResolution(resolution),width=positive(viewport?.width,1),height=positive(viewport?.height,1);
 const scale=canvasScale(Math.min(Math.max(1,width-margin*2)/size.width,Math.max(1,height-margin*2)/size.height));
 return {scale,x:(width-size.width*scale)/2,y:(height-size.height*scale)/2,mode:'fit'};
}
export function zoomCanvasView(view,nextScale,anchor){
 const scale=canvasScale(nextScale),old=canvasScale(view.scale),x=number(anchor?.x,0),y=number(anchor?.y,0);
 return {scale,x:x-(x-number(view.x,0))*scale/old,y:y-(y-number(view.y,0))*scale/old,mode:'manual'};
}
export function resizeCanvasView(view,previous,next,resolution){
 if(view.mode==='fit')return fitCanvasView(next,resolution);
 return {...view,x:view.x+(next.width-previous.width)/2,y:view.y+(next.height-previous.height)/2};
}
export function panCanvasView(view,dx,dy){return {...view,x:view.x+number(dx,0),y:view.y+number(dy,0),mode:'manual'};}
export function pointerPanView(gesture,event){
 return gesture&&gesture.pointerId===event.pointerId?panCanvasView(gesture.view,event.clientX-gesture.clientX,event.clientY-gesture.clientY):null;
}
export function focusCanvasView(view,rect,viewport,margin=32){
 if(!rect||!['left','top','right','bottom'].every(key=>Number.isFinite(rect[key]))||rect.right<rect.left||rect.bottom<rect.top)return view;
 const width=positive(viewport.width,1),height=positive(viewport.height,1),scale=canvasScale(Math.min(view.scale,Math.max(1,width-margin*2)/Math.max(1,rect.right-rect.left),Math.max(1,height-margin*2)/Math.max(1,rect.bottom-rect.top)));
 return {scale,x:width/2-(rect.left+rect.right)/2*scale,y:height/2-(rect.top+rect.bottom)/2*scale,mode:'manual'};
}
export function canvasLayerBounds(layer,resolution){
 if(!layer)return null;const size=canvasResolution(resolution),background=layer.kind==='background',image=layer.kind==='image';
 const x=number(layer.x,50)/100*size.width,y=number(layer.y,background?50:100)/100*size.height;
 const width=positive(image||background?layer.width:34,image?30:background?100:34)/100*size.width,height=positive(image||background?layer.height:88,image?30:background?100:88)/100*size.height,scale=Math.abs(number(layer.scale,100))/100;
 const angle=number(layer.rotation,0)*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle),top=background?-height/2:-height,bottom=background?height/2:0;
 const points=[[-width/2,top],[width/2,top],[width/2,bottom],[-width/2,bottom]].map(([px,py])=>({x:x+(px*cos-py*sin)*scale,y:y+(px*sin+py*cos)*scale}));
 return {left:Math.min(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),right:Math.max(...points.map(p=>p.x)),bottom:Math.max(...points.map(p=>p.y))};
}
