import {useMemo,useRef,useState,useEffect} from 'react';
import {Plus,ImageSquare,ChatText,User,Copy,Trash,ArrowLeft,ArrowRight,GitBranch} from '@phosphor-icons/react';
import {useProjectStore} from '../store/projectStore.js';
import {storyboardFrames} from '../domain/storyboard.js';
import {resolveCharacterSprite} from '../../runtime/character-sprites.mjs';
import {CharacterPicker} from './EditorContextMenu.jsx';
import {backgroundStyle} from '../../runtime/background-transform.mjs';
import {sceneImages,imageLayerStyle} from '../../runtime/image-layers.mjs';
import {BackgroundPicker} from './BackgroundPicker.jsx';
import {scenePaintOrder} from '../../runtime/visual-order.mjs';
import {cameraStyle} from '../../runtime/keyframes.mjs';

function StoryboardThumbnail({project,scene,frame,index}) {
 const images=frame.images??sceneImages(scene),order=scenePaintOrder(scene,frame.layers,images,frame.backgroundActionId);
 return <div className="storyboard-thumbnail">
   <div className="visual-scene-objects" style={cameraStyle(frame.camera)}>
     <div className="scene-background-clip" style={{zIndex:order.background}}>{frame.background&&<img src={frame.background} style={backgroundStyle(frame.backgroundTransform)} alt="" loading="lazy"/>}</div>
     {frame.layers.filter(l=>l.visible!==false).map(layer=>{const source=resolveCharacterSprite(project.characters.find(c=>c.id===layer.characterId),layer.spriteId,project.resources).source;return source&&<img key={layer.id} className="storyboard-actor" src={source} alt="" loading="lazy" style={{left:`${layer.x}%`,top:`${layer.y}%`,opacity:(layer.opacity??100)/100,zIndex:order.characters.get(layer.characterId),transform:`translate(-50%,-100%) rotate(${layer.rotation??0}deg) scale(${(layer.flip?-1:1)*(layer.scale??100)/100},${(layer.scale??100)/100})`}}/>;})}
     {images.filter(layer=>layer.visible).map(layer=>{const resource=project.resources.find(r=>r.id===layer.resourceId);return resource?.source&&<img key={layer.id} className="storyboard-prop" style={{...imageLayerStyle(layer),zIndex:order.images.get(layer.id)}} src={resource.source} alt=""/>;})}
   </div>
   {!frame.background&&!frame.layers.length&&!images.length&&<ImageSquare className="storyboard-empty-icon"/>}
   {frame.cg&&<img className="storyboard-cg" src={frame.cg} alt="" loading="lazy"/>}
   <span className="storyboard-number">{String(index+1).padStart(2,'0')}</span>
 </div>;
}

export function StoryboardEditor({scene,actionLabel,content,onMore}) {
 const project=useProjectStore(s=>s.project),active=useProjectStore(s=>s.activeActionId);
 const {setActiveAction,addAction,reorderAction,moveAction,pasteAction,removeAction,updateAction}=useProjectStore.getState();
 const frames=useMemo(()=>storyboardFrames(project,scene),[project,scene]);
 const [dragging,setDragging]=useState(null),[pickCharacter,setPickCharacter]=useState(false),[pickBackground,setPickBackground]=useState(false);const selectedRef=useRef(null);
 const selected=scene.actions.find(a=>a.id===active),index=scene.actions.findIndex(a=>a.id===active);
 useEffect(()=>{const card=selectedRef.current,strip=card?.parentElement;if(!strip)return;const left=card.offsetLeft-strip.offsetLeft;if(left<strip.scrollLeft||left+card.offsetWidth>strip.scrollLeft+strip.clientWidth)strip.scrollTo({left:Math.max(0,left-16),behavior:'smooth'});},[active]);
 const add=type=>type==='background'?setPickBackground(true):addAction(type,{afterId:active});
 return <div className="storyboard-editor">
   {pickBackground&&<BackgroundPicker sceneId={scene.id} placement="insert" onClose={()=>setPickBackground(false)}/>}
   <div className="storyboard-toolbar"><div className="storyboard-add"><button onClick={()=>add('narration')}><ChatText/>Текст</button><button onClick={()=>add('background')}><ImageSquare/>Фон</button><button onClick={()=>setPickCharacter(true)}><User/>Персонаж</button><button onClick={()=>add('choice')}><GitBranch/>Выбор</button><button onClick={onMore}><Plus/>Ещё</button></div><span>{scene.actions.length} шагов</span></div>
   {pickCharacter&&<CharacterPicker sceneId={scene.id} onClose={()=>setPickCharacter(false)} onAdded={characterId=>addAction('showCharacter',{afterId:active,values:{characterId}})}/>}
   <div className="storyboard-strip" aria-label="Кадры сцены" onDragOver={e=>e.preventDefault()} onDrop={e=>{if(e.target===e.currentTarget&&dragging){reorderAction(scene.id,dragging,scene.actions.length-1);setDragging(null);}}}>
     {frames.map(({action,frame},i)=><button type="button" key={action.id} ref={active===action.id?selectedRef:null} draggable={!scene.timelineEnabled} aria-label={`Шаг ${i+1}: ${actionLabel(action)}`} aria-pressed={active===action.id} className={`storyboard-card ${active===action.id?'selected':''} ${dragging===action.id?'dragging':''}`} onClick={()=>setActiveAction(action.id)} onKeyDown={e=>{if(e.altKey&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();moveAction(scene.id,action.id,e.key==='ArrowLeft'?'up':'down');}else if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();setActiveAction(scene.actions[Math.max(0,Math.min(scene.actions.length-1,i+(e.key==='ArrowLeft'?-1:1)))].id);}}} onDragStart={e=>{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',action.id);setDragging(action.id);}} onDragEnd={()=>setDragging(null)} onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect='move';}} onDrop={e=>{e.preventDefault();e.stopPropagation();if(dragging&&dragging!==action.id){reorderAction(scene.id,dragging,i);setActiveAction(dragging);}setDragging(null);}}>
       <StoryboardThumbnail project={project} scene={scene} frame={frame} index={i}/>
       <strong>{actionLabel(action)}</strong><span className="storyboard-caption">{content(action)}</span>
     </button>)}
     <button className="storyboard-add-card" onClick={()=>add('narration')}><Plus/><span>{frames.length?'Следующий шаг':'Первый шаг'}</span></button>
   </div>
   {selected?<div className="storyboard-detail"><div><strong>{actionLabel(selected)}</strong><small>Шаг {index+1} из {scene.actions.length}</small><div className="storyboard-tools"><button aria-label="Шаг левее" disabled={index<=0} onClick={()=>moveAction(scene.id,selected.id,'up')}><ArrowLeft/></button><button aria-label="Шаг правее" disabled={index===scene.actions.length-1} onClick={()=>moveAction(scene.id,selected.id,'down')}><ArrowRight/></button><button aria-label="Дублировать шаг" onClick={()=>pasteAction(scene.id,selected,{afterId:selected.id})}><Copy/></button><button aria-label="Удалить шаг" onClick={()=>removeAction(scene.id,selected.id)}><Trash/></button></div></div>{['dialogue','narration'].includes(selected.type)?<textarea aria-label="Текст выбранного шага" placeholder="Напишите текст…" value={selected.text??''} onChange={e=>updateAction(scene.id,selected.id,{text:e.target.value})}/>:<p>{content(selected)}<small>Настройки выбранного шага — справа</small></p>}</div>:<p className="storyboard-hint">Выберите шаг, чтобы увидеть сцену. Перетащите карточку, чтобы изменить порядок.</p>}
 </div>;
}
