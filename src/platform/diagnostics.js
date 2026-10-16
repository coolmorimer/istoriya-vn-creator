import {nativeError} from './nativeError.js';
const LIMIT=64;
const TYPES=new Set(['TypeError','ReferenceError','SyntaxError','RangeError','DOMException']);
const KINDS=new Set(['render','bootstrap','window-error','unhandled-rejection']);
export async function rendererErrorDetails(kind,error,componentStack=''){
 let name='Error',message='',stack='';
 try{name=TYPES.has(error?.name)?error.name:'Error';message=typeof error?.message==='string'?error.message:typeof error==='string'?error:'';stack=typeof error?.stack==='string'?error.stack:'';}catch{/* Host objects may throw from getters. */}
 const frames=[...`${stack}\n${typeof componentStack==='string'?componentStack:''}`.slice(0,32768).matchAll(/(?:\.jsx?|\.tsx?):(\d+):(\d+)/g)].slice(0,8).map(match=>({line:Number(match[1]),column:Number(match[2])})).filter(frame=>frame.line<=10_000_000&&frame.column<=10_000_000);
 let fingerprint='';try{const bytes=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(message.slice(0,65536)));fingerprint=[...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('');}catch{/* A digest is optional, raw text is never a fallback. */}
 return {kind:KINDS.has(kind)?kind:'window-error',errorType:name,frames,fingerprint};
}
export function createDiagnostics({call,version='unknown',now=()=>Date.now()}={}){
 const events=[];let pending=Promise.resolve(),queued=0,dropped=0;
 const record=(kind,error,stack='')=>{
  // Fault storms cannot allocate an unbounded queue or stall author saving.
  if(queued>=16){dropped++;return Promise.resolve(false);}queued++;
  const task=pending.then(async()=>{const details=await rendererErrorDetails(kind,error,stack);events.push({at:now(),operation:'renderer',outcome:'error',renderer:details});if(events.length>LIMIT)events.shift();if(call)try{await call('renderer-error',details);}catch{dropped++;}return true;});
  pending=task.catch(()=>false).finally(()=>{queued--;});return pending;
 };
 const local=backend=>({version,os:'browser',architecture:null,backend,journalAvailable:false,logsAvailable:false,freeBytes:null,report:JSON.stringify({format:'istoriya-diagnostics-1',version,backend,collectedAt:now(),journal:{persisted:false,droppedEvents:dropped},events},null,2)});
 return {
  record,
  async snapshot(){await pending;if(!call)return local('browser');try{return {...await call('diagnostics'),backend:'rust'};}catch{return local('unavailable');}},
  async copy(){await pending;if(call){let result;try{result=await call('copy-diagnostics');}catch(error){throw nativeError(error);}if(result?.copied!==true)throw Error('Копирование не подтверждено. Выделите отчёт и нажмите Ctrl+C.');return result;}const snapshot=local('browser');if(!globalThis.navigator?.clipboard?.writeText)throw Error('Буфер обмена недоступен. Раскройте технические подробности, выделите отчёт и нажмите Ctrl+C.');await globalThis.navigator.clipboard.writeText(snapshot.report);return {copied:true};},
  async openLogs(){if(!call)throw Error('В браузере журнал хранится только в памяти.');let result;try{result=await call('open-logs');}catch(error){throw nativeError(error);}if(result?.opened!==true)throw Error('Открытие папки не подтверждено.');return result;},
 };
}
export function installDiagnosticListeners(target,diagnostics){
 const error=event=>{void diagnostics.record('window-error',event.error??Error(event.message||''));};
 const rejection=event=>{void diagnostics.record('unhandled-rejection',event.reason);};
 target.addEventListener('error',error);target.addEventListener('unhandledrejection',rejection);
 return()=>{target.removeEventListener('error',error);target.removeEventListener('unhandledrejection',rejection);};
}
export function reportEditorError(kind,error,stack=''){void globalThis.window?.istoriyaDiagnostics?.record(kind,error,stack);}
export function openDiagnostics(){globalThis.window?.dispatchEvent(new Event('istoriya-open-diagnostics'));}
