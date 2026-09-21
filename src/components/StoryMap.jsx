import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowsOut, ArrowRight, Check, Minus, Plus, Trash, X } from "@phosphor-icons/react";
import { useProjectStore } from "../store/projectStore.js";
import { sceneExits, sceneOrder } from "../domain/storyGraph.js";
import "./story-map.css";
import { ChapterMap, DestinationOptions } from "./ChapterMap.jsx";

const NODE_W = 230, NODE_H = 126;

export function StoryMap() {
  const [mode,setMode] = useState("scenes");
  const [chapter,setChapter] = useState("");
  return <div className="hierarchy-map"><nav className="story-workspace-tabs"><button className={mode==="chapters"?"active":""} onClick={()=>setMode("chapters")}>Карта глав</button><button className={mode==="scenes"?"active":""} onClick={()=>setMode("scenes")}>Карта сцен</button></nav>{mode==="chapters"?<ChapterMap onScenes={id=>{setChapter(id);setMode("scenes");}}/>:<SceneMap chapterFilter={chapter} onChapterFilter={setChapter}/>}</div>;
}
function SceneMap({chapterFilter,onChapterFilter}) {
  const { project, activeSceneId, updateScene, setActiveScene, addScene, removeScene, connectScenes, updateExit, removeExit, arrangeMap, moveSceneToChapter, undo, redo, past, future } = useProjectStore();
  const [selectedId, setSelectedId] = useState(activeSceneId);
  const [edgeId, setEdgeId] = useState(null);
  const [connect, setConnect] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [scale, setScale] = useState(1);
  const [drag, setDrag] = useState(null);
  const [message, setMessage] = useState("");
  const [destination, setDestination] = useState("");
  const viewport = useRef(null);
  const dragRef = useRef(null);
  const wireStart = useRef(null);
  const marker = `map-arrow-${useId().replace(/[^a-z0-9]/gi, "")}`;
  const ids = sceneOrder(project).filter(id=>!chapterFilter || project.chapters.find(c=>c.id===chapterFilter)?.scenes.includes(id));
  const selected = project.scenes[selectedId] ?? project.scenes[ids[0]];
  const positions = Object.fromEntries(ids.map((id, index) => [id, drag?.id === id ? drag.position : project.scenes[id].mapPosition ?? { x: 50 + index % 3 * 300, y: 50 + Math.floor(index / 3) * 200 }]));
  const edges = useMemo(() => sceneOrder(project).flatMap((id) => sceneExits(project, id)), [project]);
  const edge = edges.find((item) => item.id === edgeId);
  const exits = selected ? sceneExits(project, selected.id) : [];
  const width = Math.max(900, ...Object.values(positions).map((pos) => pos.x + NODE_W + 160));
  const height = Math.max(500, ...Object.values(positions).map((pos) => pos.y + NODE_H + 160));
  const perform = (operation) => { try { operation(); setMessage(""); } catch (error) { setMessage(error.message); } };
  const finishConnection = (target) => {
    if (!connect) return;
    perform(() => connect.edge ? updateExit(connect.edge, { to: target }) : connectScenes(connect.from, target));
    setSelectedId(connect.from); setEdgeId(null); setConnect(null); wireStart.current = null;
  };
  useEffect(() => {
    if (!connect) return;
    const release = (event) => {
      if (!wireStart.current) return;
      const delta = Math.hypot(event.clientX - wireStart.current.x, event.clientY - wireStart.current.y);
      if (delta < 8) return;
      const node = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-map-scene]");
      if (node && viewport.current?.contains(node)) finishConnection(node.dataset.mapScene);
      wireStart.current = null;
    };
    document.addEventListener("pointerup", release);
    return () => document.removeEventListener("pointerup", release);
  }, [connect, project]);
  const zoom = (value, anchor) => {
    const el = viewport.current;
    const next = Math.max(.1, Math.min(3, value));
    const x = el ? (el.scrollLeft + (anchor?.x ?? el.clientWidth / 2)) / scale : 0;
    const y = el ? (el.scrollTop + (anchor?.y ?? el.clientHeight / 2)) / scale : 0;
    setScale(next);
    requestAnimationFrame(() => { if (el) { el.scrollLeft = x * next - (anchor?.x ?? el.clientWidth / 2); el.scrollTop = y * next - (anchor?.y ?? el.clientHeight / 2); } });
  };
  const fit = () => {
    const el = viewport.current;
    if (!el) return;
    const currentProject = useProjectStore.getState().project;
    const values = sceneOrder(currentProject).filter(id=>!chapterFilter || currentProject.chapters.find(c=>c.id===chapterFilter)?.scenes.includes(id)).map((id, index) => currentProject.scenes[id].mapPosition ?? { x: 50 + index % 3 * 300, y: 50 + Math.floor(index / 3) * 200 });
    const minX = Math.min(...values.map((p) => p.x), 50), minY = Math.min(...values.map((p) => p.y), 50);
    const maxX = Math.max(...values.map((p) => p.x + NODE_W)), maxY = Math.max(...values.map((p) => p.y + NODE_H));
    const next = Math.max(.1, Math.min(1.2, (el.clientWidth - 60) / (maxX - minX + 60), (el.clientHeight - 60) / (maxY - minY + 60)));
    setScale(next);
    requestAnimationFrame(() => { el.scrollLeft = Math.max(0, minX * next - 30); el.scrollTop = Math.max(0, minY * next - 30); });
  };
  useEffect(() => {
    const el = viewport.current;
    const wheel = (event) => { event.preventDefault(); const rect=el.getBoundingClientRect(); zoom(scale*Math.exp(-event.deltaY*.0015), {x:event.clientX-rect.left,y:event.clientY-rect.top}); };
    el?.addEventListener("wheel", wheel, { passive: false });
    return () => el?.removeEventListener("wheel", wheel);
  }, [scale, expanded]);
  const startDrag = (event, id) => {
    if (event.button !== 0 || connect) return;
    event.stopPropagation(); event.preventDefault();
    setSelectedId(id); setEdgeId(null);
    const position = positions[id];
    dragRef.current = { id, startX: event.clientX, startY: event.clientY, position, current: position };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveDrag = (event) => {
    const current = dragRef.current;
    if (!current) return;
    const position = { x: Math.max(20, current.position.x + (event.clientX - current.startX) / scale), y: Math.max(20, current.position.y + (event.clientY - current.startY) / scale) };
    current.current = position; setDrag({ id: current.id, position });
  };
  const endDrag = (event) => {
    const current = dragRef.current;
    if (!current) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (Math.hypot(current.current.x - current.position.x, current.current.y - current.position.y) > 1) updateScene(current.id, { mapPosition: current.current });
    dragRef.current = null; setDrag(null);
  };
  const pan = useRef(null);
  const startPan = (event) => {
    if (event.button !== 0 || event.target.closest(".graph-node,.graph-edge")) return;
    const el = viewport.current;
    pan.current = { x: event.clientX, y: event.clientY, left: el.scrollLeft, top: el.scrollTop };
    el.setPointerCapture(event.pointerId);
  };
  const add = () => {
    const chapterId = chapterFilter || project.chapters.find((chapter) => chapter.scenes.includes(selected?.id))?.id;
    const id = addScene(chapterId, { open: false });
    setSelectedId(id); setEdgeId(null); setMessage("Сцена добавлена. Задайте название и соедините её с другой сценой.");
  };
  const open = (id, actionId) => {
    setExpanded(false); setActiveScene(id); useProjectStore.getState().setBottomTab("scenario");
    if (actionId) useProjectStore.getState().setActiveAction(actionId);
  };
  const startConnection = (from, existing, event) => {
    event?.stopPropagation();
    if (event) wireStart.current = { x: event.clientX, y: event.clientY };
    setConnect({ from, edge: existing }); setSelectedId(from); setMessage("");
  };
  const content = <section className={`story-graph ${expanded ? "graph-expanded" : ""}`} aria-label="Редактор карты сюжета" onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setConnect(null); setExpanded(false); } }}>
    <header className="graph-toolbar"><select aria-label="Фильтр главы" value={chapterFilter} onChange={e=>onChapterFilter(e.target.value)}><option value="">Все главы</option>{project.chapters.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select><button className="graph-primary" onClick={add}><Plus />Новая сцена</button><button onClick={() => { arrangeMap(); requestAnimationFrame(fit); }}>Упорядочить</button><button onClick={fit}>Показать всё</button><div className="graph-zoom"><button aria-label="Уменьшить карту" onClick={() => zoom(scale - .1)}><Minus /></button><input aria-label="Масштаб карты сцен" type="range" min="10" max="300" value={Math.round(scale*100)} onChange={e=>zoom(Number(e.target.value)/100)}/><button onClick={()=>zoom(1)}>{Math.round(scale * 100)}%</button><button aria-label="Увеличить карту" onClick={() => zoom(scale + .1)}><Plus /></button></div><button disabled={!past.length} onClick={undo} title="Отменить изменение карты">↶</button><button disabled={!future.length} onClick={redo} title="Повторить изменение карты">↷</button><button className="graph-expand" onClick={() => setExpanded(!expanded)} aria-label={expanded ? "Свернуть карту" : "Развернуть карту"}>{expanded ? <X /> : <ArrowsOut />}<span>{expanded ? "Свернуть" : "На весь экран"}</span></button></header>
    <div className={`graph-hint ${connect ? "connecting" : ""}`} role="status">{connect ? <><strong>Выберите сцену назначения</strong><span>Нажмите карточку или входной кружок. Можно протянуть связь мышью.</span><button onClick={() => setConnect(null)}>Отмена</button></> : <span>{message || "Нажмите сцену или линию — свойства справа. Перетаскивайте карточки и свободное поле. Колесо — масштаб под курсором."}</span>}</div>
    <div className="graph-body"><div className="graph-viewport" ref={viewport} onPointerDown={startPan} onPointerMove={(event) => { if (pan.current) { viewport.current.scrollLeft = pan.current.left - (event.clientX - pan.current.x); viewport.current.scrollTop = pan.current.top - (event.clientY - pan.current.y); } }} onPointerUp={(event) => { if (pan.current) { pan.current = null; event.currentTarget.releasePointerCapture?.(event.pointerId); } }} onPointerCancel={() => { pan.current = null; }}>
      <div className="graph-spacer" style={{ width: width * scale, height: height * scale }}><div className="graph-world" style={{ width, height, transform: `scale(${scale})` }}>
        <svg className="graph-lines" width={width} height={height}><defs><marker id={marker} markerWidth="9" markerHeight="9" refX="8" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" fill="none" stroke="currentColor" strokeWidth="1.5" /></marker></defs>{edges.filter((item) => positions[item.from] && positions[item.to]).map((item) => {
          const a = positions[item.from], b = positions[item.to];
          const siblings = sceneExits(project, item.from), offset = (siblings.findIndex((e) => e.id === item.id) - (siblings.length - 1) / 2) * 16;
          const x1 = a.x + NODE_W, y1 = a.y + NODE_H / 2 + offset, x2 = b.x, y2 = b.y + NODE_H / 2;
          const bend = Math.max(70, Math.abs(x2 - x1) * .5);
          const d = item.from === item.to ? `M${x1},${y1} C${x1+100},${y1-180} ${x2-100},${y2-180} ${x2},${y2}` : `M${x1},${y1} C${x1+bend},${y1} ${x2-bend},${y2} ${x2},${y2}`;
          return <g key={item.id} className={`graph-edge ${edgeId === item.id ? "selected" : ""} ${item.kind === "implicit" ? "implicit" : ""}`} role="button" tabIndex={0} aria-label={`Связь: ${project.scenes[item.from].title} → ${project.scenes[item.to].title}, ${item.label}`} onClick={(event) => { event.stopPropagation(); setEdgeId(item.id); setSelectedId(item.from); setConnect(null); }} onKeyDown={(event) => { if (event.key === "Enter") { setEdgeId(item.id); setSelectedId(item.from); } }}><path className="graph-edge-hit" d={d} /><path className="graph-edge-line" d={d} markerEnd={`url(#${marker})`} /><text x={(x1+x2)/2} y={(y1+y2)/2-12} textAnchor="middle">{item.label.length > 22 ? `${item.label.slice(0,22)}…` : item.label}</text></g>;
        })}</svg>
        {ids.map((id, index) => { const scene = project.scenes[id], pos = positions[id]; const chapter = project.chapters.find((item) => item.scenes.includes(id)); return <article key={id} data-map-scene={id} className={`graph-node ${selected?.id === id ? "selected" : ""} ${connect ? "connection-target" : ""}`} style={{ left: pos.x, top: pos.y, width: NODE_W, height: NODE_H }}>
          <button className="graph-port graph-input" aria-label={`Вход в сцену ${scene.title}`} title="Соединить с этой сценой" onClick={() => connect ? finishConnection(id) : setSelectedId(id)} />
          <button className="graph-node-title" onPointerDown={(event) => startDrag(event, id)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={() => { dragRef.current=null;setDrag(null); }} onClick={() => connect ? finishConnection(id) : (setSelectedId(id),setEdgeId(null))} onDoubleClick={() => !connect && open(id)}><small>{index === 0 ? "НАЧАЛО ИГРЫ" : chapter?.title} · {scene.number}</small><strong>{scene.title}</strong><span>{scene.storyline ? `${scene.storyline} · ` : ""}{scene.actions.length} действий · {sceneExits(project,id).length} переходов</span></button>
          <footer><button onClick={() => open(id)}>Открыть сцену <ArrowRight /></button><button className="graph-port graph-output" aria-label={`Создать связь из сцены ${scene.title}`} title="Нажмите или протяните к другой сцене" onPointerDown={(event) => startConnection(id,null,event)} onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();startConnection(id,null);}}}><Plus /></button></footer>
        </article>; })}
      </div></div>
    </div>
    <aside className="graph-properties" aria-label="Свойства карты">{selected && <>
      <h3>{edge ? "Свойства перехода" : "Свойства сцены"}</h3>
      {edge ? <><p>Из сцены «{project.scenes[edge.from]?.title}»</p>{edge.kind === "choice" && <label>Текст варианта<input value={edge.label} onChange={(event) => updateExit(edge, { label:event.target.value })} /></label>}<label>Следующая сцена<select value={edge.chapterId ? `chapter:${edge.chapterId}` : edge.to ?? ""} onChange={(event) => perform(()=>updateExit(edge,{to:event.target.value}))}><option value="">Не выбрана</option><DestinationOptions project={project}/></select></label>{edge.kind === "implicit" && <p>Пунктир — автоматический переход по порядку глав. При удалении сцена завершит игру.</p>}<button onClick={() => startConnection(edge.from,edge)}>Переподключить мышью</button><button className="graph-danger" onClick={() => { removeExit(edge);setEdgeId(null); }}>Удалить связь</button>{edge.actionId && <button onClick={() => open(edge.from,edge.actionId)}>Редактировать действие</button>}<button onClick={() => setEdgeId(null)}>К свойствам сцены</button></> : <>
        <label>Название сцены<input value={selected.title} onChange={(event) => updateScene(selected.id,{title:event.target.value})} /></label>
        <label>Глава<select value={project.chapters.find((chapter) => chapter.scenes.includes(selected.id))?.id ?? ""} onChange={(event) => moveSceneToChapter(selected.id,event.target.value)}>{project.chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}</select></label>
        <label>Сюжетная линия<input placeholder="Например: Анна / Борис" value={selected.storyline??""} onChange={e=>updateScene(selected.id,{storyline:e.target.value})}/></label><label>Описание<textarea rows={2} value={selected.description ?? ""} onChange={(event) => updateScene(selected.id,{description:event.target.value})} /></label>
        <h4>Переходы из сцены</h4>{exits.length === 0 && <p>Сцена завершает игру. Добавьте связь, чтобы продолжить историю.</p>}{exits.map((item) => <button className="graph-exit" key={item.id} onClick={() => setEdgeId(item.id)}><span>{item.label}</span><small>→ {project.scenes[item.to]?.title ?? "Назначение не выбрано"}</small></button>)}
        <label>Добавить переход<select aria-label="Назначение новой связи" value={destination} onChange={(event) => setDestination(event.target.value)}><option value="">Выберите сцену</option><DestinationOptions project={project}/></select></label><button className="graph-primary" disabled={!destination} onClick={() => perform(() => {connectScenes(selected.id,destination);setDestination("");})}><Plus />Соединить сцены</button><p>Второй переход создаёт выбор игрока. Подписи и назначения веток редактируются при нажатии на линию.</p><button onClick={() => open(selected.id)}>Редактировать содержимое</button><button className="graph-danger" disabled={ids.length < 2} onClick={() => { if (removeScene(selected.id)) {setSelectedId(ids.find((id) => id !== selected.id));setEdgeId(null);} else setMessage("Сначала удалите входящие связи: другие сцены ссылаются на эту сцену."); }}><Trash />Удалить сцену</button>
      </>}
    </>}</aside></div>
  </section>;
  return expanded ? createPortal(<div className="graph-fullscreen" role="dialog" aria-modal="true" aria-label="Карта сюжета на весь экран">{content}</div>, document.body) : content;
}
