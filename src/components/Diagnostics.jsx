import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {ArrowClockwise,Copy,FolderOpen,Lifebuoy,X} from '@phosphor-icons/react';
import {openDiagnostics} from '../platform/diagnostics.js';
import {visibleDialogControl,holdDialogActionFocus} from '../domain/dialogFocus.js';
import {openProfileStorage} from '../platform/profileStorage.js';
import './diagnostics.css';

export function DiagnosticsButton({className='button secondary'}){return <button type="button" className={className} onClick={openDiagnostics}><Lifebuoy/>Диагностика редактора</button>;}
function bytes(value){if(!Number.isFinite(value))return 'Не удалось определить';return new Intl.NumberFormat('ru-RU',{maximumFractionDigits:1}).format(value/1024/1024/1024)+' ГБ';}
export function DiagnosticsDialog({onClose}){
 const [data,setData]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState(''),[details,setDetails]=useState(false);
 const root=useRef(null),report=useRef(null),mounted=useRef(false),pending=useRef(false),close=useRef(onClose);close.current=onClose;
 const action=async task=>{if(pending.current)return;pending.current=true;const restoreFocus=holdDialogActionFocus(root.current);setBusy(true);setError('');setStatus('');try{await task();}catch(error){if(mounted.current){setError(error?.message||'Не удалось получить диагностику. Повторите попытку.');setDetails(true);}}finally{pending.current=false;if(mounted.current){setBusy(false);requestAnimationFrame(()=>{if(mounted.current)restoreFocus();});}}};
 const refresh=()=>action(async()=>{const next=await window.istoriyaDiagnostics.snapshot();if(mounted.current)setData(next);});
 useEffect(()=>{mounted.current=true;const previous=document.activeElement;root.current?.querySelector('button')?.focus();void refresh();return()=>{mounted.current=false;if(previous?.isConnected)previous.focus();};},[]);
 const keyDown=event=>{event.stopPropagation();if(event.key==='Escape'){event.preventDefault();close.current();return;}if(event.key!=='Tab')return;const fields=[...root.current.querySelectorAll('button:not(:disabled),textarea,summary,[tabindex="0"]')].filter(visibleDialogControl),first=fields[0],last=fields.at(-1);if(document.activeElement===root.current){event.preventDefault();(event.shiftKey?last:first)?.focus();}else if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}};
 const copy=()=>action(async()=>{const result=await window.istoriyaDiagnostics.copy();if(mounted.current)setStatus(result.isolatedQa?'QA-копия отчёта записана отдельно. Системный буфер обмена не изменён.':'Техническая информация скопирована. Можно передать её вместе с описанием проблемы.');});
 const open=()=>action(async()=>{const result=await window.istoriyaDiagnostics.openLogs();if(mounted.current)setStatus(result.isolatedQa?'QA-путь журналов проверен. Окно Проводника не открывалось.':'Папка журналов открыта.');});
 return createPortal(<div className="diagnostics-backdrop" onPointerDown={e=>{if(e.target===e.currentTarget)close.current();}}><section className="diagnostics-dialog" ref={root} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="diagnostics-title" onKeyDown={keyDown}>
  <header><div><h2 id="diagnostics-title">Диагностика редактора</h2><p>Помогает разобраться в сбое, не меняя ваш проект.</p></div><button type="button" className="icon-button" aria-label="Закрыть диагностику" onClick={()=>close.current()}><X/></button></header>
  <div className="diagnostics-body" aria-busy={busy}>
   {data?<><dl className="diagnostics-summary"><div><dt>Версия</dt><dd>{data.version} · {data.backend==='rust'?'Windows-приложение':data.backend==='unavailable'?'Нативный компонент недоступен':'Браузер'}</dd></div><div><dt>Журнал</dt><dd>{data.journalAvailable?'Записывается на диск':data.backend==='browser'?'Только текущий сеанс в памяти':'Не записывается — отчёт доступен из памяти'}</dd></div>{data.backend==='rust'&&<div><dt>Свободно в профиле</dt><dd>{bytes(data.freeBytes)}</dd></div>}</dl>
    {data.backend==='unavailable'&&<p className="diagnostics-warning" role="alert">Не удалось связаться с нативным компонентом. Доступна только диагностика интерфейса. Повторите запрос; текущий проект не изменён.</p>}
    {data.backend==='rust'&&!data.journalAvailable&&<p className="diagnostics-warning" role="alert">Не удалось записать журнал. Проверьте свободное место и права на папку профиля. Текущий отчёт можно скопировать.</p>}
    {Number.isFinite(data.freeBytes)&&data.freeBytes<1024*1024*1024&&<p className="diagnostics-warning" role="alert">В профиле меньше 1 ГБ свободного места. Сохранение ресурсов и сборка могут завершиться ошибкой. Установка программы на другой диск не переносит профиль. <button type="button" className="button secondary" onClick={()=>{close.current();openProfileStorage();}}>Выбрать папку хранилища</button></p>}
    {data.runtime&&Object.values(data.runtime).some(ready=>!ready)&&<p className="diagnostics-warning" role="alert">Отсутствует компонент сборки. Переустановите редактор полным установщиком, сохранив проекты и резервные копии.</p>}
   </>:<p role="status">Получаем сведения о редакторе…</p>}
   <p className="diagnostics-privacy">Отчёт содержит версию, состояние компонентов и последние операции. Без текстов истории, файлов ресурсов, имён проектов и полных путей. Ничего не отправляется автоматически.</p>
   <div className="diagnostics-actions"><button type="button" className="button primary" disabled={busy||!data} onClick={copy}><Copy/>Скопировать техническую информацию</button><button type="button" className="button secondary" disabled={busy||!data?.logsAvailable||data.backend!=='rust'} onClick={open}><FolderOpen/>Открыть папку журналов</button><button type="button" className="button secondary" disabled={busy} onClick={refresh}><ArrowClockwise/>Обновить</button></div>
   {error&&<p className="diagnostics-warning" role="alert">{error}</p>}{status&&<p className="diagnostics-status" role="status">{status}</p>}
   <details open={details} onToggle={event=>setDetails(event.currentTarget.open)}><summary>Технические подробности</summary>{data?.storagePath&&<p className="diagnostics-path">Профиль на этом компьютере: <span>{data.storagePath}</span></p>}<label>Отчёт для поддержки<textarea ref={report} readOnly spellCheck="false" value={data?.report??''}/></label><button type="button" className="button secondary" disabled={!data} onClick={()=>{report.current?.focus();report.current?.select();setStatus('Отчёт выделен. Нажмите Ctrl+C, чтобы скопировать вручную.');}}>Выделить отчёт</button></details>
  </div>
 </section></div>,document.body);
}
export function DiagnosticsHost(){const [open,setOpen]=useState(false);useEffect(()=>{const show=()=>setOpen(true);window.addEventListener('istoriya-open-diagnostics',show);return()=>window.removeEventListener('istoriya-open-diagnostics',show);},[]);return open?<DiagnosticsDialog onClose={()=>setOpen(false)}/>:null;}
