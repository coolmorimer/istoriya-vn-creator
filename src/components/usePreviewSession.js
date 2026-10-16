import {useEffect,useMemo,useRef,useState} from 'react';
import {createPreviewSession,changePreviewSession,rollbackPreview,previewRevision,previewSlot,loadPreviewSlot,previewPreferences,DEFAULT_PREVIEW_PREFERENCES} from '../domain/previewSession.js';
import {createPreviewStorage} from '../platform/previewStorage.js';
export function usePreviewSession(project,sceneId){
 const [session,setSession]=useState(()=>createPreviewSession(project,sceneId)),[panel,setPanel]=useState(null),[slots,setSlots]=useState(Array(6).fill(null)),[preferences,setPreferences]=useState(DEFAULT_PREVIEW_PREFERENCES),[error,setError]=useState(''),[busy,setBusy]=useState(false),[ready,setReady]=useState(false),[mode,setMode]=useState(null);
 const [initialized,setInitialized]=useState(false);
 const revision=useMemo(()=>previewRevision(project),[project]),storage=useRef(null),mounted=useRef(false),pending=useRef(false),prefsRef=useRef(DEFAULT_PREVIEW_PREFERENCES);
 useEffect(()=>{let live=true;mounted.current=true;createPreviewStorage().then(async db=>{if(!live){db.close();return;}storage.current=db;const prefs=await db.preferences(project.id),saved=await db.list(project.id);if(live){prefsRef.current=previewPreferences(prefs);setPreferences(prefsRef.current);setSlots(saved);setReady(true);}}).catch(e=>{if(live)setError(e.message||'Не удалось открыть тестовые сохранения.');}).finally(()=>{if(live)setInitialized(true);});return()=>{live=false;mounted.current=false;storage.current?.close();storage.current=null;};},[project.id]);
 useEffect(()=>{if(!panel||!storage.current)return;let live=true;storage.current.list(project.id).then(v=>{if(live)setSlots(v);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[panel,project.id]);
 const setState=change=>setSession(previous=>changePreviewSession(project,previous,change));
 const stop=()=>setMode(null);
 const restart=(id,actionId)=>{stop();setPanel(null);setSession(createPreviewSession(project,id,actionId));};
 const rollback=()=>{stop();setSession(s=>rollbackPreview(project,s));};
 const save=async(slot,remove=false)=>{if(!storage.current||pending.current)return;pending.current=true;setBusy(true);setError('');try{if(remove)await storage.current.remove(project.id,slot,slots[slot-1]?.id??null);else await storage.current.save(project.id,slot,previewSlot(project,session,revision),slots[slot-1]?.id??null);const saved=await storage.current.list(project.id);if(mounted.current)setSlots(saved);return true;}catch(e){if(mounted.current)setError(e.message||'Не удалось сохранить тест.');return false;}finally{pending.current=false;if(mounted.current)setBusy(false);}};
 const load=slot=>{try{const restored=loadPreviewSlot(project,slots[slot-1],revision);stop();setSession(restored);setPanel(null);setError('');}catch(e){setError(e.message);}};
 const updatePreferences=patch=>{const next=previewPreferences({...prefsRef.current,...patch});prefsRef.current=next;setPreferences(next);storage.current?.setPreferences(project.id,next).catch(e=>{if(mounted.current)setError(e.message||'Настройки теста не сохранены.');});};
 return {session,state:session.state,setState,restart,rollback,panel,setPanel,slots,preferences,updatePreferences,error,setError,busy,ready,initialized,mode,setMode,stop,save,load,revision};
}
