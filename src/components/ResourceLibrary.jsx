import {useEffect,useMemo,useRef,useState} from 'react';
import {ArrowClockwise,UploadSimple,SpeakerHigh,MusicNotes,Waveform,Trash,FolderSimple,TextT,MagnifyingGlass} from '@phosphor-icons/react';
import {useProjectStore} from '../store/projectStore.js';
import {captureResourceRepair} from '../domain/mediaRepair.js';
import {mediaKind} from '../domain/mediaReferences.js';
import {backgroundTarget} from '../domain/backgroundAuthoring.js';
import {readMediaFile,fileMediaKind,mediaAccept} from '../platform/mediaFile.js';
import {MediaRepairWorkspace} from './MediaRepairWorkspace.jsx';
import {ResourceGrid} from './ResourceGrid.jsx';
import {resourceUsageIndex,filterResources} from '../domain/resourceUsage.js';
import {ResourceUsageList} from './ResourceUsageList.jsx';
import './media-repair.css';
const bytes=value=>value>=1048576?`${(value/1048576).toFixed(1)} МБ`:value>=1024?`${Math.round(value/1024)} КБ`:`${value??0} Б`;
const accept='.png,.webp,.jpg,.jpeg,.mp3,.wav,.ogg,.ttf,.otf';
export function ResourceLibrary({section,categories,onProjectSettings}){
 const project=useProjectStore(s=>s.project),activeSceneId=useProjectStore(s=>s.activeSceneId),selectedResourceId=useProjectStore(s=>s.selectedResourceId),setSelectedResource=useProjectStore.getState().setSelectedResource,forced={backgrounds:'background',music:'music',sounds:'sound'}[section];
 const [category,setCategory]=useState(forced??'all'),[repair,setRepair]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[failed,setFailed]=useState([]);
 const [query,setQuery]=useState('');
 const navigationRequest=useProjectStore(s=>s.navigationRequest),navigationTarget=useProjectStore(s=>s.navigationTarget);
 useEffect(()=>{if(navigationTarget?.kind==='resource'&&navigationTarget.projectId===project.id){setQuery('');setCategory(forced??'all');setRepair(false);}},[navigationRequest,navigationTarget,project.id,forced]);
 const addInput=useRef(null),replaceInput=useRef(null),replaceTarget=useRef(null),token=useRef(0),origin=useRef(project.id);
 useEffect(()=>()=>{token.current++;},[]);
 const valid=current=>current===token.current&&useProjectStore.getState().project.id===origin.current;
 const references=useMemo(()=>resourceUsageIndex(project),[project]),counts=useMemo(()=>{const result=new Map();for(const resource of project.resources)result.set(resource.category,(result.get(resource.category)??0)+1);return result;},[project.resources]);
 const visible=useMemo(()=>filterResources(project.resources,forced??category,query),[project.resources,forced,category,query]),selected=visible.find(r=>r.id===selectedResourceId)??visible[0];
 const imageFailure=source=>setFailed(previous=>previous.includes(source)?previous:[...previous,source]);
 const imageLoaded=source=>setFailed(previous=>previous.includes(source)?previous.filter(s=>s!==source):previous);
 const importFiles=async files=>{
  const current=++token.current,chosen=Array.from(files??[]),projectId=origin.current,preferred=forced??category;setBusy(true);setError('');
  try{const resources=[];for(const file of chosen){const kind=fileMediaKind(file),wanted=['music','sound','voice','ambience'].includes(preferred)?'audio':preferred==='font'?'font':['background','cg','sprite','prop','ui'].includes(preferred)?'image':null;if(wanted&&kind!==wanted)throw Error('Тип файла не подходит для выбранного раздела. Выберите «Все» или нужную категорию.');resources.push(await readMediaFile(file,{kind:wanted??undefined,category:preferred==='all'?undefined:preferred}));if(!valid(current))return;}if(resources.length&&valid(current))useProjectStore.getState().importMedia({projectId,resources});}
  catch(err){if(valid(current))setError(err.message);}
  finally{if(valid(current))setBusy(false);}
 };
 const replaceFile=async file=>{
  const target=replaceTarget.current;if(!file||!target)return;const current=++token.current;setBusy(true);setError('');
  try{const resource=await readMediaFile(file,{kind:target.kind});if(valid(current))useProjectStore.getState().repairMedia({projectId:target.projectId,entries:[{...target,resource}]});}
  catch(err){if(valid(current))setError(err.message);}
  finally{if(valid(current))setBusy(false);}
 };
 const pickReplacement=()=>{try{replaceTarget.current=captureResourceRepair(project,selected.id);setError('');replaceInput.current?.click();}catch(err){setError(err.message);}};
 const openUsage=use=>{try{const plan=useProjectStore.getState().navigateTo({...use,projectId:project.id});if(plan.openProjectSettings)onProjectSettings?.();}catch(err){setError(err.message);}};
 const useBackground=()=>{try{const state=useProjectStore.getState(),target=backgroundTarget(state.project,activeSceneId,state.activeActionId,state.timelineTime);state.applyBackground({...target,mode:'current',resourceId:selected.id,fit:target.transform.fit});}catch(err){setError(err.message);}};
 if(repair)return <MediaRepairWorkspace key={project.id} failedSources={failed} onBack={()=>setRepair(false)}/>;
 const usages=references.get(selected?.id)??[],usage=usages.length;
 return <div className="resource-workspace resource-library" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(!busy)void importFiles(e.dataTransfer.files);}}>
  <div className="resource-library-toolbar"><button className="button primary" disabled={busy} onClick={()=>addInput.current?.click()}><UploadSimple/>Добавить файлы</button><button className="button secondary" disabled={busy} onClick={()=>setRepair(true)}><ArrowClockwise/>Проверить и восстановить файлы</button><p role="status">{busy?'Проверяем выбранные файлы…':'Замена сохраняет названия и игровые связи.'}</p><label className="resource-search"><MagnifyingGlass/><input aria-label="Поиск ресурсов" placeholder="Название или имя файла" value={query} onChange={event=>setQuery(event.target.value)}/></label></div>
  {error&&<p role="alert" className="resource-library-error">{error}</p>}
  {!forced&&<div className="resource-filters">{categories.map(([id,label])=><button key={id} className={category===id?'active':''} onClick={()=>setCategory(id)}>{label}<span>{id==='all'?project.resources.length:counts.get(id)??0}</span></button>)}</div>}
  <p className="resource-result-count" role="status">Найдено: {visible.length} из {project.resources.length}</p>
  <div className="resource-main"><ResourceGrid resources={visible} selectedId={selected?.id} onSelect={setSelectedResource} filterKey={`${forced??category}:${query}`} renderCard={resource=><>{mediaKind(resource)==='image'?<img src={resource.source} alt={resource.name} loading="lazy" decoding="async" onError={()=>imageFailure(resource.source)} onLoad={()=>imageLoaded(resource.source)}/>:<div className="resource-type-icon">{mediaKind(resource)==='font'?<TextT/>:resource.category==='music'?<MusicNotes/>:resource.category==='voice'?<Waveform/>:<SpeakerHigh/>}</div>}<span><strong>{resource.name}</strong><small>{failed.includes(resource.source)?'Изображение недоступно':`${bytes(resource.size)}${resource.width?` · ${resource.width}×${resource.height}`:''}`}</small></span><em title="Места использования">{references.get(resource.id)?.length??0}</em></>}/>
   <aside className="resource-details" data-editor-location={selected?JSON.stringify(['resource',selected.id]):undefined}>{selected?<><div className="resource-preview">{mediaKind(selected)==='image'?<img src={selected.source} alt={selected.name} onError={()=>imageFailure(selected.source)} onLoad={()=>imageLoaded(selected.source)}/>:<div>{mediaKind(selected)==='font'?<TextT/>:<SpeakerHigh/>}<span>{mediaKind(selected)==='font'?'Шрифт':'Аудиоресурс'}</span></div>}</div><h2>{selected.name}</h2><p className="resource-file-name">{selected.fileName||'Исходное имя файла не сохранено'}</p><dl><div><dt>Тип</dt><dd>{categories.find(([id])=>id===selected.category)?.[1]??selected.category}</dd></div><div><dt>Формат</dt><dd>{selected.mime?.split('/')[1]?.toUpperCase()??'Файл'}</dd></div><div><dt>Размер</dt><dd>{bytes(selected.size)}</dd></div><div><dt>Использований</dt><dd>{usage}</dd></div></dl>{usages.length>0&&<ResourceUsageList key={selected.id} usages={usages} onOpen={openUsage}/>}{['background','cg'].includes(selected.category)&&<button className="button primary wide" onClick={useBackground}>Использовать в выбранном кадре</button>}<button className="button secondary wide" disabled={busy} onClick={pickReplacement}>Заменить файл во всём проекте</button><button className="button danger-button wide" disabled={busy} onClick={()=>{if(!usage||window.confirm(`Ресурс используется ${usage} раз. Удалить его и очистить связи?`))useProjectStore.getState().removeResource(selected.id);}}><Trash/>Удалить ресурс</button></>:<div className="empty-detail"><FolderSimple/><strong>Ресурсов пока нет</strong><span>Добавьте изображения, записи или шрифты.</span></div>}</aside>
  </div><input ref={addInput} hidden multiple type="file" accept={accept} aria-label="Добавить файлы в библиотеку" onChange={e=>{const files=Array.from(e.target.files??[]);e.target.value='';if(files.length)void importFiles(files);}}/><input ref={replaceInput} hidden type="file" accept={selected?mediaAccept[mediaKind(selected)]??accept:accept} aria-label="Заменить выбранный файл" onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void replaceFile(file);}}/>
 </div>;
}
