import { useEffect, useRef, useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, Magnet, Minus, Plus, Scissors, Copy, Trash, Eye, EyeSlash, LockSimple, LockSimpleOpen, MusicNotes, ImageSquare, User, ChatText, GitBranch, Timer, CornersOut, ArrowCounterClockwise, ArrowClockwise } from '@phosphor-icons/react';
import { useProjectStore } from '../store/projectStore.js';
import { timelineClips, snapTime, roundTime, canSplitClip } from '../domain/timeline.js';
import { EditorContextMenu, CharacterPicker } from './EditorContextMenu.jsx';
import './timeline.css';

const timecode=t=>{const frames=Math.round(t*30);return `${String(Math.floor(frames/1800)).padStart(2,'0')}:${String(Math.floor(frames/30)%60).padStart(2,'0')}:${String(frames%30).padStart(2,'0')}`;};
const category=track=>track.split(':')[0];
const trackIcon=track=>category(track)==='audio'?<MusicNotes/>:category(track)==='character'?<User/>:track==='text'?<ChatText/>:track==='choice'?<GitBranch/>:track==='background'?<ImageSquare/>:<Timer/>;

export function TimelineEditor({scene,actionLabel,content}) {
  const store=useProjectStore();
  const {project,activeActionId,setActiveAction,editClip,removeAction,pasteAction,splitClip,setTimelineTrack,undo,redo,past,future,timelineTime,setTimelineTime}=store;
  const [pixels,setPixels]=useState(65),[snap,setSnap]=useState(true),[playing,setPlaying]=useState(false),[draft,setDraft]=useState(null),[menu,setMenu]=useState(null),[characters,setCharacters]=useState(false),[expanded,setExpanded]=useState(false);
  const viewport=useRef(null),gesture=useRef(null),players=useRef(new Map()),insertTime=useRef(0);
  const clips=timelineClips(scene);
  const duration=Math.max(5,...clips.map(c=>c.end));
  const visibleSeconds=Math.max(15,duration+5);
  const tracks=[...new Set(['background',...clips.filter(c=>category(c.track)==='character').map(c=>c.track),'text','choice',...clips.filter(c=>category(c.track)==='audio').map(c=>c.track),'audio:music','logic'])];
  const label=track=>track==='background'?'Фон и иллюстрации':track==='text'?'Диалоги':track==='choice'?'Выборы':track==='logic'?'Действия':category(track)==='character'?(project.characters.find(c=>c.id===track.split(':')[1])?.name??'Персонажи'):({'audio:music':'Музыка','audio:sound':'Звуки','audio:voice':'Озвучка','audio:ambience':'Атмосфера'}[track]??'Звук');
  const selected=clips.find(c=>c.action.id===activeActionId);
  const width=visibleSeconds*pixels;
  const step=pixels<35?5:pixels<70?2:1;
  const points=[0,timelineTime,...clips.filter(c=>c.action.id!==gesture.current?.id).flatMap(c=>[c.start,c.end])];
  const seek=time=>setTimelineTime(Math.min(duration,Math.max(0,time)));
  const pointTime=event=>{const r=viewport.current.getBoundingClientRect();return Math.max(0,(event.clientX-r.left+viewport.current.scrollLeft-174)/pixels);};
  const add=(type,patch={})=>{
    const state=useProjectStore.getState();state.addAction(type);
    const id=useProjectStore.getState().activeActionId;
    if(Object.keys(patch).length)state.updateAction(scene.id,id,patch);
    state.editClip(scene.id,id,{start:menu?.time??insertTime.current??timelineTime,duration:patch.duration??(['dialogue','narration','choice'].includes(type)?3:5)});
    state.setBottomTab('timeline');setMenu(null);
  };
  const commit=(patch)=>{if(selected&&!selected.locked)editClip(scene.id,selected.action.id,patch);};
  const duplicate=()=>{if(!selected)return;pasteAction(scene.id,selected.action);const id=useProjectStore.getState().activeActionId;editClip(scene.id,id,{start:selected.end});};
  const zoom=next=>{const el=viewport.current;if(!el)return;next=Math.max(15,Math.min(240,next));const center=(el.scrollLeft+el.clientWidth/2-174)/pixels;setPixels(next);requestAnimationFrame(()=>{el.scrollLeft=Math.max(0,center*next+174-el.clientWidth/2);});};
  useEffect(()=>{setPlaying(false);setTimelineTime(0);setDraft(null);},[scene.id]);
  useEffect(()=>{if(!playing)return;let frame;let last=performance.now();const tick=now=>{const state=useProjectStore.getState();const t=Math.min(duration,state.timelineTime+(now-last)/1000);last=now;setTimelineTime(t);if(t>=duration){setPlaying(false);return;}frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);},[playing,duration]);
  useEffect(()=>{
    const active=clips.filter(c=>c.enabled&&category(c.track)==='audio'&&c.action.type!=='stopMusic'&&c.start<=timelineTime&&timelineTime<c.end);
    const wanted=new Set();
    if(playing)for(const clip of active){const resource=project.resources.find(r=>r.id===clip.action.assetId);if(!resource)continue;wanted.add(clip.action.id);let audio=players.current.get(clip.action.id);if(!audio){audio=new Audio(resource.source);audio.currentTime=Math.max(0,timelineTime-clip.start+(clip.action.timeline?.sourceOffset??0));audio.loop=clip.action.loop??false;audio.volume=Math.max(0,Math.min(1,clip.action.volume??1));players.current.set(clip.action.id,audio);audio.play().catch(()=>{setPlaying(false);store.setToast?.('Не удалось воспроизвести звук. Проверьте файл ресурса.');});}}
    for(const [id,audio] of players.current)if(!wanted.has(id)){audio.pause();players.current.delete(id);}
  },[playing,timelineTime,project.resources,scene.actions]);
  useEffect(()=>()=>{for(const audio of players.current.values())audio.pause();},[]);
  const start=(e,clip,kind)=>{
    if(e.button!==0||clip.locked)return;e.preventDefault();e.stopPropagation();setPlaying(false);setActiveAction(clip.action.id);
    gesture.current={id:clip.action.id,kind,x:e.clientX,start:clip.start,duration:clip.duration,end:clip.end,patch:null};
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move=e=>{
    const g=gesture.current;if(!g)return;
    if(g.kind==='seek'){seek(pointTime(e));return;}
    let start=g.start,duration=g.duration,delta=(e.clientX-g.x)/pixels;
    const align=n=>snap&&!e.altKey?snapTime(n,points,8/pixels):roundTime(Math.max(0,n));
    if(g.kind==='move')start=align(g.start+delta);
    if(g.kind==='left'){start=Math.min(g.end-.1,align(g.start+delta));duration=roundTime(g.end-start);}
    if(g.kind==='right')duration=Math.max(.1,roundTime(align(g.end+delta)-g.start));
    g.patch={start,duration};setDraft({id:g.id,...g.patch});
  };
  const finish=()=>{const g=gesture.current;if(g?.patch)editClip(scene.id,g.id,g.patch);gesture.current=null;setDraft(null);};
  const thumbnail=clip=>{const a=clip.action;return project.resources.find(r=>r.id===a.assetId&&r.mime?.startsWith('image/'))?.source??project.characters.find(c=>c.id===(a.characterId??a.speakerId))?.portrait;};
  const commonMenu=[{label:'Добавить персонажа…',icon:<User/>,onClick:()=>{insertTime.current=menu?.time??timelineTime;setCharacters(true);}},{label:'Добавить фон',icon:<ImageSquare/>,onClick:()=>add('background')},{label:'Добавить реплику',icon:<ChatText/>,onClick:()=>add('dialogue')},{label:'Добавить текст автора',icon:<ChatText/>,onClick:()=>add('narration')},{label:'Добавить выбор',icon:<GitBranch/>,onClick:()=>add('choice')},{label:'Добавить музыку',icon:<MusicNotes/>,onClick:()=>add('music')},{label:'Добавить паузу',icon:<Timer/>,onClick:()=>add('pause',{duration:1})}];
  const clipMenu=selected?[{label:'Разрезать по курсору',icon:<Scissors/>,disabled:!canSplitClip(selected.action)||selected.locked||timelineTime<=selected.start+.1||timelineTime>=selected.end-.1,onClick:()=>splitClip(scene.id,selected.action.id,timelineTime)},{label:'Дублировать',icon:<Copy/>,onClick:duplicate},{label:selected.enabled?'Отключить клип':'Включить клип',icon:<Eye/>,onClick:()=>commit({enabled:!selected.enabled})},{label:selected.locked?'Разблокировать':'Заблокировать',icon:<LockSimple/>,onClick:()=>editClip(scene.id,selected.action.id,{locked:!selected.locked})},{label:'Удалить клип',icon:<Trash/>,danger:true,disabled:selected.locked,onClick:()=>removeAction(scene.id,selected.action.id)},{separator:true},...commonMenu]:commonMenu;
  return <section className={`pro-timeline ${expanded?'pro-timeline-expanded':''}`} aria-label="Монтажная временная шкала" onKeyDown={e=>{if(e.target.closest('input,textarea,select'))return;if(e.code==='Space'){e.preventDefault();setPlaying(v=>!v);}if(e.key==='Escape'){setMenu(null);setExpanded(false);}}}>
    <div className="tl-toolbar">
      <div className="tl-tools"><button aria-label="В начало" title="В начало" onClick={()=>{setPlaying(false);seek(0);}}><SkipBack/></button><button className="tl-play" aria-label={playing?'Остановить воспроизведение':'Воспроизвести шкалу'} title="Пробел — воспроизведение" onClick={()=>{if(timelineTime>=duration)seek(0);setPlaying(v=>!v);}}>{playing?<Pause weight="fill"/>:<Play weight="fill"/>}</button><button aria-label="В конец" onClick={()=>{setPlaying(false);seek(duration);}}><SkipForward/></button><span className="tl-time"><b>{timecode(timelineTime)}</b><span> / {timecode(duration)}</span></span></div>
      <div className="tl-tools"><button title="Отменить" aria-label="Отменить монтаж" disabled={!past.length} onClick={undo}><ArrowCounterClockwise/></button><button title="Повторить" disabled={!future.length} onClick={redo}><ArrowClockwise/></button><i/><button title="Разрезать по курсору" aria-label="Разрезать клип" disabled={!selected||!canSplitClip(selected.action)||selected.locked||timelineTime<=selected.start+.1||timelineTime>=selected.end-.1} onClick={()=>splitClip(scene.id,selected.action.id,timelineTime)}><Scissors/></button><button title="Дублировать" disabled={!selected} onClick={duplicate}><Copy/></button><button title="Удалить" disabled={!selected||selected.locked} onClick={()=>removeAction(scene.id,selected.action.id)}><Trash/></button><i/><button title="Привязка к краям клипов" aria-label="Привязка" aria-pressed={snap} className={snap?'active':''} onClick={()=>setSnap(!snap)}><Magnet/></button></div>
      <div className="tl-tools tl-right"><button aria-label="Уменьшить масштаб шкалы" onClick={()=>zoom(pixels/1.25)}><Minus/></button><input aria-label="Масштаб временной шкалы" type="range" min="15" max="240" value={pixels} onChange={e=>zoom(Number(e.target.value))}/><button aria-label="Увеличить масштаб шкалы" onClick={()=>zoom(pixels*1.25)}><Plus/></button><button title="Уместить все клипы" onClick={()=>zoom((viewport.current.clientWidth-200)/Math.max(5,duration))}>Всё</button><button title="Развернуть шкалу" aria-label="Развернуть шкалу" onClick={()=>setExpanded(!expanded)}><CornersOut/></button><button className="tl-add" onClick={e=>{insertTime.current=timelineTime;setMenu({x:e.clientX,y:e.clientY,time:timelineTime,clip:false});}}><Plus/>Добавить</button></div>
    </div>
    <div className="tl-scroll" ref={viewport} onPointerMove={move} onPointerUp={finish} onPointerCancel={()=>{gesture.current=null;setDraft(null);}} onContextMenu={e=>{if(e.target.closest('.tl-clip'))return;e.preventDefault();setMenu({x:e.clientX,y:e.clientY,time:roundTime(pointTime(e)),clip:false});}}>
      <div className="tl-world" style={{width:width+174,minHeight:44+tracks.length*64}}>
        <div className="tl-ruler"><div className="tl-ruler-label">ДОРОЖКИ</div><div className="tl-ruler-scale" style={{width}} onPointerDown={e=>{if(e.button!==0)return;setPlaying(false);gesture.current={kind:'seek'};e.currentTarget.setPointerCapture(e.pointerId);seek(pointTime(e));}}>{Array.from({length:Math.ceil(visibleSeconds/step)+1},(_,i)=><span className="tl-tick" key={i} style={{left:i*step*pixels}}>{i*step}с</span>)}</div></div>
        {tracks.map((track,row)=>{const members=clips.filter(c=>c.track===track),disabled=members.length>0&&members.every(c=>!c.enabled),locked=members.length>0&&members.every(c=>c.locked);return <div key={track} className="tl-track" style={{top:44+row*64,width:width+174}}><div className="tl-track-label">{trackIcon(track)}<span title={label(track)}>{label(track)}</span><button aria-label={`${disabled?'Включить':'Отключить'} дорожку ${label(track)}`} disabled={!members.length} onClick={()=>setTimelineTrack(scene.id,track,'enabled',disabled)}>{disabled?<EyeSlash/>:<Eye/>}</button><button aria-label={`${locked?'Разблокировать':'Заблокировать'} дорожку ${label(track)}`} disabled={!members.length} onClick={()=>setTimelineTrack(scene.id,track,'locked',!locked)}>{locked?<LockSimple/>:<LockSimpleOpen/>}</button></div><div className="tl-track-grid" style={{width,backgroundSize:`${step*pixels}px 100%`}}/></div>;})}
        {clips.map(clip=>{const d=draft?.id===clip.action.id?draft:clip,row=tracks.indexOf(clip.track),thumb=thumbnail(clip);return <div key={clip.action.id} data-clip-id={clip.action.id} className={`tl-clip tl-${category(clip.track)} ${activeActionId===clip.action.id?'selected':''} ${!clip.enabled?'disabled':''} ${clip.locked?'locked':''}`} style={{left:174+d.start*pixels,top:44+row*64+8,width:Math.max(8,d.duration*pixels),zIndex:draft?.id===clip.action.id?12:4}} onContextMenu={e=>{e.preventDefault();e.stopPropagation();setActiveAction(clip.action.id);setMenu({x:e.clientX,y:e.clientY,time:clip.start,clip:true});}}><button className="tl-trim left" aria-label={`Начало клипа ${actionLabel(clip.action)}`} disabled={clip.locked} onPointerDown={e=>start(e,clip,'left')}/><button className="tl-clip-body" aria-label={`Клип ${actionLabel(clip.action)}: ${clip.start}–${clip.end} секунд`} onPointerDown={e=>start(e,clip,'move')} onClick={()=>setActiveAction(clip.action.id)}>{thumb&&<img src={thumb} alt="" draggable="false"/>}<span className="tl-clip-text"><strong>{actionLabel(clip.action)}</strong><small>{content(clip.action)}</small></span>{clip.locked&&<LockSimple/>}</button><button className="tl-trim right" aria-label={`Конец клипа ${actionLabel(clip.action)}`} disabled={clip.locked} onPointerDown={e=>start(e,clip,'right')}/></div>;})}
        <div className="tl-playhead" style={{left:174+timelineTime*pixels,height:44+tracks.length*64}}><button aria-label="Курсор воспроизведения" onPointerDown={e=>{setPlaying(false);gesture.current={kind:'seek'};e.currentTarget.setPointerCapture(e.pointerId);}}/><i/></div>
        {!clips.length&&<div className="tl-empty">ПКМ по дорожке или «Добавить» — создайте первый клип</div>}
      </div>
    </div>
    <div className="tl-footer">{selected?<><strong>{actionLabel(selected.action)}</strong><label>Начало<input aria-label="Начало выбранного клипа" disabled={selected.locked} type="number" min="0" step=".1" value={draft?.id===selected.action.id?draft.start:selected.start} onChange={e=>commit({start:Number(e.target.value)||0})}/><span>с</span></label><label>Длительность<input aria-label="Длительность выбранного клипа" disabled={selected.locked} type="number" min=".1" step=".1" value={draft?.id===selected.action.id?draft.duration:selected.duration} onChange={e=>commit({duration:Number(e.target.value)||.1})}/><span>с</span></label>{['dialogue','narration'].includes(selected.action.type)&&<label><input type="checkbox" checked={selected.action.timeline?.waitForClick!==false} onChange={e=>commit({waitForClick:e.target.checked})}/>Ждать клик в конце</label>}</>:<span>ПКМ — добавить · тянуть клип — переместить · края — длительность · Пробел — просмотр</span>}<span className="tl-footer-end">30 кадров/с · {clips.length} клипов</span></div>
    {menu&&<EditorContextMenu position={menu} items={menu.clip?clipMenu:commonMenu} onClose={()=>setMenu(null)}/>}
    {characters&&<CharacterPicker sceneId={scene.id} onClose={()=>setCharacters(false)} onAdded={id=>add('showCharacter',{characterId:id,spriteId:null})}/>}
  </section>;
}
