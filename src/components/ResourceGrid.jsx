import {useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import {resourceGridWindow,resourceGridScroll} from '../domain/resourceGrid.js';

// Keep focus on the listbox, not a recyclable card. Arrow/Home/End navigation
// reaches every result and scrolls it into view without mounting the full list.
export function ResourceGrid({resources,selectedId,onSelect,filterKey,renderCard}){
 const viewport=useRef(null),prefix=useId(),[bounds,setBounds]=useState({width:1,height:1,top:0});
 const grid=resourceGridWindow({count:resources.length,...bounds,scrollTop:bounds.top}),selectedIndex=resources.findIndex(r=>r.id===selectedId);
 useLayoutEffect(()=>{const element=viewport.current,measure=()=>setBounds(old=>({width:element.clientWidth,height:element.clientHeight,top:element.scrollTop}));measure();const observer=new ResizeObserver(measure);observer.observe(element);return()=>observer.disconnect();},[]);
 useEffect(()=>{if(viewport.current){viewport.current.scrollTop=0;setBounds(old=>({...old,top:0}));}},[filterKey]);
 useEffect(()=>{const element=viewport.current;if(!element||selectedIndex<0)return;const top=resourceGridScroll(selectedIndex,grid,element.scrollTop,element.clientHeight);if(top!==element.scrollTop){element.scrollTop=top;setBounds(old=>({...old,top}));}},[selectedId,grid.columns,filterKey]);
 const keyboard=event=>{
  const current=Math.max(0,selectedIndex),last=resources.length-1;let index;
  if(event.key==='Home')index=0;else if(event.key==='End')index=last;else if(event.key==='ArrowLeft')index=current-1;else if(event.key==='ArrowRight')index=current+1;else if(event.key==='ArrowUp')index=current-grid.columns;else if(event.key==='ArrowDown')index=current+grid.columns;else return;
  event.preventDefault();if(last>=0)onSelect(resources[Math.max(0,Math.min(last,index))].id);
 };
 const activeVisible=selectedIndex>=grid.start&&selectedIndex<grid.end;
 return <div ref={viewport} className="resource-grid-viewport" role="listbox" aria-label="Ресурсы проекта" aria-activedescendant={activeVisible?`${prefix}-${selectedIndex}`:undefined} tabIndex={0} onKeyDown={keyboard} onScroll={event=>{const top=event.currentTarget.scrollTop;setBounds(old=>old.top===top?old:{...old,top});}}>
  {resources.length?<div className="resource-grid" style={{height:grid.totalHeight}}>{resources.slice(grid.start,grid.end).map((resource,offset)=>{const index=grid.start+offset;return <button key={resource.id} id={`${prefix}-${index}`} className={`resource-card ${resource.id===selectedId?'active':''}`} role="option" aria-selected={resource.id===selectedId} aria-posinset={index+1} aria-setsize={resources.length} tabIndex={-1} style={{width:grid.cellWidth,left:grid.padding+(index%grid.columns)*(grid.cellWidth+grid.gap),top:grid.padding+Math.floor(index/grid.columns)*grid.rowHeight}} onPointerDown={event=>{if(event.button===0){event.preventDefault();viewport.current.focus({preventScroll:true});}}} onClick={()=>onSelect(resource.id)}>{renderCard(resource)}</button>;})}</div>:<div className="resource-search-empty"><strong>Ничего не найдено</strong><p>Измените запрос или добавьте файлы.</p></div>}
 </div>;
}
