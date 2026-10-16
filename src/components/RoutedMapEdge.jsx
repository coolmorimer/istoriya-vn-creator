import {useRef} from 'react';
import {createPortal} from 'react-dom';
export function RoutedMapEdge({edge,geometry,selected,ariaLabel,onSelect,onDelete,marker,showLabel=true,labelLayer}){
 const group=useRef(null);
 if(!geometry)return null;
 const {d,labelBox,labelText,labelLeader}=geometry;
 const tag=showLabel&&<>{labelLeader&&<path d={labelLeader} className="graph-label-leader"/>}<g data-map-label={edge.id} className={`graph-edge-label ${selected?'selected':''} ${geometry.blocked?'blocked':''}`} aria-hidden="true" onPointerDown={event=>event.stopPropagation()} onClick={event=>{event.stopPropagation();group.current?.focus?.({preventScroll:true});onSelect();}}><rect x={labelBox.left} y={labelBox.top} width={labelBox.right-labelBox.left} height={labelBox.bottom-labelBox.top} rx="4"/><text x={geometry.labelX} y={geometry.labelY} textAnchor="middle">{labelText}</text></g></>,floating=labelLayer?.isConnected;
 return <><g ref={group} data-map-edge={edge.id} data-route-blocked={geometry.blocked?'true':'false'} className={`graph-edge ${selected?'selected':''} ${edge.kind==='implicit'?'implicit':''} ${geometry.blocked?'graph-edge-blocked':''}`} role="button" tabIndex={0} aria-label={`${ariaLabel}${geometry.blocked?' — Связь перекрыта. Раздвиньте карточки.':''}`} onClick={event=>{event.stopPropagation();onSelect();}} onKeyDown={event=>{if(event.ctrlKey||event.metaKey||event.altKey||event.shiftKey)return;if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();onSelect();}else if(event.key==='Delete'&&onDelete){event.preventDefault();event.stopPropagation();onDelete();}}}>
  <title>{ariaLabel}{geometry.blocked?' — Раздвиньте карточки: выход или вход перекрыт.':''}</title><path className="graph-edge-hit" d={d}/><path className="graph-edge-line" d={d} markerEnd={marker?`url(#${marker})`:undefined}/>
  {!floating&&tag}
 </g>{floating&&createPortal(tag,labelLayer)}</>;
}
