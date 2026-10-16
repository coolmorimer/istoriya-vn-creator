import {useEffect,useRef,useState} from 'react';
import {ArrowCounterClockwise,FileText,DownloadSimple,WarningCircle} from '@phosphor-icons/react';
import {useProjectStore} from '../store/projectStore.js';
import {RecoveryBackupButton} from './RecoveryBoundary.jsx';
import {DiagnosticsButton} from './Diagnostics.jsx';
import {saveRawRecovery} from '../platform/recoveryDownload.js';
import './startup-recovery.css';
const date=value=>{const timestamp=Date.parse(value);return Number.isFinite(timestamp)?new Intl.DateTimeFormat('ru',{dateStyle:'medium',timeStyle:'short'}).format(timestamp):'Дата неизвестна';};
function Version({title,project,savedAt,selection}){
 if(!project)return <section className="startup-recovery-version"><h2>{title}</h2><p>Сохранённой версии этого проекта пока нет.</p></section>;
 const scenes=Object.values(project.scenes),scene=project.scenes[selection?.activeSceneId]??scenes[0],action=scene?.actions.find(a=>a.id===selection?.activeActionId)??scene?.actions.find(a=>a.text);
 return <section className="startup-recovery-version"><h2>{title}</h2><strong>{project.meta.title}</strong><dl><div><dt>Записан</dt><dd>{date(savedAt)}</dd></div><div><dt>Сцены / шаги</dt><dd>{scenes.length} / {scenes.reduce((count,s)=>count+s.actions.length,0)}</dd></div></dl>{action?.text&&<p className="startup-recovery-excerpt">{action.text.length>240?`${action.text.slice(0,240)}…`:action.text}</p>}</section>;
}
export function StartupRecovery({onResolved}){
 const recovery=useProjectStore(s=>s.recovery),current=useProjectStore(s=>s.project),[confirmDiscard,setConfirmDiscard]=useState(false),[backupBusy,setBackupBusy]=useState(false),[rawStatus,setRawStatus]=useState(''),root=useRef(null);
 useEffect(()=>{root.current?.querySelector('button:not(:disabled)')?.focus();},[]);
 if(!recovery)return null;
 const busy=recovery.busy||backupBusy,saved=recovery.saved??(recovery.project?.id===current.id?current:null);
 const resolve=async decision=>{if(await useProjectStore.getState().resolveRecovery(decision))onResolved(decision);};
 const rawCopy=async()=>{let raw=recovery.raw;try{const value=JSON.parse(raw);raw=JSON.stringify(window.istoriya?.projectFileReferences?.(value)??value,null,2);}catch{/* Preserve damaged JSON verbatim for manual recovery. */}setBackupBusy(true);setRawStatus('');try{const result=await saveRawRecovery(raw,window.istoriya);setRawStatus(result?.canceled?'Сохранение копии отменено.':result?.filePath?`Исходный черновик сохранён: ${result.filePath}`:'Исходный черновик подготовлен к скачиванию.');}catch(error){setRawStatus(error.message);}finally{setBackupBusy(false);}};
 return <main className="startup-recovery" ref={root} aria-labelledby="startup-recovery-title" onKeyDown={event=>{if(event.key==='Escape'&&confirmDiscard&&!busy){event.preventDefault();setConfirmDiscard(false);}}}>
  <div className="startup-recovery-content"><header><ArrowCounterClockwise size={30}/><div><h1 id="startup-recovery-title">Найден черновик проекта</h1><p>Работа могла прерваться до обычного сохранения. Выберите, какую версию продолжить. Пока вы выбираете, файлы не изменяются.</p></div></header>
   <div className="startup-recovery-versions"><Version title="Черновик" project={recovery.project} savedAt={recovery.savedAt} selection={recovery.selection}/><Version title="Сохранённая версия" project={saved} savedAt={saved?.meta.modifiedAt} selection={recovery.selection}/></div>
   {recovery.error&&<p role="alert" className="startup-recovery-error"><WarningCircle/>{recovery.error}</p>}
   {confirmDiscard?<section className="startup-recovery-discard" aria-label="Подтверждение отказа от черновика"><h2>Не восстанавливать черновик?</h2><p>Несохранённые правки будут отброшены. Сохранённые проекты останутся. Если сомневаетесь, сначала скачайте копию ниже.</p><div><button className="button secondary" disabled={busy} onClick={()=>setConfirmDiscard(false)}>Назад к выбору</button><button className="button danger-button" disabled={busy} onClick={()=>void resolve('saved')}>Не восстанавливать</button></div></section>:<div className="startup-recovery-actions"><button className="button primary" disabled={busy||!recovery.project} onClick={()=>void resolve('restore')}><ArrowCounterClockwise/>{recovery.busy?'Записываем выбранную версию…':'Восстановить черновик'}</button><button className="button secondary" disabled={busy} onClick={()=>setConfirmDiscard(true)}><FileText/>{saved?'Оставить сохранённую версию':'Открыть библиотеку без черновика'}</button></div>}
   <div className="startup-recovery-backup">{recovery.project?<RecoveryBackupButton project={recovery.project} disabled={recovery.busy} onBusyChange={setBackupBusy} buttonClassName="button secondary">Скачать черновик</RecoveryBackupButton>:<button className="button secondary" disabled={busy} onClick={rawCopy}><DownloadSimple/>Скачать исходный черновик</button>}<p>Можно закрыть редактор сейчас: обе копии останутся доступны при следующем запуске.</p></div>
   <p className="startup-recovery-status" role="status">{recovery.busy?'Дождитесь окончания записи. Сообщение исчезнет только после успешного сохранения.':recovery.error?'Не удалось завершить выбор. Черновик сохранён; повторите попытку или скачайте копию.':'Черновик удаляется только после подтверждённого выбора и успешной записи.'}</p>
   {rawStatus&&<p className="startup-recovery-status" role="status">{rawStatus}</p>}<DiagnosticsButton/>
  </div>
 </main>;
}
