import {useMemo,useState} from 'react';
import {ImageSquare,Plus} from '@phosphor-icons/react';
import {useProjectStore} from '../store/projectStore.js';
import {captureReactionTarget} from '../domain/reactionAuthoring.js';
import {sceneInteractionOverview,interactionOverviewPage} from '../domain/interactionOverview.js';
import {PropPicker} from './PropPicker.jsx';
import {ReactionPicker} from './ReactionPicker.jsx';

export function SceneInteractionList({scene,action}) {
 const project=useProjectStore(state=>state.project),select=useProjectStore(state=>state.setActiveLayer);
 const [query,setQuery]=useState(''),[page,setPage]=useState(0),[adding,setAdding]=useState(false),[reaction,setReaction]=useState(null),[error,setError]=useState('');
 const entries=useMemo(()=>sceneInteractionOverview(scene,project.resources),[scene.images,project.resources]);
 const result=interactionOverviewPage(entries,query,page);
 const createReaction=layerId=>{
  try{setReaction(captureReactionTarget(useProjectStore.getState().project,scene.id,layerId,action.id));setError('');}
  catch(err){setError(err.message);}
 };
 return <section className="scene-interaction-list" aria-label="Предметы для взаимодействия">
  <header><h3>Предметы сцены · {entries.length}</h3><button type="button" className="button secondary" onClick={()=>setAdding(true)}><Plus/>Добавить предмет</button></header>
  {!!entries.length&&<label className="field"><span>Найти предмет или действие</span><input type="search" value={query} onChange={event=>{setQuery(event.target.value);setPage(0);}}/></label>}
  {!entries.length?<p>Добавьте предмет и выберите, что происходит при нажатии. Изображение, ответ, голос и звук настраиваются в его свойствах.</p>:<>
   <ul>{result.entries.map(entry=><li key={entry.id}>
    <div className="scene-interaction-object">{entry.source?<img src={entry.source} alt="" loading="lazy"/>:<ImageSquare aria-hidden="true"/>}<div><strong>{entry.name}</strong><span>{entry.reactionCount?`Действий: ${entry.reactionCount}`:'Без действий'}{entry.voiceCount?` · Голос: ${entry.voiceCount}`:''}{entry.soundCount?` · Звук: ${entry.soundCount}`:''}</span>{entry.warnings.length>0&&<small>{entry.warnings.join(' · ')}</small>}</div></div>
    <div className="scene-interaction-buttons"><button type="button" aria-label={`Настроить предмет: ${entry.name}`} onClick={()=>select(entry.id)}>Настроить</button><button type="button" aria-label={`Добавить взаимодействие: ${entry.name}`} onClick={()=>createReaction(entry.id)}><Plus/>Взаимодействие</button></div>
   </li>)}</ul>
   {!result.count&&<p role="status">Предметы не найдены. Измените запрос или <button type="button" onClick={()=>{setQuery('');setPage(0);}}>сбросьте поиск</button>.</p>}
   {result.pages>1&&<nav className="scene-interaction-pages" aria-label="Страницы предметов"><button type="button" disabled={result.page===0} onClick={()=>setPage(result.page-1)}>Назад</button><span aria-live="polite">{result.page+1} / {result.pages}</span><button type="button" disabled={result.page===result.pages-1} onClick={()=>setPage(result.page+1)}>Далее</button></nav>}
  </>}
  {error&&<p role="alert">{error}</p>}
  {adding&&<PropPicker key={`${project.id}:${scene.id}`} sceneId={scene.id} onClose={()=>setAdding(false)}/>}
  {reaction&&reaction.projectId===project.id&&reaction.sceneId===scene.id&&<ReactionPicker target={reaction} layerName={entries.find(entry=>entry.id===reaction.layerId)?.name??'Предмет'} onClose={()=>setReaction(null)}/>}
 </section>;
}
