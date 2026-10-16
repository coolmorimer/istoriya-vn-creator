import {useEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,FolderOpen,MagnifyingGlass,ArrowClockwise,UploadSimple} from '@phosphor-icons/react';
import {useProjectStore} from '../store/projectStore.js';
import {mediaGroups,folderMediaCandidates,indexMediaFolder} from '../domain/mediaReferences.js';
import {readMediaFile,mediaAccept} from '../platform/mediaFile.js';
import {windowsFilePath} from '../platform/nativeMedia.js';
import './media-repair.css';

function sourceLabel(source){if(source.startsWith('data:'))return 'Встроенные данные проекта';const durable=window.istoriya?.projectFileReferences?.({source}).source??source;try{return windowsFilePath(durable);}catch{return durable;}}
const problem=status=>!status||!['available','embedded'].includes(status.status);
function ReplacementInput({group,busy,onChoose}){const input=useRef(null);return <><button className="button secondary media-file-button" disabled={!!busy} onClick={()=>input.current?.click()}><UploadSimple/>Выбрать замену</button><input ref={input} hidden type="file" aria-label={`Замена: ${group.label}`} accept={mediaAccept[group.refs[0].kind]??'.png,.webp,.jpg,.mp3,.wav,.ogg,.ttf,.otf'} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)onChoose(group,file);}}/></>;}
export function MediaRepairWorkspace({onBack,failedSources=[]}){
 const project=useProjectStore(s=>s.project),groups=useMemo(()=>mediaGroups(project),[project]),generation=useRef(0),folderInput=useRef(null),origin=useRef(project.id);
 const [report,setReport]=useState({}),[staged,setStaged]=useState({}),[candidates,setCandidates]=useState({}),[errors,setErrors]=useState({}),[busy,setBusy]=useState(null),[notice,setNotice]=useState(''),[showAll,setShowAll]=useState(false),[query,setQuery]=useState(''),[limit,setLimit]=useState(100);
 useEffect(()=>()=>{generation.current++;},[]);
 const valid=token=>token===generation.current&&useProjectStore.getState().project.id===origin.current;
 const check=async()=>{
  const token=++generation.current;setBusy('Проверяем доступ к файлам…');setNotice('');
  try{if(!window.istoriya?.auditMedia)throw Error('Проверка доступности файлов работает в Rust-приложении. Здесь можно вручную выбрать и заменить файл.');const rows=await window.istoriya.auditMedia(groups.filter(g=>!g.embedded));if(valid(token)){setReport(Object.fromEntries(rows.map(row=>[row.source,row])));setNotice('Доступность проверена. Это не полная проверка содержимого и кодеков файлов.');}}
  catch(error){if(valid(token))setNotice(error.message);}
  finally{if(valid(token))setBusy(null);}
 };
 useEffect(()=>{void check();},[]);
 const status=group=>failedSources.includes(group.source)?{status:'decode-error',message:'Изображение не открылось. Выберите исправный файл или восстановите исходный и вернитесь к ресурсам.'}:group.embedded?{status:'embedded',message:'Файл встроен в проект. Содержимое не проверялось.'}:report[group.source];
 const read=async(group,file,token)=>{
  try{const kind=group.refs[0].kind;if(!kind||group.refs.some(r=>r.kind!==kind))throw Error('Один файл используется как разные типы медиа. Замените отдельный ресурс в библиотеке.');const resource=await readMediaFile(file,{kind});if(!valid(token))return false;setStaged(previous=>({...previous,[group.id]:{source:group.source,signature:group.signature,resource,path:file.webkitRelativePath||file.name,selected:true}}));setErrors(previous=>({...previous,[group.id]:''}));return true;}
  catch(error){if(valid(token))setErrors(previous=>({...previous,[group.id]:error.message}));return false;}
 };
 const choose=async(group,file)=>{const token=++generation.current;setBusy(`Проверяем «${file.name}»…`);setNotice('');await read(group,file,token);if(valid(token))setBusy(null);};
 const chooseFolder=async files=>{
  const token=++generation.current,index=indexMediaFolder(files);setBusy('Ищем совпадения по именам…');setNotice('');let count=0,ambiguous=0;const matches={};
  const wanted=groups.filter(g=>showAll||problem(status(g)));
  for(let i=0;i<wanted.length;i++){
   const group=wanted[i],found=folderMediaCandidates(group,index);if(!valid(token))return;matches[group.id]=found;
   if(found.length===1){setBusy(`Проверяем файлы · ${i+1} / ${wanted.length}`);if(await read(group,found[0],token))count++;}else if(found.length>1)ambiguous++;
  }
  if(valid(token)){setCandidates(matches);setBusy(null);setNotice(`Подготовлено замен: ${count}. Неоднозначных совпадений: ${ambiguous}. Проверьте выбор и нажмите «Применить». Проект пока не изменён.`);}
 };
 const selected=Object.values(staged).filter(entry=>entry.selected),apply=()=>{
  try{const count=useProjectStore.getState().repairMedia({projectId:origin.current,entries:selected.map(({selected,path,...entry})=>entry)});setStaged({});setCandidates({});setErrors({});setReport({});setNotice(`Заменено ссылок: ${count}. Названия и связи сохранены. Всю операцию можно отменить через Ctrl+Z.`);}
  catch(error){setNotice(error.message);}
 };
 const filtered=groups.filter(g=>(showAll||problem(status(g))||staged[g.id])&&(!query||`${g.label} ${g.names.join(' ')} ${g.usages.join(' ')}`.toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru'))));
 return <section className="media-repair-workspace" aria-label="Восстановление ресурсов">
  <header><button className="button secondary" onClick={onBack}><ArrowLeft/>К ресурсам</button><div><h2>Восстановить файлы проекта</h2><p>Замена сохраняет сцены, названия, спрайты и игровые связи. Изменения применяются только после подтверждения.</p></div></header>
  <div className="media-repair-toolbar"><button className="button secondary" disabled={!!busy} onClick={()=>void check()}><ArrowClockwise/>Проверить доступность</button><button className="button secondary" disabled={!!busy} onClick={()=>folderInput.current?.click()}><FolderOpen/>Найти в папке…</button><label><input type="checkbox" checked={showAll} onChange={e=>{setShowAll(e.target.checked);setLimit(100);}}/>Показать все файлы</label><label className="media-repair-search"><MagnifyingGlass/><input type="search" aria-label="Поиск восстанавливаемых файлов" placeholder="Название или место использования" value={query} onChange={e=>{setQuery(e.target.value);setLimit(100);}}/></label></div>
  <p className="media-repair-explanation">Поиск в папке использует имена файлов, не угадывает содержимое. При нескольких совпадениях выбор остаётся за вами. PNG/WebP/JPEG, MP3/WAV/OGG, TTF/OTF проверяются перед заменой.</p>
  <div className="media-repair-list">{filtered.slice(0,limit).map(group=>{const current=status(group),entry=staged[group.id],found=candidates[group.id]??[];return <article key={group.id} className="media-repair-row" aria-label={group.label}>
   <div className="media-repair-description"><h3>{group.label}</h3><strong>{group.names[0]||'Имя файла не сохранено'}</strong><p className={`media-status ${problem(current)?'unavailable':''}`}>{current?.message??'Ещё не проверен.'}</p><p className="media-old-path">{sourceLabel(group.source)}</p><details><summary>Где используется · {group.usages.length}</summary><ul>{group.usages.map(label=><li key={label}>{label}</li>)}</ul></details></div>
   <div className="media-repair-replacement"><ReplacementInput group={group} busy={busy} onChoose={choose}/>
    {found.length>1&&<label className="field"><span>Несколько совпадений — выберите файл</span><select disabled={!!busy} value={found.some(file=>(file.webkitRelativePath||file.name)===entry?.path)?String(found.findIndex(file=>(file.webkitRelativePath||file.name)===entry.path)):''} aria-label={`Совпадения: ${group.label}`} onChange={e=>{if(e.target.value!=='')void choose(group,found[Number(e.target.value)]);}}><option value="">Не выбрано</option>{found.map((file,i)=><option key={i} value={i}>{file.webkitRelativePath||file.name}</option>)}</select></label>}
    {entry&&<div className="media-staged"><label><input type="checkbox" checked={entry.selected} onChange={e=>setStaged(previous=>({...previous,[group.id]:{...entry,selected:e.target.checked}}))}/>Применить эту замену</label><strong>{entry.path}</strong><small>{entry.resource.width?`${entry.resource.width} × ${entry.resource.height}`:entry.resource.duration?`${entry.resource.duration.toFixed(1)} сек.`:entry.resource.mime}</small></div>}
    {errors[group.id]&&<p role="alert" className="media-repair-error">{errors[group.id]}</p>}
   </div>
  </article>;})}{!filtered.length&&<div className="media-repair-empty"><h3>{query?'Ничего не найдено':'Нет непроверенных или недоступных файлов'}</h3><p>Чтобы заменить встроенное медиа или доступный файл, включите «Показать все файлы».</p></div>}{filtered.length>limit&&<button className="button secondary" onClick={()=>setLimit(n=>n+100)}>Показать ещё · осталось {filtered.length-limit}</button>}</div>
  <footer>{busy?<div role="status"><span>{busy}</span><button className="button secondary" onClick={()=>{generation.current++;setBusy(null);setNotice('Подготовка отменена. Проект не изменён; уже подготовленные замены не применены.');}}>Отменить проверку</button></div>:<p role="status">{notice||`Файлов в проекте: ${groups.length}. Выберите замену для недоступных ресурсов.`}</p>}<div><button className="button secondary" disabled={!!busy||!Object.keys(staged).length} onClick={()=>{setStaged({});setErrors({});setNotice('Подготовленные замены отменены.');}}>Отменить замены</button><button className="button primary" disabled={!!busy||!selected.length} onClick={apply}>Применить замен · {selected.length}</button></div></footer>
  <input ref={folderInput} hidden type="file" multiple webkitdirectory="" aria-label="Папка для поиска ресурсов" onChange={e=>{const files=Array.from(e.target.files??[]);e.target.value='';if(files.length)void chooseFolder(files);}}/>
 </section>;
}
