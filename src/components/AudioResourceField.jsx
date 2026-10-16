import {useEffect,useRef,useState} from 'react';
import {Play,Stop,UploadSimple,Microphone} from '@phosphor-icons/react';
import {useProjectStore} from '../store/projectStore.js';
import {readAudioResource,isAudioResource,audioAttachmentStatus} from '../domain/audioAuthoring.js';
import {audioPlaybackMessage} from '../domain/audioPlayback.js';
import {audioVolume} from '../../runtime/audio-model.mjs';
import {createMicrophoneRecorder,microphoneError} from '../domain/microphoneRecorder.js';
import './audio-resource.css';
export function AudioResourceField({label,value,target,field,category='sound',volume=1,onVolumeChange,draft,onDraftChange,onBusyChange,draftLabel='добавится при подтверждении формы'}) {
 const project=useProjectStore(s=>s.project),input=useRef(null),pending=useRef(0),player=useRef(null),recorder=useRef(null),finishRecording=useRef(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[playing,setPlaying]=useState(false);
 const [recordState,setRecordState]=useState('idle'),[recordSeconds,setRecordSeconds]=useState(0);
 const key=[project.id,target.sceneId,target.kind,target.actionId,target.layerId,target.reactionId,field].join(':');
 useEffect(()=>{onBusyChange?.(busy);},[busy,onBusyChange]);
 useEffect(()=>()=>onBusyChange?.(false),[onBusyChange]);
 useEffect(()=>{setBusy(false);setError('');setPlaying(false);setRecordState('idle');return()=>{pending.current++;recorder.current?.cancel();recorder.current=null;if(player.current){player.current.onended=null;player.current.pause();player.current=null;}};},[key]);
 useEffect(()=>{player.current?.pause();player.current=null;setPlaying(false);},[value,draft?.resource]);
 useEffect(()=>{if(player.current)player.current.volume=audioVolume(volume);},[volume]);
 const attach=values=>onDraftChange?onDraftChange(values):useProjectStore.getState().attachAudio({...target,projectId:project.id,field,...values});
 const load=async file=>{
  const token=++pending.current,request={...target,projectId:project.id,field};setBusy(true);setError('');
  try{const resource=await readAudioResource(file);if(token!==pending.current)return;const values={resource:{...resource,category}};if(onDraftChange)onDraftChange(values);else useProjectStore.getState().attachAudio({...request,...values});}
  catch(e){if(token===pending.current)setError(e.message||'Не удалось добавить звук.');}
  finally{if(token===pending.current)setBusy(false);}
 };
 const cancelRecording=()=>{pending.current++;recorder.current?.cancel();recorder.current=null;setRecordState('idle');setBusy(false);};
 const record=async()=>{
  if(busy)return;player.current?.pause();setPlaying(false);const token=++pending.current,request={...target,projectId:project.id,field};setBusy(true);setError('');setRecordSeconds(0);
  const current=()=>token===pending.current;
  const recording=createMicrophoneRecorder({onState:state=>{if(current())setRecordState(state);},onElapsed:seconds=>{if(current())setRecordSeconds(seconds);},onLimit:()=>{if(current())void finishRecording.current?.();},onFailure:message=>{if(current()){pending.current++;recorder.current=null;setError(message);setRecordState('idle');setBusy(false);}}});recorder.current=recording;
  finishRecording.current=async()=>{if(!current())return;try{const file=await recording.finish(),resource=await readAudioResource(file);if(!current())return;const values={resource:{...resource,category}};if(onDraftChange)onDraftChange(values);else useProjectStore.getState().attachAudio({...request,...values});}catch(error){if(current()&&error.name!=='AbortError')setError(microphoneError(error));}finally{recording.cancel();if(current()){pending.current++;recorder.current=null;setRecordState('idle');setBusy(false);}}};
  try{await recording.start();}catch(error){recording.cancel();if(current()){pending.current++;recorder.current=null;setRecordState('idle');setBusy(false);if(error.name!=='AbortError')setError(microphoneError(error));}}
 };
 const {resource,problem}=audioAttachmentStatus(project.resources,value,draft);
 let draftValue='__draft__';while(project.resources.some(r=>r.id===draftValue))draftValue+='_';
 const toggle=async()=>{if(playing){player.current?.pause();setPlaying(false);return;}if(!resource?.source)return;setError('');player.current?.pause();const audio=new Audio(resource.source),token=pending.current;audio.volume=audioVolume(volume);player.current=audio;audio.onended=()=>{if(player.current===audio)setPlaying(false);};try{await audio.play();if(player.current===audio&&token===pending.current)setPlaying(!audio.paused);}catch(error){if(player.current!==audio||token!==pending.current)return;const message=audioPlaybackMessage(error);if(message)setError(error.name==='NotAllowedError'?'Нажмите «Прослушать» ещё раз, чтобы разрешить звук.':message);setPlaying(false);}};
 return <div className="audio-resource-field">
  <label className="field"><span>{label}</span><select aria-invalid={problem?true:undefined} value={draft?.resource?draftValue:value??''} disabled={busy} onChange={e=>{if(draft?.resource&&e.target.value===draftValue)return;setError('');try{attach({resourceId:e.target.value||null});}catch(error){setError(error.message);}}}><option value="">Без записи</option>{draft?.resource&&<option value={draftValue}>{draft.resource.name} · загружено</option>}{!draft?.resource&&value&&problem&&<option value={value} disabled>{resource?.name??'Запись не найдена'} · недоступна</option>}{project.resources.filter(isAudioResource).map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
  <div className="audio-resource-actions"><button type="button" disabled={busy} onClick={()=>input.current?.click()}><UploadSimple/>{busy&&recordState==='idle'?'Проверяем файл…':'Загрузить'}</button><button type="button" aria-label={`${playing?'Остановить':'Прослушать'}: ${label}`} disabled={!resource?.source||!!problem||busy} onClick={toggle}>{playing?<Stop/>:<Play/>}{playing?'Стоп':'Прослушать'}</button>{recordState==='idle'?<button type="button" aria-label={`Записать: ${label}`} disabled={busy} onClick={()=>void record()}><Microphone/>Записать</button>:<><button type="button" aria-label={`Завершить запись: ${label}`} disabled={recordState!=='recording'} onClick={()=>void finishRecording.current?.()}><Stop/>Сохранить запись</button><button type="button" aria-label={`Отменить запись: ${label}`} onClick={cancelRecording}>Отмена записи</button></>}</div>
  {recordState!=='idle'&&<p className="audio-recording-status" role="status">{recordState==='requesting'?'Разрешите доступ к микрофону. Запись ещё не началась.':recordState==='processing'?'Обрабатываем запись…':`Идёт запись · ${recordSeconds} сек. из 120`}</p>}
  {recordState==='idle'&&<small>Микрофон включается только по кнопке. До 2 минут на запись, без отправки в интернет.</small>}
  {draft?.resource&&<small>{draft.resource.fileName??draft.resource.name} · {draftLabel}</small>}
  <input ref={input} hidden type="file" aria-label={`Файл: ${label}`} accept=".mp3,.wav,.ogg,audio/mpeg,audio/wav,audio/ogg" onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void load(file);}}/>
  {Number.isFinite(resource?.duration)&&resource.duration>=0&&<small>{resource.duration.toFixed(1)} сек.</small>}
  {onVolumeChange&&<label className="field"><span>Громкость · {Math.round(audioVolume(volume)*100)}%</span><input type="range" aria-label={`Громкость: ${label}`} min="0" max="100" value={Math.round(audioVolume(volume)*100)} disabled={!resource||busy} onChange={e=>onVolumeChange(Number(e.target.value)/100)}/></label>}
  {(error||problem)&&<p role="alert">{error||problem}</p>}
 </div>;
}
export function ActionAudioFields({action,scene}) {
 const target={kind:'action',sceneId:scene.id,actionId:action.id};
 return <details key={action.id} className="action-audio-options" open={action.soundAssetId?true:undefined}><summary>{action.soundAssetId?'Звук действия · запись добавлена':'Добавить звук к действию'}</summary><AudioResourceField label="Звук действия" value={action.soundAssetId} target={target} field="soundAssetId" volume={action.soundVolume} onVolumeChange={soundVolume=>useProjectStore.getState().updateAction(scene.id,action.id,{soundVolume})}/></details>;
}
