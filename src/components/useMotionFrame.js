import {useEffect,useRef,useState} from 'react';
import {applyMotion,motionDuration} from '../../runtime/keyframes.mjs';
export function useMotionFrame(state,paused=false) {
 const [clock,setClock]=useState(0),clocks=useRef(new Map()),last=useRef(null);
 useEffect(()=>{let raf;last.current=null;const tick=now=>{const delta=last.current==null||paused?0:(now-last.current)/1000;last.current=now;let active=false;const tokens=new Set();for(const m of Object.values(state.motions??{})){tokens.add(m.token);const value=Math.min(motionDuration(m.action),(clocks.current.get(m.token)??0)+delta);clocks.current.set(m.token,value);if(value<motionDuration(m.action))active=true;}for(const token of clocks.current.keys())if(!tokens.has(token))clocks.current.delete(token);setClock(now);if(active&&!paused)raf=requestAnimationFrame(tick);};raf=requestAnimationFrame(tick);return()=>cancelAnimationFrame(raf);},[state.motions,paused]);
 const frame={...state,layers:state.layers.map(l=>({...l})),images:state.images?.map(l=>({...l}))};
 for(const m of Object.values(state.motions??{}))applyMotion(frame,m.action,clocks.current.get(m.token)??0);
 void clock;return frame;
}
