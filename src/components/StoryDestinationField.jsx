import {useEffect,useId,useMemo,useRef,useState} from 'react';
import {CaretDown,Check,MagnifyingGlass} from '@phosphor-icons/react';
import {destinationKey,destinationLabel,storyDestinations,filterDestinations,destinationCursor,resolveAuthorDestination} from '../domain/storyDestinations.js';
import './story-destination.css';
import {plainNavigationKey} from '../domain/projectSearch.js';

export function StoryDestinationField({project,label,value,onChange,allowChapters=true,withinChapterId=null,allowEmpty=true,emptyLabel='Выберите сцену или главу',compact=false}) {
 const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[cursor,setCursor]=useState(0),[error,setError]=useState('');
 const root=useRef(null),trigger=useRef(null),input=useRef(null),id=useId();
 const entries=useMemo(()=>open?storyDestinations(project,{allowChapters,withinChapterId}):[],[open,project.chapters,project.scenes,allowChapters,withinChapterId]);
 const results=useMemo(()=>filterDestinations(entries,query),[entries,query]);
 const current=Math.max(0,Math.min(cursor,results.length-1)),start=Math.floor(current/8)*8,visible=results.slice(start,start+8),selected=destinationLabel(project,value,emptyLabel);
 const close=()=>{setOpen(false);trigger.current?.focus();};
 useEffect(()=>{if(open){root.current?.querySelector('.story-destination-panel')?.scrollIntoView({block:'nearest'});input.current?.focus({preventScroll:true});}},[open]);
 useEffect(()=>{if(open)document.getElementById(`${id}-option-${current}`)?.scrollIntoView({block:'nearest'});},[open,current,query,id]);
 useEffect(()=>{setOpen(false);setQuery('');setError('');},[project.id]);
 const choose=entry=>{
  if(entry?.disabled)return;
  try{const resolved=resolveAuthorDestination(project,entry);if(withinChapterId&&!project.chapters.find(c=>c.id===withinChapterId)?.scenes.includes(resolved.sceneId))throw Error('Сцена больше не принадлежит выбранной главе.');onChange(entry?.chapterId?{sceneId:null,chapterId:entry.chapterId}:{sceneId:resolved.sceneId,chapterId:null});close();}
  catch(err){setError(err.message);}
 };
 const keyDown=event=>{
  if(!open||event.isComposing)return;
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();return;}
  if(event.target!==input.current||!plainNavigationKey(event))return;
  if(['ArrowDown','ArrowUp','Home','End','PageDown','PageUp'].includes(event.key)){event.preventDefault();event.stopPropagation();setCursor(destinationCursor(results,current,event.key));}
  else if(event.key==='Enter'){event.preventDefault();event.stopPropagation();if(results[current])choose(results[current]);}
 };
 return <div ref={root} className={`field story-destination-field${compact?' story-destination-compact':''}`} data-story-destination-open={open?'':undefined} onKeyDown={keyDown} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setOpen(false);}}>
  <span>{label}</span><button ref={trigger} type="button" className="story-destination-trigger" aria-label={label} aria-expanded={open} aria-controls={`${id}-panel`} onClick={()=>{if(open){close();return;}setQuery('');setCursor(Math.max(0,storyDestinations(project,{allowChapters,withinChapterId}).findIndex(entry=>entry.key===destinationKey(value))));setError('');setOpen(true);}}><span>{selected.text}</span><CaretDown aria-hidden="true"/></button>
  {selected.missing&&<small role="status">Назначение недоступно. Выберите другое — старая ссылка пока сохранена.</small>}
  {open&&<div id={`${id}-panel`} className="story-destination-panel">
   <div className="story-destination-search"><MagnifyingGlass aria-hidden="true"/><input ref={input} role="combobox" aria-label={`Найти: ${label}`} aria-controls={`${id}-list`} aria-expanded="true" aria-autocomplete="list" aria-activedescendant={results[current]?`${id}-option-${current}`:undefined} placeholder="Название, номер или глава" value={query} onChange={event=>{setQuery(event.target.value);setCursor(0);setError('');}}/></div>
   <div id={`${id}-list`} role="listbox" aria-label={`Варианты: ${label}`}>
    {visible.map((entry,index)=><div key={entry.key} id={`${id}-option-${start+index}`} role="option" aria-selected={start+index===current} aria-disabled={entry.disabled||undefined} className={`story-destination-option${start+index===current?' focused':''}`} onPointerDown={event=>event.preventDefault()} onClick={()=>choose(entry)}><div><strong>{entry.title}</strong><small>{entry.detail}</small></div>{destinationKey(value)===entry.key&&<Check aria-label="Текущее назначение"/>}</div>)}
   </div>
   {!results.length&&<p role="status">Ничего не найдено. Измените запрос.</p>}
   {results.length>8&&<nav aria-label={`Страницы: ${label}`}><button type="button" disabled={start===0} onClick={()=>setCursor(Math.max(0,start-8))}>Назад</button><span aria-live="polite">{start+1}–{Math.min(start+8,results.length)} из {results.length}</span><button type="button" disabled={start+8>=results.length} onClick={()=>setCursor(start+8)}>Далее</button></nav>}
   <div className="story-destination-footer">{allowEmpty&&<button type="button" onClick={()=>{try{onChange({sceneId:null,chapterId:null});close();}catch(err){setError(err.message);}}}>Убрать переход</button>}<button type="button" onClick={close}>Отмена</button></div>
   {error&&<p role="alert">{error}</p>}
  </div>}
 </div>;
}
