import {visibleDialogControl} from '../domain/dialogFocus.js';
import {useEffect,useRef,useState} from 'react';
import {createPortal,flushSync} from 'react-dom';
import {ImageSquare,UploadSimple,X} from '@phosphor-icons/react';
import {useProjectStore} from '../store/projectStore.js';
import {readCharacterImage,assertCharacterImageFile} from '../platform/characterImage.js';
import {AudioResourceField} from './AudioResourceField.jsx';
import './character-picker.css';
import './prop-picker.css';

export function PropPicker({sceneId,onClose}) {
 const {project,activeActionId,createSceneProp}=useProjectStore(),origin=useRef(null);
 if(!origin.current)origin.current={projectId:project.id,sceneId,afterId:activeActionId,timed:!!project.scenes[sceneId]?.timelineEnabled};
 const [name,setName]=useState(''),[mode,setMode]=useState('inspect'),[text,setText]=useState(''),[addExploration,setAddExploration]=useState(!origin.current.timed);
 const [speakerId,setSpeakerId]=useState(''),[sound,setSound]=useState({}),[voice,setVoice]=useState({}),[soundBusy,setSoundBusy]=useState(false),[voiceBusy,setVoiceBusy]=useState(false),[soundVolume,setSoundVolume]=useState(1),[voiceVolume,setVoiceVolume]=useState(1);
 const [resourceId,setResourceId]=useState(''),[image,setImage]=useState(null),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const dialog=useRef(null),upload=useRef(null),fileInput=useRef(null),generation=useRef(0),committing=useRef(false),nameEdited=useRef(false),previousFocus=useRef(document.activeElement);
 const available=project.resources.filter(r=>['image/png','image/webp','image/jpeg'].includes(r.mime)),chosen=resourceId?available.find(r=>r.id===resourceId):image;
 useEffect(()=>{upload.current?.focus();return()=>{generation.current++;if(previousFocus.current?.isConnected)previousFocus.current.focus();};},[]);
 // Commit a filename suggestion before the browser can focus/select this input.
 // A late image-decode state update used to insert a prefix into fast renames.
 // This sync boundary is only for the discrete file/resource-selection event,
 // never typing, rendering, image completion or a project/history transaction.
 const suggestName=value=>{if(!nameEdited.current)flushSync(()=>setName(current=>nameEdited.current?current:current||String(value??'').slice(0,200)));};
 const load=async file=>{const token=++generation.current;setBusy(true);setError('');setResourceId('');setImage(null);setReady(false);try{assertCharacterImageFile(file);suggestName(file.name.replace(/\.[^.]+$/,''));const value=await readCharacterImage(file);if(token===generation.current)setImage(value);}catch(err){if(token===generation.current)setError(err.message);}finally{if(token===generation.current)setBusy(false);}};
 const audioBusy=mode!=='decoration'&&(soundBusy||voiceBusy);
 const submit=event=>{event.preventDefault();if(busy||audioBusy||!ready||!chosen||committing.current)return;committing.current=true;try{createSceneProp({...origin.current,name,mode,text,addExploration,resourceId:resourceId||undefined,resource:image,speakerId:speakerId||null,soundResourceId:sound.resourceId,soundResource:sound.resource,soundVolume,voiceResourceId:voice.resourceId,voiceResource:voice.resource,voiceVolume});onClose();}catch(err){setError(err.message);committing.current=false;}};
 const keyDown=event=>{event.stopPropagation();if(event.key==='Escape'){event.preventDefault();onClose();return;}if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s')event.preventDefault();if(event.key!=='Tab')return;const fields=[...dialog.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')].filter(visibleDialogControl),first=fields[0],last=fields.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}};
 return createPortal(<div className="character-author-backdrop" onPointerDown={e=>{if(e.target===e.currentTarget)onClose();}}><section ref={dialog} className="character-author-picker prop-author-picker" role="dialog" aria-modal="true" aria-labelledby="prop-author-title" onKeyDown={keyDown}>
  <header><div><h2 id="prop-author-title">Добавить предмет</h2><p>Отдельный слой на сцене — с реакцией на нажатие или без неё.</p></div><button className="character-author-close" aria-label="Закрыть добавление предмета" onClick={onClose}><X size={22}/></button></header>
  <form className="character-create-form" onSubmit={submit}><div className="character-create-body"><div className="character-create-preview">
   {chosen?<img key={resourceId||`upload-${generation.current}`} src={chosen.source} alt="Предпросмотр предмета" onLoad={()=>setReady(true)} onError={()=>{setReady(false);setError('Изображение недоступно. Выберите другой файл.');}}/>:<ImageSquare size={48}/>}
   <span>{busy?'Читаем изображение…':chosen?`${chosen.width??'—'} × ${chosen.height??'—'}`:'Изображение не выбрано'}</span>
   <button ref={upload} className="button secondary" type="button" onClick={()=>fileInput.current?.click()}><UploadSimple/>Загрузить изображение</button><input ref={fileInput} hidden aria-label="Изображение предмета" type="file" accept="image/png,image/webp,image/jpeg" onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void load(file);}}/>
  </div><div className="character-create-fields">
   {!!available.length&&<label className="field"><span>Из ресурсов проекта</span><select value={resourceId} onChange={e=>{generation.current++;setBusy(false);setReady(false);setError('');setResourceId(e.target.value);suggestName(available.find(r=>r.id===e.target.value)?.name);}}><option value="">Не выбран</option>{available.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>}
   <label className="field"><span>Название предмета</span><input required maxLength="200" value={name} onFocus={()=>{nameEdited.current=true;}} onChange={e=>{nameEdited.current=true;setName(e.target.value);}}/></label>
   <label className="field"><span>При нажатии</span><select value={mode} onChange={e=>setMode(e.target.value)}><option value="inspect">Осмотреть / ответить</option><option value="take">Взять в инвентарь</option><option value="decoration">Без взаимодействия</option></select></label>
   {mode!=='decoration'&&<><label className="field"><span>Ответ игроку</span><textarea rows="3" value={text} onChange={e=>setText(e.target.value)} placeholder="Можно оставить без текста"/></label><label className="prop-author-check"><input type="checkbox" checked={addExploration} disabled={origin.current.timed} onChange={e=>setAddExploration(e.target.checked)}/><span>Перейти к шагу осмотра сцены</span></label><p>{origin.current.timed?'В монтаже осмотр недоступен. Для взаимодействия переведите сцену в последовательные кадры.':mode==='take'?'Предмет появится в инвентаре игрока и исчезнет со сцены.':'Игрок нажимает на предмет во время шага осмотра. Звуки и дополнительные реакции — в свойствах предмета.'}</p></>}
   {mode!=='decoration'&&<details className="action-audio-options"><summary>Звук и озвучка</summary><label className="field"><span>Кто говорит</span><select value={speakerId} onChange={e=>setSpeakerId(e.target.value)}><option value="">Автор</option>{project.characters.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><AudioResourceField label="Звук предмета" value={sound.resourceId} draft={sound} onDraftChange={setSound} target={{kind:'draft',sceneId}} field="soundAssetId" onBusyChange={setSoundBusy} volume={soundVolume} onVolumeChange={setSoundVolume}/><AudioResourceField label="Озвучка ответа" category="voice" value={voice.resourceId} draft={voice} onDraftChange={setVoice} target={{kind:'draft',sceneId}} field="voiceAssetId" onBusyChange={setVoiceBusy} volume={voiceVolume} onVolumeChange={setVoiceVolume}/></details>}
  </div></div>{error&&<p className="character-author-error" role="alert">{error}</p>}<footer><button type="button" className="button secondary" onClick={onClose}>Отмена</button><button type="submit" className="button primary" disabled={busy||audioBusy||!ready||!chosen||!name.trim()}>Добавить на сцену</button></footer></form>
 </section></div>,document.body);
}
