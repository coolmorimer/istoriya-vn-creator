import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { UserPlus, ImageSquare, ChatText, MusicNotes, Timer, Copy, Trash, X } from '@phosphor-icons/react';
export {CharacterPicker} from './CharacterPicker.jsx';

export function EditorContextMenu({position,items,onClose}) {
  const ref=useRef(null),[point,setPoint]=useState(position);
  useLayoutEffect(()=>{const r=ref.current.getBoundingClientRect();setPoint({x:Math.max(8,Math.min(position.x,window.innerWidth-r.width-8)),y:Math.max(8,Math.min(position.y,window.innerHeight-r.height-8))});ref.current.querySelector('button:not(:disabled)')?.focus();},[position]);
  useEffect(()=>{const close=e=>{if(!ref.current?.contains(e.target))onClose();};const key=e=>{if(e.key==='Escape'){e.preventDefault();onClose();}};window.addEventListener('pointerdown',close);window.addEventListener('keydown',key);return()=>{window.removeEventListener('pointerdown',close);window.removeEventListener('keydown',key);};},[onClose]);
  return createPortal(<div ref={ref} role="menu" aria-label="Контекстное меню редактора" className="editor-context-menu" style={{left:point.x,top:point.y}} onContextMenu={e=>e.preventDefault()} onKeyDown={e=>{if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();const buttons=[...ref.current.querySelectorAll('button:not(:disabled)')],index=buttons.indexOf(document.activeElement);buttons[(index+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}}}>{items.map((item,i)=>item.separator?<hr key={i}/>:<button role="menuitem" key={item.label} disabled={item.disabled} className={item.danger?'danger':''} onClick={()=>{onClose();item.onClick();}}>{item.icon}{item.label}{item.shortcut&&<kbd>{item.shortcut}</kbd>}</button>)}</div>,document.body);
}

export function sceneMenuItems({addCharacter,addProp,background,action}) {
 return [{label:'Добавить персонажа…',icon:<UserPlus/>,onClick:addCharacter},...(addProp?[{label:'Добавить предмет…',icon:<ImageSquare/>,onClick:addProp}]:[]),{label:'Добавить или заменить фон…',icon:<ImageSquare/>,onClick:background},{separator:true},{label:'Добавить реплику',icon:<ChatText/>,onClick:()=>action('dialogue')},{label:'Добавить текст автора',icon:<ChatText/>,onClick:()=>action('narration')},{label:'Добавить музыку',icon:<MusicNotes/>,onClick:()=>action('music')},{label:'Добавить паузу',icon:<Timer/>,onClick:()=>action('pause')}];
}
