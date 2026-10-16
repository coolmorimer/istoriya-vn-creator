import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {createPortal} from 'react-dom';
import {ArrowClockwise,FolderOpen,HardDrives,X} from '@phosphor-icons/react';
import {visibleDialogControl,holdDialogActionFocus} from '../domain/dialogFocus.js';
import {openProfileStorage} from '../platform/profileStorage.js';
import {DiagnosticsButton} from './Diagnostics.jsx';
import './profile-storage.css';

const formatBytes=value=>Number.isFinite(value)?new Intl.NumberFormat('ru-RU',{maximumFractionDigits:1}).format(value/(1024**3))+' ГБ':'Не удалось определить';
const controls=root=>[...root.querySelectorAll('button:not(:disabled),input:not(:disabled),summary,[tabindex="0"]')].filter(visibleDialogControl);
function contain(event,root,close){
 event.stopPropagation();if(event.key==='Escape'){event.preventDefault();close();return;}
 if(event.key!=='Tab')return;const fields=controls(root),first=fields[0],last=fields.at(-1);
 if(document.activeElement===root||!root.contains(document.activeElement)){event.preventDefault();(event.shiftKey?last:first)?.focus();}
 else if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
 else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
}
export function ProfileStorageButton({className='button secondary',onOpen}){
 return <button type="button" className={className} onClick={()=>{onOpen?.();openProfileStorage();}}><HardDrives/>Хранилище редактора</button>;
}
export function ProfileStorageDialog({service=window.istoriyaProfile,onClose}){
 const [data,setData]=useState(null),[busy,setBusy]=useState(false),[canceling,setCanceling]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[includeUi,setIncludeUi]=useState(true),[confirmRollback,setConfirmRollback]=useState(false);
 const root=useRef(null),mounted=useRef(false),pending=useRef(false),cancelPending=useRef(false),close=useRef(onClose);close.current=onClose;
 const locked=['copying','ready'].includes(data?.phase);
 const refresh=async()=>{try{const next=await service.status();if(mounted.current)setData(next);}catch(err){if(mounted.current)setError(err.message);}};
 useEffect(()=>{mounted.current=true;const previous=document.activeElement;root.current?.focus();if(service)void refresh();const timer=service?setInterval(refresh,1000):null;return()=>{mounted.current=false;clearInterval(timer);if(previous?.isConnected)previous.focus();};},[service]);
 const action=async task=>{
  if(pending.current)return;pending.current=true;const restore=holdDialogActionFocus(root.current);setBusy(true);setError('');setMessage('');
  try{await task();}catch(err){if(mounted.current)setError(err.message||'Не удалось завершить перенос. Исходные данные сохранены.');}
  finally{pending.current=false;if(mounted.current){await refresh();setBusy(false);requestAnimationFrame(()=>{if(mounted.current)restore();});}}
 };
 const dismiss=()=>{if(locked||pending.current||cancelPending.current)return;if(data?.phase==='planned')void action(async()=>{await service.cancel();close.current();});else close.current();};
 const cancel=async()=>{if(cancelPending.current)return;cancelPending.current=true;const restore=holdDialogActionFocus(root.current);setCanceling(true);setError('');try{const result=await service.cancel();if(mounted.current){setData(result);setMessage(result.phase==='copying'?'Отмена запрошена. Дождитесь завершения текущей операции.':'Перенос отменён. Исходный профиль остаётся активным; копия не удалена.');}}catch(err){if(mounted.current)setError(err.message);}finally{cancelPending.current=false;if(mounted.current){setCanceling(false);requestAnimationFrame(restore);}}};
 const restart=()=>action(async()=>{const result=await service.restart();if(result?.isolatedQa)setMessage('QA-перезапуск подтверждён. Тестовый процесс должен быть запущен заново; пользовательское приложение не запускалось.');});
 return createPortal(<div className="profile-storage-backdrop" onPointerDown={event=>{if(event.target===event.currentTarget)dismiss();}}><section ref={root} tabIndex={-1} className="profile-storage-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-storage-title" onKeyDown={event=>contain(event,root.current,dismiss)}>
  <header><div><h2 id="profile-storage-title">Хранилище редактора</h2><p>Библиотека, файлы и настройки — на удобном диске.</p></div><button type="button" className="icon-button" aria-label="Закрыть хранилище" disabled={locked||busy||canceling} onClick={dismiss}><X/></button></header>
  <div className="profile-storage-body">
   {!service?<p>Перенос папки доступен в Windows-приложении. Браузер хранит данные отдельно и не может управлять каталогом настольного редактора.</p>:data?<>
    {data.startupError&&<p className="profile-storage-error" role="alert">{data.startupError} Библиотека не открыта; пустой проект вместо неё не создаётся.</p>}
    <dl><div><dt>Активная папка данных</dt><dd>{data.startupError?(data.selectedPath||'Выбор профиля повреждён'):data.sourcePath}</dd></div><div><dt>Свободно на диске</dt><dd>{formatBytes(data.freeBytes)}{data.startupError?' · сведения о резервной системной папке':''}</dd></div></dl>
    {data.externalOverride&&<p className="profile-storage-note">Папка задана внешними параметрами запуска. Встроенный перенос отключён; запустите редактор обычным способом.</p>}
    {!locked&&!data.startupError&&<>
     <h3>Перенести на другой диск</h3><p>Редактор создаст отдельную папку, скопирует библиотеку и ресурсы и проверит файлы. Старый профиль останется резервной копией — место в нём автоматически не освобождается.</p>
     <button type="button" className="button secondary" disabled={busy||!data.canMove} onClick={()=>action(async()=>{const result=await service.choose();if(!result.canceled)setData(result);})}><FolderOpen/>{data.phase==='planned'?'Выбрать другую папку':'Выбрать папку…'}</button>
     {data.phase==='planned'&&<div className="profile-storage-plan"><h3>Новая папка</h3><p className="profile-storage-path">{data.targetPath}</p><label className="profile-storage-check"><input type="checkbox" checked={includeUi} disabled={busy} onChange={event=>setIncludeUi(event.target.checked)}/>Перенести компоновку и тестовые сохранения</label>{!includeUi&&<p className="profile-storage-note">Они останутся в старом профиле. В новом начнутся с исходных настроек. Проекты и ресурсы всё равно будут скопированы.</p>}<button type="button" className="button primary" disabled={busy} onClick={()=>action(async()=>setData(await service.start(data.planId,{includeUi})))}>Скопировать и проверить</button></div>}
     <p className="profile-storage-note">Внешние файлы .vnproject останутся в выбранных вами папках. Кэш окна будет создан заново на новом диске. До переноса нужно сохранить изменения и завершить сборку игры.</p>
    </>}
    {data.phase==='copying'&&<section className="profile-storage-progress" aria-label="Прогресс переноса"><h3>Копируем и проверяем файлы</h3><progress aria-label="Перенос профиля"/><p role="status">Обработано данных: {formatBytes(data.doneBytes)} · проверено файлов: {data.copiedFiles}</p><p>Редактирование временно приостановлено. Отмена не удаляет исходные данные или уже созданную часть копии.</p><button type="button" className="button secondary" disabled={canceling} onClick={cancel}>{canceling?'Отменяем…':'Отменить перенос'}</button></section>}
    {data.phase==='ready'&&<section className="profile-storage-ready"><h3>Папка готова к открытию</h3><p className="profile-storage-path">{data.nextPath||data.targetPath}</p><p>Перезапустите редактор, чтобы открыть выбранный профиль. До этого изменения заблокированы. Исходная папка не удалена.</p><div className="profile-storage-actions"><button type="button" className="button primary" disabled={busy||canceling} onClick={restart}><ArrowClockwise/>Перезапустить редактор</button><button type="button" className="button secondary" disabled={busy||canceling} onClick={cancel}>Отменить переключение</button></div></section>}
    {!locked&&data.canRollback&&<details className="profile-storage-rollback"><summary>Вернуться к предыдущему профилю</summary><p className="profile-storage-path">{data.previousPath}</p><p>Это переключение между копиями, не объединение. Изменения после переноса останутся только в текущей папке. Ничего не удаляется.</p>{!confirmRollback?<button type="button" className="button secondary" disabled={busy} onClick={()=>setConfirmRollback(true)}>Выбрать предыдущий профиль</button>:<div className="profile-storage-actions"><button type="button" className="button primary" disabled={busy} onClick={()=>action(async()=>{setData(await service.rollback());setConfirmRollback(false);})}>Подтвердить возврат</button><button type="button" className="button secondary" disabled={busy} onClick={()=>setConfirmRollback(false)}>Оставить текущий</button></div>}</details>}
    {data.phase==='canceled'&&!message&&<p role="status">Перенос отменён. Исходный профиль не изменён; созданная копия сохранена.</p>}
   </>:<p role="status">Читаем параметры хранилища…</p>}
   {busy&&data?.phase!=='copying'&&data?.phase!=='ready'&&<p role="status">Подготавливаем перенос…</p>}
   {(error||data?.error)&&<p className="profile-storage-error" role="alert">{error||data.error}</p>}{message&&<p className="profile-storage-message" role="status">{message}</p>}
  </div>
 </section></div>,document.body);
}
export function ProfileStorageHost(){
 const [open,setOpen]=useState(false);
 useEffect(()=>{const show=()=>setOpen(true);window.addEventListener('istoriya-open-profile-storage',show);return()=>window.removeEventListener('istoriya-open-profile-storage',show);},[]);
 return open?<ProfileStorageDialog onClose={()=>setOpen(false)}/>:null;
}
export function ProfileStartupRecovery({error,uiImport=false}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const retry=async()=>{setBusy(true);try{if(uiImport)window.location.reload();else{const result=await window.istoriyaProfile.restart();if(result?.isolatedQa)setMessage('QA-перезапуск подтверждён. Запустите этот тестовый профиль заново.');}}catch(err){setMessage(err.message);}finally{setBusy(false);}};
 return <main className="recovery-screen profile-startup-recovery"><h1>{uiImport?'Не удалось перенести настройки':'Папка библиотеки недоступна'}</h1><p>{error}</p><p>Ваши данные не удалены. Подключите нужный диск и повторите запуск или явно выберите предыдущий профиль. Редактор не подменяет его пустой библиотекой.</p><div><button type="button" className="button primary" disabled={busy} onClick={retry}>Повторить запуск</button><ProfileStorageButton/><DiagnosticsButton/></div>{message&&<p role="status">{message}</p>}</main>;
}
export function CloseConfirmationHost(){
 const service=window.istoriyaCloseConfirmation,state=useSyncExternalStore(service.subscribe,service.getSnapshot),root=useRef(null);
 useEffect(()=>{if(!state)return;const previous=document.activeElement;root.current?.querySelector('button')?.focus();return()=>{if(previous?.isConnected)previous.focus();};},[state]);
 if(!state)return null;
 return createPortal(<div className="profile-storage-backdrop close-confirmation-backdrop"><section ref={root} tabIndex={-1} className="profile-storage-dialog close-confirmation-dialog" role="dialog" aria-modal="true" aria-labelledby="close-confirmation-title" onKeyDown={event=>contain(event,root.current,()=>service.answer(false))}><header><h2 id="close-confirmation-title">Не удалось подтвердить сохранение</h2></header><div className="profile-storage-body"><p>Изменения могут остаться только в памяти. Вернитесь в редактор, чтобы повторить сохранение или сделать резервную копию. Закрытие без сохранения может потерять последние изменения.</p><div className="profile-storage-actions"><button type="button" className="button primary" onClick={()=>service.answer(false)}>Вернуться в редактор</button><button type="button" className="button secondary" onClick={()=>service.answer(true)}>Закрыть без сохранения</button></div></div></section></div>,document.body);
}
