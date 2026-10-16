import {visibleDialogControl} from '../domain/dialogFocus.js';
import {useEffect,useId,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {MagnifyingGlass,X,ArrowSquareOut} from '@phosphor-icons/react';
import {useProjectStore} from '../store/projectStore.js';
import {SEARCH_TYPES,projectSearchIndex,searchProject,plainNavigationKey} from '../domain/projectSearch.js';
import './project-search.css';
export function ProjectSearch({onClose}){
 const project=useProjectStore(state=>state.project),[query,setQuery]=useState(''),[category,setCategory]=useState('all'),[cursor,setCursor]=useState(0),[error,setError]=useState('');
 const index=useMemo(()=>projectSearchIndex(project),[project]),results=useMemo(()=>searchProject(index,query,category),[index,query,category]),current=Math.max(0,Math.min(cursor,results.length-1)),start=Math.floor(current/8)*8;
 const root=useRef(null),input=useRef(null),close=useRef(onClose),id=useId();close.current=onClose;
 useEffect(()=>{const previous=document.activeElement;input.current?.focus();return()=>{if(previous?.isConnected)previous.focus();};},[]);
 useEffect(()=>{document.getElementById(`${id}-${current}`)?.scrollIntoView({block:'nearest'});},[id,current,query,category]);
 const choose=entry=>{try{useProjectStore.getState().navigateTo(entry.location);close.current();}catch(err){setError(err.message);}};
 const keyDown=e=>{
  e.stopPropagation();if(e.key==='Escape'){e.preventDefault();close.current();return;}
  if(e.key==='Tab'){const fields=[...root.current.querySelectorAll('button:not(:disabled),input:not(:disabled)')].filter(visibleDialogControl),first=fields[0],last=fields.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}return;}
  if(e.target!==input.current||!plainNavigationKey(e))return;
  if(['ArrowDown','ArrowUp','Home','End','PageDown','PageUp'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?results.length-1:current+({ArrowDown:1,ArrowUp:-1,PageDown:8,PageUp:-8})[e.key];setCursor(Math.max(0,Math.min(results.length-1,next)));}
  else if(e.key==='Enter'){e.preventDefault();if(results[current])choose(results[current]);}
 };
 return createPortal(<div className="project-search-backdrop" onPointerDown={e=>{if(e.target===e.currentTarget)close.current();}}><section ref={root} className="project-search-dialog" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} onKeyDown={keyDown}>
  <header><h2 id={`${id}-title`}>Поиск по проекту</h2><button aria-label="Закрыть поиск" onClick={()=>close.current()}><X size={22}/></button></header>
  <label className="project-search-query"><MagnifyingGlass aria-hidden="true"/><input ref={input} role="combobox" aria-label="Найти в проекте" placeholder="Название, текст реплики или имя файла" value={query} aria-expanded="true" aria-controls={`${id}-results`} aria-activedescendant={results[current]?`${id}-${current}`:undefined} aria-autocomplete="list" onChange={e=>{setQuery(e.target.value);setCursor(0);setError('');}}/></label>
  <nav aria-label="Что искать">{SEARCH_TYPES.map(([key,label])=><button key={key} aria-pressed={category===key} onClick={()=>{setCategory(key);setCursor(0);}}>{label}</button>)}</nav>
  <p className="project-search-count" role="status">Найдено: {results.length}</p>
  <div id={`${id}-results`} role="listbox" aria-label="Результаты поиска">{results.slice(start,start+8).map((entry,offset)=><div key={entry.key} id={`${id}-${start+offset}`} role="option" aria-selected={start+offset===current} className={start+offset===current?'focused':''} onPointerDown={e=>e.preventDefault()} onClick={()=>choose(entry)}><div><strong>{entry.title}</strong><small>{entry.detail}</small>{entry.excerpt&&<p>{entry.excerpt}</p>}</div><ArrowSquareOut aria-hidden="true"/></div>)}</div>
  {!results.length&&<p className="project-search-empty">Ничего не найдено. Измените запрос или категорию.</p>}{error&&<p role="alert">{error}</p>}
  <footer><span>Enter — открыть · Escape — отмена</span><div><button disabled={!start} onClick={()=>setCursor(Math.max(0,start-8))}>Назад</button><span>{results.length?`${start+1}–${Math.min(start+8,results.length)} из ${results.length}`:'0'}</span><button disabled={start+8>=results.length} onClick={()=>setCursor(start+8)}>Далее</button></div></footer>
 </section></div>,document.body);
}
