import { resolveCharacterSprite } from "../../runtime/character-sprites.mjs";
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { UserPlus, ImageSquare, ChatText, MusicNotes, Timer, Copy, Trash, X } from '@phosphor-icons/react';
import { useProjectStore } from '../store/projectStore.js';

export function EditorContextMenu({position,items,onClose}) {
  const ref=useRef(null),[point,setPoint]=useState(position);
  useLayoutEffect(()=>{const r=ref.current.getBoundingClientRect();setPoint({x:Math.max(8,Math.min(position.x,window.innerWidth-r.width-8)),y:Math.max(8,Math.min(position.y,window.innerHeight-r.height-8))});ref.current.querySelector('button:not(:disabled)')?.focus();},[position]);
  useEffect(()=>{const close=e=>{if(!ref.current?.contains(e.target))onClose();};const key=e=>{if(e.key==='Escape'){e.preventDefault();onClose();}};window.addEventListener('pointerdown',close);window.addEventListener('keydown',key);return()=>{window.removeEventListener('pointerdown',close);window.removeEventListener('keydown',key);};},[onClose]);
  return createPortal(<div ref={ref} role="menu" aria-label="Контекстное меню редактора" className="editor-context-menu" style={{left:point.x,top:point.y}} onContextMenu={e=>e.preventDefault()} onKeyDown={e=>{if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();const buttons=[...ref.current.querySelectorAll('button:not(:disabled)')],index=buttons.indexOf(document.activeElement);buttons[(index+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}}}>{items.map((item,i)=>item.separator?<hr key={i}/>:<button role="menuitem" key={item.label} disabled={item.disabled} className={item.danger?'danger':''} onClick={()=>{onClose();item.onClick();}}>{item.icon}{item.label}{item.shortcut&&<kbd>{item.shortcut}</kbd>}</button>)}</div>,document.body);
}

export function CharacterPicker({sceneId,onClose,onAdded}) {
  const {project,addSceneCharacter,addCharacter,setActiveSection}=useProjectStore();
  const [query,setQuery]=useState('');
  const dialog=useRef(null);
  useEffect(()=>{const previous=document.activeElement;return()=>previous?.focus?.();},[]);
  const trap=e=>{if(e.key!=='Tab')return;const buttons=[...dialog.current.querySelectorAll('button:not(:disabled),input')];if(e.shiftKey&&document.activeElement===buttons[0]){e.preventDefault();buttons.at(-1)?.focus();}else if(!e.shiftKey&&document.activeElement===buttons.at(-1)){e.preventDefault();buttons[0]?.focus();}};
  useEffect(()=>{const key=e=>{if(e.key==='Escape')onClose();};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[onClose]);
  return createPortal(<div className="character-picker-backdrop" onPointerDown={e=>{if(e.target===e.currentTarget)onClose();}}><section ref={dialog} onKeyDown={trap} className="character-picker" role="dialog" aria-modal="true" aria-label="Добавить персонажа на сцену"><header><div><h2>Добавить персонажа на сцену</h2><p>Выберите героя. Его положение можно изменить мышью.</p></div><button aria-label="Закрыть выбор персонажа" onClick={onClose}><X/></button></header><input autoFocus placeholder="Найти персонажа…" value={query} onChange={e=>setQuery(e.target.value)}/><div className="character-picker-grid">{project.characters.filter(c=>c.name.toLowerCase().includes(query.toLowerCase())).map(c=><button key={c.id} onClick={()=>{if(onAdded)onAdded(c.id);else addSceneCharacter(sceneId,c.id);onClose();}}>{resolveCharacterSprite(c,null,project.resources).source?<img src={resolveCharacterSprite(c,null,project.resources).source} alt=""/>:<UserPlus/>}<strong>{c.name}</strong><small>{c.sprites.length} спрайтов</small></button>)}</div>{!project.characters.length&&<p>В проекте пока нет персонажей. Создайте героя и загрузите его изображение.</p>}<footer><button onClick={()=>{addCharacter();setActiveSection('characters');onClose();}}><UserPlus/>Создать нового персонажа</button></footer></section></div>,document.body);
}

export function sceneMenuItems({addCharacter,background,action}) {
 return [{label:'Добавить персонажа…',icon:<UserPlus/>,onClick:addCharacter},{label:'Добавить или заменить фон…',icon:<ImageSquare/>,onClick:background},{separator:true},{label:'Добавить реплику',icon:<ChatText/>,onClick:()=>action('dialogue')},{label:'Добавить текст автора',icon:<ChatText/>,onClick:()=>action('narration')},{label:'Добавить музыку',icon:<MusicNotes/>,onClick:()=>action('music')},{label:'Добавить паузу',icon:<Timer/>,onClick:()=>action('pause')}];
}
