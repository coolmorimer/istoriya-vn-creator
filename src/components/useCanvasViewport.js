import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {canvasResolution,fitCanvasView,zoomCanvasView,resizeCanvasView,focusCanvasView,pointerPanView,panCanvasView} from '../domain/canvasViewport.js';
const editing=target=>!!target?.closest?.('input,textarea,select,[contenteditable="true"],.replace-background');
export function useCanvasViewport(viewport,identity,resolution,options={}){
 const size=canvasResolution(resolution),[state,setState]=useState(()=>({bounds:{width:1,height:1},view:fitCanvasView({width:1,height:1},size)}));
 const current=useRef(state),settings=useRef(options),pan=useRef(null),space=useRef(false),[spaceHeld,setSpaceHeld]=useState(false),[hand,setHand]=useState(false),[panning,setPanning]=useState(false);
 current.current=state;settings.current=options;
 const stopPan=()=>{const gesture=pan.current;pan.current=null;setPanning(false);if(gesture?.element.hasPointerCapture(gesture.pointerId))gesture.element.releasePointerCapture(gesture.pointerId);};
 const fit=()=>setState(previous=>({...previous,view:fitCanvasView(previous.bounds,size)}));
 const zoom=(scale,anchor)=>setState(previous=>({...previous,view:zoomCanvasView(previous.view,scale,anchor??{x:previous.bounds.width/2,y:previous.bounds.height/2})}));
 const focus=rect=>setState(previous=>({...previous,view:focusCanvasView(previous.view,rect,previous.bounds)}));
 useLayoutEffect(()=>{
  const element=viewport.current;if(!element)return;
  const bounds=()=>({width:Math.max(1,element.clientWidth),height:Math.max(1,element.clientHeight)}),initial=bounds();
  setState({bounds:initial,view:fitCanvasView(initial,size)});
  const observer=new ResizeObserver(()=>{const next=bounds();if(current.current.bounds.width!==next.width||current.current.bounds.height!==next.height){stopPan();settings.current.onCancel?.();}setState(previous=>previous.bounds.width===next.width&&previous.bounds.height===next.height?previous:{bounds:next,view:resizeCanvasView(previous.view,previous.bounds,next,size)});});
  observer.observe(element);return()=>{observer.disconnect();stopPan();settings.current.onCancel?.();};
 },[viewport,identity,size.width,size.height]);
 useEffect(()=>{
  const element=viewport.current;if(!element)return;
  const wheel=event=>{
   if(editing(event.target))return;event.preventDefault();event.stopPropagation();if(!settings.current.canNavigate||pan.current)return;
   const rect=element.getBoundingClientRect(),factor=event.deltaMode===1?16:event.deltaMode===2?element.clientHeight:1,delta=event.deltaY*factor;
   setState(previous=>({...previous,view:zoomCanvasView(previous.view,previous.view.scale*Math.exp(-Math.max(-500,Math.min(500,delta))*.0015),{x:event.clientX-rect.left,y:event.clientY-rect.top})}));
  };
  const keyup=event=>{if(event.code==='Space'){space.current=false;setSpaceHeld(false);}};
  const blur=()=>{space.current=false;setSpaceHeld(false);stopPan();settings.current.onCancel?.();};
  element.addEventListener('wheel',wheel,{passive:false});window.addEventListener('keyup',keyup);window.addEventListener('blur',blur);
  return()=>{element.removeEventListener('wheel',wheel);window.removeEventListener('keyup',keyup);window.removeEventListener('blur',blur);};
 },[viewport]);
 const down=event=>{
  if(pan.current){event.stopPropagation();return;}if(editing(event.target))return;
  if(event.button===0||event.button===1)viewport.current?.focus({preventScroll:true});
  if(!settings.current.canNavigate||!(event.button===1||event.button===0&&(hand||space.current)))return;
  event.preventDefault();event.stopPropagation();const element=event.currentTarget;pan.current={pointerId:event.pointerId,clientX:event.clientX,clientY:event.clientY,view:current.current.view,element};element.setPointerCapture(event.pointerId);setPanning(true);
 };
 const move=event=>{const view=pointerPanView(pan.current,event);if(!view)return;event.preventDefault();event.stopPropagation();setState(previous=>({...previous,view}));};
 const end=event=>{if(pan.current?.pointerId!==event.pointerId)return;event.preventDefault();event.stopPropagation();if(event.type==='pointerup'){const view=pointerPanView(pan.current,event);setState(previous=>({...previous,view}));}stopPan();};
 const lost=event=>{if(pan.current?.pointerId===event.pointerId)stopPan();};
 const key=event=>{
  if(editing(event.target)||event.altKey||event.metaKey)return;
  if(!settings.current.canNavigate&&event.key!=='Escape')return;
  let handled=true;
  if(event.code==='Space'&&!event.ctrlKey){space.current=true;setSpaceHeld(true);}
  else if(event.key==='Escape'){const cancelled=settings.current.onCancel?.();if(pan.current||hand||space.current||cancelled){stopPan();space.current=false;setSpaceHeld(false);setHand(false);}else handled=false;}
  else if(event.ctrlKey&&event.key==='0'||event.key==='Home'&&!event.ctrlKey)fit();
  else if(event.ctrlKey&&event.key==='1')zoom(1);
  else if(!event.ctrlKey&&(hand||space.current)&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){const step=event.shiftKey?160:40;setState(previous=>({...previous,view:panCanvasView(previous.view,event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0,event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0)}));}
  else if(['+','='].includes(event.key))zoom(current.current.view.scale*1.25);
  else if(event.key==='-')zoom(current.current.view.scale/1.25);
  else handled=false;
  if(handled){event.preventDefault();event.stopPropagation();}
 };
 return {...state,fit,zoom,focus,hand,setHand:value=>{setHand(value);viewport.current?.focus({preventScroll:true});},panning,busy:!options.canNavigate,canPan:hand||spaceHeld,bind:{onPointerDownCapture:down,onPointerMoveCapture:move,onPointerUpCapture:end,onPointerCancelCapture:end,onLostPointerCapture:lost,onKeyDown:key}};
}
