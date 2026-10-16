import {visibleDialogControl} from '../domain/dialogFocus.js';
import {useEffect} from 'react';
export function useGraphDialog(expanded,root,onClose){
 useEffect(()=>{
  if(!expanded)return;
  const previous=document.activeElement,element=root.current;
  element?.querySelector('.graph-expand')?.focus();
  const keydown=event=>{
   if(event.key==='Escape'){if(event.target.closest?.('[data-story-destination-open]'))return;event.preventDefault();event.stopPropagation();onClose();return;}
   if(event.key!=='Tab')return;
   const fields=[...element.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex="0"]')].filter(visibleDialogControl);
   const first=fields[0],last=fields.at(-1);
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  };
  document.addEventListener('keydown',keydown,true);
  return()=>{document.removeEventListener('keydown',keydown,true);requestAnimationFrame(()=>{if(previous?.isConnected)previous.focus();else root.current?.querySelector('.graph-expand')?.focus();});};
 },[expanded,root,onClose]);
}
