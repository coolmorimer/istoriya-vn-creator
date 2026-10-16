import { useCallback, useEffect, useMemo, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useProjectStore } from '../store/projectStore.js';
import {sceneMapIndex} from '../domain/graphViewport.js';
import {routeGraphEdges,graphContentBounds} from '../domain/edgeRouting.js';
import {RoutedMapEdge} from './RoutedMapEdge.jsx';
import { chapterEntry } from '../../runtime/story-routing.mjs';
import { MapExitRules } from './MapExitRules.jsx';
import {useGraphDialog} from './useGraphDialog.js';

import {StoryDestinationField} from './StoryDestinationField.jsx';

export function ChapterMap({ onScenes }) {
  const { project, updateChapter, addChapter, addScene, connectScenes, updateExit, removeExit, undo, redo, past, future } = useProjectStore();
  const [selectedId,setSelected] = useState(project.chapters[0]?.id);
  const targetLocation=useProjectStore(s=>s.navigationTarget),navigationRequest=useProjectStore(s=>s.navigationRequest);
  useEffect(()=>{if(targetLocation?.kind==='chapter'&&targetLocation.projectId===project.id){setSelected(targetLocation.id);setEdge(null);}},[navigationRequest,targetLocation,project.id]);
  const [edgeId,setEdge] = useState(null),[labelLayer,setLabelLayer]=useState(null);
  const [source,setSource] = useState('');
  const [target,setTarget] = useState({sceneId:null,chapterId:null});
  const [error,setError] = useState('');
  const [scale,setScale] = useState(1);
  const [expanded,setExpanded] = useState(false);
  const [moving,setMoving] = useState(null);
  const viewport = useRef(null), drag = useRef(null);
  const root=useRef(null),closeExpanded=useCallback(()=>setExpanded(false),[]);
  useGraphDialog(expanded,root,closeExpanded);
  const selected = project.chapters.find(c => c.id === selectedId) ?? project.chapters[0];
  useEffect(()=>setTarget({sceneId:null,chapterId:null}),[selected?.id]);
  const index=useMemo(()=>sceneMapIndex(project),[project]),owner=id=>index.owners.get(id);
  const edges=useMemo(()=>index.edges.filter(e=>owner(e.from)&&owner(e.to)&&(owner(e.from).id!==owner(e.to).id||e.chapterId)),[index]);
  const edge = edges.find(e => e.id === edgeId);
  const positions=useMemo(()=>Object.fromEntries(project.chapters.map((c,i)=>[c.id,moving?.id===c.id?moving.position:c.mapPosition??{x:60+i%3*330,y:70+Math.floor(i/3)*220}])),[project.chapters,moving]);
  const geometry=useMemo(()=>{const nodes=Object.entries(positions).map(([id,p])=>({id,...p,width:260,height:140})),mapped=edges.map(e=>({...e,from:owner(e.from).id,to:owner(e.to).id,label:`${project.scenes[e.from]?.title} · ${e.label}`}));return routeGraphEdges(nodes,mapped);},[positions,edges,index]);
  const blockedCount=[...geometry.values()].filter(g=>g.blocked).length,marker=`chapter-arrow-${useId().replace(/[^a-z0-9]/gi,'')}`;
  const width=Math.max(1200,...Object.values(positions).map(p=>p.x+400),...[...geometry.values()].map(g=>g.bounds.right+60)),height=Math.max(800,...Object.values(positions).map(p=>p.y+300),...[...geometry.values()].map(g=>g.bounds.bottom+60));
  const run = fn => {try {fn();setError('');} catch(e){setError(e.message);}};
  const zoom = (next, anchor) => {
    const el=viewport.current; if(!el)return;
    next=Math.min(3,Math.max(.02,next));
    const x=anchor?.x ?? el.clientWidth/2,y=anchor?.y ?? el.clientHeight/2;
    const wx=(el.scrollLeft+x)/scale,wy=(el.scrollTop+y)/scale;
    setScale(next);requestAnimationFrame(()=>{el.scrollLeft=wx*next-x;el.scrollTop=wy*next-y;});
  };
  useEffect(()=>{const el=viewport.current;const wheel=e=>{e.preventDefault();const r=el.getBoundingClientRect();zoom(scale*Math.exp(-e.deltaY*.0015),{x:e.clientX-r.left,y:e.clientY-r.top});};el?.addEventListener('wheel',wheel,{passive:false});return()=>el?.removeEventListener('wheel',wheel);},[scale,expanded]);
  const fit=()=>{const el=viewport.current;if(!el)return;const b=graphContentBounds(Object.entries(positions).map(([id,p])=>({id,...p,width:260,height:140})),geometry.values()),next=Math.min(1,(el.clientWidth-60)/(b.right-b.left+60),(el.clientHeight-60)/(b.bottom-b.top+60));setScale(Math.max(.02,next));requestAnimationFrame(()=>{el.scrollLeft=Math.max(0,b.left*Math.max(.02,next)-30);el.scrollTop=Math.max(0,b.top*Math.max(.02,next)-30);});};
  const content=<section ref={root} className="story-graph" aria-label="Карта глав">
    <header className="graph-toolbar"><button className="graph-primary" onClick={()=>{const id=addChapter();setSelected(id);setEdge(null);}}>+ Новая глава</button><button onClick={fit}>Показать всё</button><button aria-label="Уменьшить главы" onClick={()=>zoom(scale/1.2)}>−</button><input aria-label="Масштаб карты глав" type="range" min="2" max="300" value={Math.round(scale*100)} onChange={e=>zoom(Number(e.target.value)/100)}/><button onClick={()=>zoom(1)}>{Math.round(scale*100)}%</button><button aria-label="Увеличить главы" onClick={()=>zoom(scale*1.2)}>+</button><button disabled={!past.length} onClick={undo}>↶</button><button disabled={!future.length} onClick={redo}>↷</button><button className="graph-expand" onClick={()=>setExpanded(!expanded)}>{expanded?'Свернуть':'На весь экран'}</button></header>
    <div className={`graph-hint ${blockedCount?'graph-route-warning':''}`} role="status">{error || (blockedCount?`Перекрыты выходы или входы у ${blockedCount} связей. Раздвиньте наложенные карточки.`: 'Колесо — приблизить/отдалить под курсором. Тяните свободное поле. Выберите главу или переход для настройки.')}</div>
    <div className="graph-body"><div className="graph-viewport" ref={viewport} onPointerDown={e=>{if(e.button!==0||e.target.closest('.graph-node,.graph-edge'))return;drag.current={pan:true,x:e.clientX,y:e.clientY,left:e.currentTarget.scrollLeft,top:e.currentTarget.scrollTop};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{const d=drag.current;if(!d)return;if(d.pan){viewport.current.scrollLeft=d.left-e.clientX+d.x;viewport.current.scrollTop=d.top-e.clientY+d.y;}else {d.current={x:Math.max(20,d.position.x+(e.clientX-d.x)/scale),y:Math.max(20,d.position.y+(e.clientY-d.y)/scale)};setMoving({id:d.id,position:d.current});}}} onPointerUp={()=>{const d=drag.current;if(d&&!d.pan&&d.current)updateChapter(d.id,{mapPosition:d.current});drag.current=null;setMoving(null);}} onPointerCancel={()=>{drag.current=null;setMoving(null);}}>
      <div className="graph-spacer" style={{width:width*scale,height:height*scale}}><div className="graph-world" style={{width,height,transform:`scale(${scale})`}}>
        <svg className="graph-lines" width={width} height={height}><defs><marker id={marker} markerWidth="9" markerHeight="9" refX="8" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" fill="none" stroke="currentColor" strokeWidth="1.5"/></marker></defs>{[...edges].sort((a,b)=>(a.id===edgeId)-(b.id===edgeId)).map(e=><RoutedMapEdge key={e.id} edge={e} geometry={geometry.get(e.id)} labelLayer={labelLayer} selected={edgeId===e.id} marker={marker} showLabel={scale>=.5} onDelete={()=>{removeExit(e);setEdge(null);}} ariaLabel={`Переход ${owner(e.from).title} → ${owner(e.to).title}: ${e.label} · ${project.scenes[e.from]?.title}`} onSelect={()=>{setEdge(e.id);setSelected(owner(e.from).id);}}/>) }<g className="graph-labels" ref={setLabelLayer}/></svg>
        {project.chapters.map(c=><article key={c.id} data-map-chapter={c.id} className={`graph-node ${selected?.id===c.id?'selected':''}`} style={{left:positions[c.id].x,top:positions[c.id].y,width:260,height:140}}><button className="graph-node-title" onPointerDown={e=>{e.stopPropagation();drag.current={id:c.id,x:e.clientX,y:e.clientY,position:positions[c.id]};viewport.current.setPointerCapture(e.pointerId);setSelected(c.id);setEdge(null);}} onClick={()=>{setSelected(c.id);setEdge(null);setSource('');}}><small>{c.storyline || 'Основная линия'}</small><strong>{c.title}</strong><span>{c.scenes.length} сцен · вход: {project.scenes[chapterEntry(project,c.id)]?.title || 'не задан'}</span></button><footer><button onClick={()=>onScenes(c.id)}>Открыть карту сцен →</button></footer></article>)}
      </div></div>
    </div><aside className="graph-properties" data-editor-location={JSON.stringify(['chapter',selected?.id])}>{selected && <><h3>{edge?'Переход между главами':'Настройки главы'}</h3>{edge?<><p>Из сцены «{project.scenes[edge.from]?.title}»</p>{['choice','prop'].includes(edge.kind)&&<label>Подпись выбора<input value={edge.label} onChange={e=>updateExit(edge,{label:e.target.value})}/></label>}<StoryDestinationField key={`destination:${edge.id}`} project={project} label="Куда перейти" allowEmpty={edge.kind!=='implicit'} value={{sceneId:edge.to,chapterId:edge.chapterId}} onChange={value=>run(()=>updateExit(edge,{to:value}))}/><MapExitRules key={edge.id} project={project} edge={edge} onChange={patch=>run(()=>updateExit(edge,patch))}/><button onClick={()=>{removeExit(edge);setEdge(null);}}>Удалить переход</button><button onClick={()=>setEdge(null)}>К настройкам главы</button></>:<><label>Название главы<input value={selected.title} onChange={e=>updateChapter(selected.id,{title:e.target.value})}/></label><label>Сюжетная линия<input placeholder="Например: Анна / Борис" value={selected.storyline??''} onChange={e=>updateChapter(selected.id,{storyline:e.target.value})}/></label><StoryDestinationField key={`entry:${selected.id}`} project={project} label="Входная сцена" value={{sceneId:chapterEntry(project,selected.id)}} allowChapters={false} withinChapterId={selected.id} allowEmpty={false} emptyLabel="Добавьте сцену" onChange={({sceneId})=>updateChapter(selected.id,{entrySceneId:sceneId})}/><button onClick={()=>addScene(selected.id,{open:false})}>+ Сцена в этой главе</button><button onClick={()=>onScenes(selected.id)}>Настроить карту сцен</button><h4>Новый переход</h4><StoryDestinationField key={`source:${selected.id}`} project={project} label="Из какой сцены" value={{sceneId:selected.scenes.includes(source)?source:selected.scenes.at(-1)}} allowChapters={false} withinChapterId={selected.id} allowEmpty={false} emptyLabel="Добавьте сцену" onChange={({sceneId})=>setSource(sceneId)}/><StoryDestinationField key={`target:${selected.id}`} project={project} label="В главу или сцену" value={target} onChange={setTarget}/><button disabled={(!target.sceneId&&!target.chapterId)||!selected.scenes.length} onClick={()=>run(()=>{connectScenes(selected.scenes.includes(source)?source:selected.scenes.at(-1),target);setTarget({sceneId:null,chapterId:null});})}>Создать переход</button><p>Первый переход переключает повествование. Второй создаёт выбор игрока. Для схождения направьте разные ветки в одну сцену или главу. Переменные и флаги сохраняются при переключении линий.</p><h4>Переходы главы</h4>{edges.filter(e=>owner(e.from).id===selected.id).map(e=><button className="graph-exit" key={e.id} onClick={()=>setEdge(e.id)}>{project.scenes[e.from]?.title} → {owner(e.to)?.title}<small>{e.label}</small></button>)}</>}</>}</aside></div>
  </section>;
  return expanded?createPortal(<div className="graph-fullscreen" role="dialog" aria-modal="true" aria-label="Карта глав на весь экран">{content}</div>,document.body):content;
}
