import {useEffect} from 'react';
import {useProjectStore} from '../store/projectStore.js';
export function EditorNavigationFocus(){
 const request=useProjectStore(s=>s.navigationRequest),target=useProjectStore(s=>s.navigationTarget),projectId=useProjectStore(s=>s.project.id);
 useEffect(()=>{
  if(!request||!target||target.projectId!==projectId)return;
  let frame,highlight,timer,attempt=0;
  const focus=()=>{const key=JSON.stringify([target.focusKind,target.focusId]),element=[...document.querySelectorAll('[data-editor-location]')].find(el=>el.dataset.editorLocation===key&&el.getClientRects().length);if(!element){if(++attempt<4)frame=requestAnimationFrame(focus);return;}highlight=element;highlight.dataset.editorHighlight='true';element.scrollIntoView({block:'nearest',inline:'nearest'});const field=element.matches('input,textarea,button,select')?element:element.querySelector('input:not([type=hidden]),textarea,select,button');if(field)field.focus({preventScroll:true});else{element.tabIndex=-1;element.focus({preventScroll:true});}timer=setTimeout(()=>{if(highlight)delete highlight.dataset.editorHighlight;},2500);};
  frame=requestAnimationFrame(focus);return()=>{cancelAnimationFrame(frame);clearTimeout(timer);if(highlight)delete highlight.dataset.editorHighlight;};
 },[request,target,projectId]);
 return null;
}
