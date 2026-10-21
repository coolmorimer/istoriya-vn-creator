import {useRef} from 'react';
import {useWorkspaceLayout} from './WorkspaceLayout.jsx';
export function EditorWorkspace({map,scene,children}) {
 const {layout,patch}=useWorkspaceLayout(),ratio=layout.ratio,bottomDocked=layout.showBottom&&!layout.floating?.storyboard;
 const setRatio=value=>patch({ratio:typeof value==='function'?value(ratio):value}),root=useRef(null),drag=useRef(false);
 const resize=y=>{const r=root.current.getBoundingClientRect();setRatio(Math.max(25,Math.min(75,(y-r.top)/r.height*100)));};
 return <main ref={root} className={`editor-main ${map?'map-workspace':''}`} style={map||!bottomDocked?{gridTemplateRows:'minmax(0,1fr)'}:{gridTemplateRows:`minmax(170px,${ratio}fr) 7px minmax(180px,${100-ratio}fr)`}}>
  {!map&&<>{scene}{bottomDocked&&<div className="editor-splitter" role="separator" aria-label="Размер сцены и редактора кадров" aria-orientation="horizontal" aria-valuenow={Math.round(ratio)} aria-valuemin={25} aria-valuemax={75} tabIndex={0} onDoubleClick={()=>setRatio(58)} onKeyDown={e=>{if(['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();setRatio(n=>Math.max(25,Math.min(75,n+(e.key==='ArrowUp'?-5:5))));}}} onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();drag.current=true;e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{if(drag.current)resize(e.clientY);}} onPointerUp={()=>{drag.current=false;}} onPointerCancel={()=>{drag.current=false;}}/>}</>}{(map||layout.showBottom)&&children}
 </main>;
}
