// Independent of App/store initialization. A failed save/import must not trap
// the native close button or silently discard an in-memory authoring change.
export function createCloseConfirmation(){
 let state=null,pending=null,resolve;const listeners=new Set();
 const publish=()=>{for(const listener of listeners)listener();};
 return {subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},getSnapshot:()=>state,
  request(){if(pending)return pending;pending=new Promise(done=>{resolve=done;});state={unsaved:true};publish();return pending;},
  answer(leave){if(!pending)return;const done=resolve;state=null;pending=null;resolve=null;publish();done(leave===true);}
 };
}
export async function closeEditorSafely({profile,loadStore,confirm,destroy,report=()=>{}}){
 try{
  const status=await profile?.status();
  if(status?.phase==='copying'){await profile.cancel();await destroy();return true;}
  if(status?.phase==='ready'){await destroy();return true;}
  const store=await loadStore();await store.getState().waitForPendingWrites();const state=store.getState();
  if(state.recovery||state.saveState==='saved'||await state.saveNow()){await destroy();return true;}
 }catch(error){try{report(error);}catch{/* Reporting must not trap close. */}}
 if(await confirm()){await destroy();return true;}return false;
}
