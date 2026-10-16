import React from "react";
import { createRoot } from "react-dom/client";
import { initializeDesktop } from './platform/desktop.js';
import {invoke} from '@tauri-apps/api/core';
import {createDiagnostics,installDiagnosticListeners,reportEditorError} from './platform/diagnostics.js';
import {DiagnosticsHost,DiagnosticsButton} from './components/Diagnostics.jsx';
import {ProfileStorageHost,ProfileStorageDialog,ProfileStorageButton,ProfileStartupRecovery,CloseConfirmationHost} from './components/ProfileStorage.jsx';
import {createProfileService,prepareProfileTransfer} from './platform/profileStorage.js';
import {createCloseConfirmation} from './platform/closeGuard.js';
import "./styles.css";
import "./workspace.css";

// Independent of project storage and App: diagnostics must survive their failure.
window.istoriyaDiagnostics=createDiagnostics({version:import.meta.env.VITE_APP_VERSION,call:window.__TAURI_INTERNALS__?(operation,payload=null)=>invoke('desktop',{operation,payload}):undefined});
installDiagnosticListeners(window,window.istoriyaDiagnostics);
const root=createRoot(document.getElementById('root'));
window.istoriyaCloseConfirmation=createCloseConfirmation();
let authorReady=false;
if(window.__TAURI_INTERNALS__)window.istoriyaProfile=createProfileService((operation,payload=null)=>invoke('desktop',{operation,payload}),{prepare:()=>authorReady?prepareProfileTransfer():Promise.resolve()});
const show=content=>root.render(<React.StrictMode>{content}<ProfileStorageHost/><DiagnosticsHost/><CloseConfirmationHost/></React.StrictMode>);
async function boot(){
 try{
  if(window.istoriyaProfile){
   const status=await window.istoriyaProfile.status();
   if(status.startupError){show(<ProfileStartupRecovery error={status.startupError}/>);return;}
   if(['copying','ready'].includes(status.phase)){show(<><main className="recovery-screen"><h1>Завершите перенос хранилища</h1><p>Библиотека откроется после перезапуска или отмены переключения.</p></main><ProfileStorageDialog onClose={()=>window.location.reload()}/></>);return;}
   try{await window.istoriyaProfile.restoreUi();}catch(error){reportEditorError('bootstrap',error);show(<ProfileStartupRecovery uiImport error={error.message}/>);return;}
  }
  await initializeDesktop();
  const [{App},{RecoveryBoundary}]=await Promise.all([import('./App.jsx'),import('./components/RecoveryBoundary.jsx')]);
  authorReady=true;show(<RecoveryBoundary><App/></RecoveryBoundary>);
 }catch(error){
  reportEditorError('bootstrap',error);
  show(<main className="recovery-screen" role="alert"><h1>Не удалось открыть редактор</h1><p>Ваши сохранённые проекты не удалены. Скопируйте диагностику и повторите запуск.</p><DiagnosticsButton/><ProfileStorageButton/><button className="button secondary" onClick={()=>window.location.reload()}>Повторить запуск</button></main>);
 }
}
await boot();
