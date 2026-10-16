import { invoke,convertFileSrc } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {createBrowserStorage} from './browserStorage.js';
import {createNativeCaller} from './nativeError.js';
import {createNativeMedia,auditNativeMedia} from './nativeMedia.js';
import {createNativeStorage} from './nativeStorage.js';
import {closeEditorSafely} from './closeGuard.js';
import {reportEditorError} from './diagnostics.js';

export async function initializeDesktop() {
  if (!window.__TAURI_INTERNALS__) {if(!window.istoriya)window.istoriya={native:'browser',storage:await createBrowserStorage()};return;}
  const call=createNativeCaller(invoke);
  const media=createNativeMedia(convertFileSrc),storage=await createNativeStorage(call,media);
  window.istoriya={storage,platform:'win32',native:'rust',buildTargets:['windows','linux','macos','android'],
    importFile:file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Не удалось прочитать файл'));reader.readAsDataURL(file);}),
    chooseProjectFolder:()=>call('folder'),createProjectOnDisk:project=>call('create',media.toNative(project)),
    openProject:async()=>media.toRenderer(await call('open')),saveProject:project=>call('export',media.toNative(project)),
    portableProject:project=>call('portable',media.toNative(project)),
    projectFileReferences:project=>media.toNative(project),
    saveRecoveryProject:(project,{referencesOnly=false}={})=>call('backup',{project:media.toNative(project),referencesOnly}),
    saveRecoveryRaw:raw=>call('backup-raw',{raw}),
    prepareImportedProject:project=>media.toRenderer(project),
    auditMedia:rows=>auditNativeMedia(call,media,rows),
    buildGame:(project,platform)=>call('build',{project:media.toNative(project),platform}),
    runPreview:(project,sceneId,actionId)=>call('preview',{project:media.toNative(project),sceneId,actionId}),
  };
  let closing=false;
  await getCurrentWindow().onCloseRequested(async event=>{
    event.preventDefault();if(closing)return;closing=true;
    try {await closeEditorSafely({profile:window.istoriyaProfile,
      loadStore:async()=>(await import('../store/projectStore.js')).useProjectStore,
      confirm:()=>window.istoriyaCloseConfirmation.request(),
      destroy:()=>getCurrentWindow().destroy(),report:error=>reportEditorError('window-error',error)});}
    finally {closing=false;}
  });
}
