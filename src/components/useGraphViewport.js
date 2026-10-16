import {useLayoutEffect,useState} from 'react';
export function useGraphViewport(ref,expanded){
 const [bounds,setBounds]=useState({left:0,top:0,width:1,height:1});
 useLayoutEffect(()=>{const el=ref.current;if(!el)return;let frame;const measure=()=>{frame=null;const next={left:el.scrollLeft,top:el.scrollTop,width:el.clientWidth,height:el.clientHeight};setBounds(old=>Object.keys(next).every(k=>old[k]===next[k])?old:next);},schedule=()=>{if(frame==null)frame=requestAnimationFrame(measure);};measure();const observer=new ResizeObserver(schedule);observer.observe(el);el.addEventListener('scroll',schedule,{passive:true});return()=>{observer.disconnect();el.removeEventListener('scroll',schedule);if(frame!=null)cancelAnimationFrame(frame);};},[ref,expanded]);return bounds;
}
