import {visibleDialogControl} from '../domain/dialogFocus.js';
import {useEffect,useRef,useState} from 'react';
import {availableReactions,explorationReady,itemQuantity,inventoryTargets} from '../../runtime/interactions.mjs';
import {advancePreview,conditionPass,interactPreview} from '../domain/preview.js';
import './preview-gameplay.css';
export function GameplayDialog({label,onClose,children,className=''}) {
 const dialog=useRef(null),close=useRef(onClose);close.current=onClose;
 useEffect(()=>{const previous=document.activeElement;dialog.current?.querySelector('button:not(:disabled),input:not(:disabled),select:not(:disabled)')?.focus();return()=>{if(previous?.isConnected)previous.focus();};},[]);
 const keyDown=e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();close.current();return;}if(e.key!=='Tab')return;const fields=[...dialog.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(visibleDialogControl),first=fields[0],last=fields.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}};
 return <div className={`preview-gameplay-modal ${className}`} onClick={e=>e.stopPropagation()} onKeyDown={keyDown}><section ref={dialog} role="dialog" aria-modal="true" aria-label={label}>{children}</section></div>;
}
export function PreviewGameplay({project,scene,state,setState,children}) {
 const [propMenu,setPropMenu]=useState(null),[inventoryOpen,setInventoryOpen]=useState(false),[selectedItem,setSelectedItem]=useState(null);
 useEffect(()=>{setPropMenu(null);setInventoryOpen(false);setSelectedItem(null);},[state.sceneId,state.index,state.waiting?.type]);
 const options=layer=>availableReactions(scene.id,layer,state,(condition,s)=>conditionPass(condition,s,project));
 const react=(layerId,reactionId)=>{setPropMenu(null);setInventoryOpen(false);setSelectedItem(null);setState(previous=>interactPreview(project,previous,layerId,reactionId));};
 const click=layerId=>{const layer=scene.images?.find(l=>l.id===layerId);if(!layer)return;const reactions=options(layer);if(reactions.length===1)react(layerId,reactions[0].id);else if(reactions.length)setPropMenu(layerId);};
 const selected=scene.images?.find(l=>l.id===propMenu);
 const exploring=state.waiting?.type==='explore'&&!state.ended;
 const inventory=(project.items??[]).filter(item=>itemQuantity(state.inventory,item.id)>0);
 return <>{children(click)}
  {exploring&&<div className="preview-exploration" onClick={e=>e.stopPropagation()}><strong>{state.waiting.prompt||'Осмотрите сцену'}</strong><div><button onClick={()=>setInventoryOpen(true)}>Инвентарь · {inventory.length}</button><button disabled={!explorationReady(state.waiting,state,project)} onClick={()=>setState(previous=>advancePreview(project,previous))}>Продолжить</button></div></div>}
  {exploring&&selected&&<GameplayDialog label={`Действия: ${selected.name}`} onClose={()=>setPropMenu(null)}><h3>{selected.name}</h3>{options(selected).map(reaction=><button key={reaction.id} onClick={()=>react(selected.id,reaction.id)}>{reaction.label}</button>)}<button onClick={()=>setPropMenu(null)}>Назад</button></GameplayDialog>}
  {inventoryOpen&&exploring&&<GameplayDialog label="Инвентарь" onClose={()=>setInventoryOpen(false)}><h3>Инвентарь</h3><div className="preview-inventory-items">{inventory.length?inventory.map(item=>{
   const targets=inventoryTargets(project,state,item.id),expanded=selectedItem===item.id;
   return <div key={item.id} className="preview-inventory-entry"><div className="preview-inventory-row">{project.resources.find(r=>r.id===item.iconResourceId)?.source&&<img src={project.resources.find(r=>r.id===item.iconResourceId).source} alt=""/>}<div><strong>{item.name} × {itemQuantity(state.inventory,item.id)}</strong><p>{item.description}</p><button aria-expanded={expanded} onClick={()=>setSelectedItem(expanded?null:item.id)}>Применить: {item.name}</button></div></div>
    {expanded&&<div className="preview-inventory-targets">{targets.length?targets.map(target=><button key={JSON.stringify([target.layerId,target.reactionId])} onClick={()=>react(target.layerId,target.reactionId)}>{target.layerName} — {target.label}</button>):<p role="status">Сейчас на сцене нет доступных действий с этим предметом.</p>}</div>}
   </div>;
  }):<p>Пока ничего нет.</p>}</div><button onClick={()=>setInventoryOpen(false)}>Закрыть инвентарь</button></GameplayDialog>}
 </>;
}
