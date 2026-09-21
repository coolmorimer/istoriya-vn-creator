import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useProjectStore } from '../store/projectStore.js';
import { sceneExits } from '../domain/storyGraph.js';
import { chapterEntry } from '../../runtime/story-routing.mjs';

export function DestinationOptions({ project }) {
  return <><optgroup label="Главы — входная сцена">{project.chapters.map(c => <option key={c.id} value={`chapter:${c.id}`} disabled={!chapterEntry(project,c.id)}>{c.title}{!c.scenes.length ? ' (пустая)' : ''}</option>)}</optgroup>{project.chapters.map(c => <optgroup key={c.id} label={`Сцены · ${c.title}`}>{c.scenes.map(id => <option key={id} value={id}>{project.scenes[id]?.title}</option>)}</optgroup>)}</>;
}

export function ChapterMap({ onScenes }) {
  const { project, updateChapter, addChapter, addScene, connectScenes, updateExit, removeExit, undo, redo, past, future } = useProjectStore();
  const [selectedId,setSelected] = useState(project.chapters[0]?.id);
  const [edgeId,setEdge] = useState(null);
  const [source,setSource] = useState('');
  const [target,setTarget] = useState('');
  const [error,setError] = useState('');
  const [scale,setScale] = useState(1);
  const [expanded,setExpanded] = useState(false);
  const [moving,setMoving] = useState(null);
  const viewport = useRef(null), drag = useRef(null);
  const selected = project.chapters.find(c => c.id === selectedId) ?? project.chapters[0];
  const owner = id => project.chapters.find(c => c.scenes.includes(id));
  const edges = Object.values(project.scenes).flatMap(s => sceneExits(project,s.id)).filter(e => owner(e.from) && owner(e.to) && (owner(e.from).id !== owner(e.to).id || e.chapterId));
  const edge = edges.find(e => e.id === edgeId);
  const positions = Object.fromEntries(project.chapters.map((c,i) => [c.id,moving?.id === c.id ? moving.position : c.mapPosition ?? {x:60 + i % 3 * 330,y:70 + Math.floor(i/3)*220}]));
  const width = Math.max(1200,...Object.values(positions).map(p=>p.x+400)), height = Math.max(800,...Object.values(positions).map(p=>p.y+300));
  const run = fn => {try {fn();setError('');} catch(e){setError(e.message);}};
  const zoom = (next, anchor) => {
    const el=viewport.current; if(!el)return;
    next=Math.min(3,Math.max(.1,next));
    const x=anchor?.x ?? el.clientWidth/2,y=anchor?.y ?? el.clientHeight/2;
    const wx=(el.scrollLeft+x)/scale,wy=(el.scrollTop+y)/scale;
    setScale(next);requestAnimationFrame(()=>{el.scrollLeft=wx*next-x;el.scrollTop=wy*next-y;});
  };
  useEffect(()=>{const el=viewport.current;const wheel=e=>{e.preventDefault();const r=el.getBoundingClientRect();zoom(scale*Math.exp(-e.deltaY*.0015),{x:e.clientX-r.left,y:e.clientY-r.top});};el?.addEventListener('wheel',wheel,{passive:false});return()=>el?.removeEventListener('wheel',wheel);},[scale,expanded]);
  const fit=()=>{const el=viewport.current;if(!el)return;zoom(Math.min(1,(el.clientWidth-80)/(Math.max(...Object.values(positions).map(p=>p.x+260))+60),(el.clientHeight-80)/(Math.max(...Object.values(positions).map(p=>p.y+140))+60)));requestAnimationFrame(()=>{el.scrollLeft=0;el.scrollTop=0;});};
  const content=<section className="story-graph" aria-label="Карта глав">
    <header className="graph-toolbar"><button className="graph-primary" onClick={()=>{const id=addChapter();setSelected(id);setEdge(null);}}>+ Новая глава</button><button onClick={fit}>Показать всё</button><button aria-label="Уменьшить главы" onClick={()=>zoom(scale/1.2)}>−</button><input aria-label="Масштаб карты глав" type="range" min="10" max="300" value={Math.round(scale*100)} onChange={e=>zoom(Number(e.target.value)/100)}/><button onClick={()=>zoom(1)}>{Math.round(scale*100)}%</button><button aria-label="Увеличить главы" onClick={()=>zoom(scale*1.2)}>+</button><button disabled={!past.length} onClick={undo}>↶</button><button disabled={!future.length} onClick={redo}>↷</button><button className="graph-expand" onClick={()=>setExpanded(!expanded)}>{expanded?'Свернуть':'На весь экран'}</button></header>
    <div className="graph-hint" role="status">{error || 'Колесо — приблизить/отдалить под курсором. Тяните свободное поле. Выберите главу или переход для настройки.'}</div>
    <div className="graph-body"><div className="graph-viewport" ref={viewport} onPointerDown={e=>{if(e.button!==0||e.target.closest('.graph-node,.graph-edge'))return;drag.current={pan:true,x:e.clientX,y:e.clientY,left:e.currentTarget.scrollLeft,top:e.currentTarget.scrollTop};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{const d=drag.current;if(!d)return;if(d.pan){viewport.current.scrollLeft=d.left-e.clientX+d.x;viewport.current.scrollTop=d.top-e.clientY+d.y;}else {d.current={x:Math.max(20,d.position.x+(e.clientX-d.x)/scale),y:Math.max(20,d.position.y+(e.clientY-d.y)/scale)};setMoving({id:d.id,position:d.current});}}} onPointerUp={()=>{const d=drag.current;if(d&&!d.pan&&d.current)updateChapter(d.id,{mapPosition:d.current});drag.current=null;setMoving(null);}} onPointerCancel={()=>{drag.current=null;setMoving(null);}}>
      <div className="graph-spacer" style={{width:width*scale,height:height*scale}}><div className="graph-world" style={{width,height,transform:`scale(${scale})`}}>
        <svg className="graph-lines" width={width} height={height}>{edges.map(e=>{const a=positions[owner(e.from).id],b=positions[owner(e.to).id];const d=`M${a.x+260},${a.y+70} C${a.x+350},${a.y+70} ${b.x-90},${b.y+70} ${b.x},${b.y+70}`;return <g key={e.id} className={`graph-edge ${edgeId===e.id?'selected':''} ${e.kind==='implicit'?'implicit':''}`} role="button" tabIndex={0} aria-label={`Переход ${owner(e.from).title} → ${owner(e.to).title}: ${e.label}`} onClick={()=>{setEdge(e.id);setSelected(owner(e.from).id);}} onKeyDown={ev=>{if(ev.key==='Enter'){setEdge(e.id);setSelected(owner(e.from).id);}}}><path d={d} className="graph-edge-hit"/><path d={d} className="graph-edge-line"/><text x={(a.x+b.x+260)/2} y={(a.y+b.y)/2+55} textAnchor="middle">{e.label} →</text></g>;})}</svg>
        {project.chapters.map(c=><article key={c.id} className={`graph-node ${selected?.id===c.id?'selected':''}`} style={{left:positions[c.id].x,top:positions[c.id].y,width:260,height:140}}><button className="graph-node-title" onPointerDown={e=>{e.stopPropagation();drag.current={id:c.id,x:e.clientX,y:e.clientY,position:positions[c.id]};viewport.current.setPointerCapture(e.pointerId);setSelected(c.id);setEdge(null);}} onClick={()=>{setSelected(c.id);setEdge(null);setSource('');}}><small>{c.storyline || 'Основная линия'}</small><strong>{c.title}</strong><span>{c.scenes.length} сцен · вход: {project.scenes[chapterEntry(project,c.id)]?.title || 'не задан'}</span></button><footer><button onClick={()=>onScenes(c.id)}>Открыть карту сцен →</button></footer></article>)}
      </div></div>
    </div><aside className="graph-properties">{selected && <><h3>{edge?'Переход между главами':'Настройки главы'}</h3>{edge?<><p>Из сцены «{project.scenes[edge.from]?.title}»</p>{edge.kind==='choice'&&<label>Подпись выбора<input value={edge.label} onChange={e=>updateExit(edge,{label:e.target.value})}/></label>}<label>Куда перейти<select value={edge.chapterId?`chapter:${edge.chapterId}`:edge.to??''} onChange={e=>run(()=>updateExit(edge,{to:e.target.value}))}><DestinationOptions project={project}/></select></label><button onClick={()=>{removeExit(edge);setEdge(null);}}>Удалить переход</button><button onClick={()=>setEdge(null)}>К настройкам главы</button></>:<><label>Название главы<input value={selected.title} onChange={e=>updateChapter(selected.id,{title:e.target.value})}/></label><label>Сюжетная линия<input placeholder="Например: Анна / Борис" value={selected.storyline??''} onChange={e=>updateChapter(selected.id,{storyline:e.target.value})}/></label><label>Входная сцена<select value={chapterEntry(project,selected.id)??''} onChange={e=>updateChapter(selected.id,{entrySceneId:e.target.value})}><option value="" disabled>Добавьте сцену</option>{selected.scenes.map(id=><option key={id} value={id}>{project.scenes[id]?.title}</option>)}</select></label><button onClick={()=>addScene(selected.id,{open:false})}>+ Сцена в этой главе</button><button onClick={()=>onScenes(selected.id)}>Настроить карту сцен</button><h4>Новый переход</h4><label>Из какой сцены<select value={selected.scenes.includes(source)?source:selected.scenes.at(-1)??''} onChange={e=>setSource(e.target.value)}><option value="" disabled>Добавьте сцену</option>{selected.scenes.map(id=><option key={id} value={id}>{project.scenes[id]?.title}</option>)}</select></label><label>В главу или сцену<select value={target} onChange={e=>setTarget(e.target.value)}><option value="">Выберите назначение</option><DestinationOptions project={project}/></select></label><button disabled={!target||!selected.scenes.length} onClick={()=>run(()=>{connectScenes(selected.scenes.includes(source)?source:selected.scenes.at(-1),target);setTarget('');})}>Создать переход</button><p>Первый переход переключает повествование. Второй создаёт выбор игрока. Для схождения направьте разные ветки в одну сцену или главу. Переменные и флаги сохраняются при переключении линий.</p><h4>Переходы главы</h4>{edges.filter(e=>owner(e.from).id===selected.id).map(e=><button className="graph-exit" key={e.id} onClick={()=>setEdge(e.id)}>{project.scenes[e.from]?.title} → {owner(e.to)?.title}<small>{e.label}</small></button>)}</>}</>}</aside></div>
  </section>;
  return expanded?createPortal(<div className="graph-fullscreen" role="dialog" aria-label="Карта глав на весь экран">{content}</div>,document.body):content;
}
