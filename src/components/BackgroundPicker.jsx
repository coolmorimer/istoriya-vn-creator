import {visibleDialogControl} from '../domain/dialogFocus.js';
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {ImageSquare,UploadSimple,X} from '@phosphor-icons/react';
import {useProjectStore} from '../store/projectStore.js';
import {backgroundTarget} from '../domain/backgroundAuthoring.js';
import {readCharacterImage} from '../platform/characterImage.js';
import './character-picker.css';
import './background-picker.css';

export function BackgroundPicker({sceneId,onClose,placement='current'}) {
 const {project,activeActionId,timelineTime,applyBackground}=useProjectStore();
 const origin=useRef(null);if(!origin.current)origin.current=backgroundTarget(project,sceneId,activeActionId,timelineTime);
 const [mode,setMode]=useState(placement),[fit,setFit]=useState(origin.current.hasBackground?origin.current.transform.fit:'cover');
 const [image,setImage]=useState(null),[resourceId,setResourceId]=useState(origin.current.currentResourceId??''),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [preserve,setPreserve]=useState(true),[transition,setTransition]=useState('dissolve'),[duration,setDuration]=useState(5);
 const dialog=useRef(null),fileInput=useRef(null),upload=useRef(null),generation=useRef(0),committing=useRef(false),mounted=useRef(false),previousFocus=useRef(document.activeElement);
 useEffect(()=>{mounted.current=true;upload.current?.focus();return()=>{mounted.current=false;generation.current++;requestAnimationFrame(()=>{if(!mounted.current&&previousFocus.current?.isConnected)previousFocus.current.focus();});};},[]);
 const available=project.resources.filter(r=>['image/png','image/jpeg','image/webp'].includes(r.mime));
 const chosen=resourceId?available.find(r=>r.id===resourceId):image;
 const load=async file=>{const token=++generation.current;setBusy(true);setError('');setResourceId('');setImage(null);setReady(false);try{const resource=await readCharacterImage(file);if(token===generation.current)setImage(resource);}catch(err){if(token===generation.current)setError(err.message);}finally{if(token===generation.current)setBusy(false);}};
 const submit=event=>{event.preventDefault();if(busy||!ready||!chosen||committing.current)return;committing.current=true;try{applyBackground({...origin.current,mode,fit,transition,duration,preserveCharacters:preserve,resourceId:resourceId||undefined,resource:image});onClose();}catch(err){setError(err.message);committing.current=false;}};
 const keyDown=event=>{event.stopPropagation();if(event.key==='Escape'){event.preventDefault();onClose();return;}if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s')event.preventDefault();if(event.key!=='Tab')return;const fields=[...dialog.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled)')].filter(visibleDialogControl),first=fields[0],last=fields.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}};
 return createPortal(<div className="character-author-backdrop" onPointerDown={event=>{if(event.target===event.currentTarget)onClose();}}>
  <section ref={dialog} className="character-author-picker background-author-picker" role="dialog" aria-modal="true" aria-labelledby="background-author-title" onKeyDown={keyDown}>
   <header><div><h2 id="background-author-title">Фон сцены</h2><p>Загрузите изображение или используйте ресурс проекта.</p></div><button className="character-author-close" aria-label="Закрыть выбор фона" onClick={onClose}><X size={22}/></button></header>
   <form onSubmit={submit} className="character-create-form">
    <div className="background-author-body"><div className="background-author-preview">
     <div className="background-author-image" style={{aspectRatio:`${project.meta.resolution.width}/${project.meta.resolution.height}`}}>{chosen?<img key={resourceId||`upload-${generation.current}`} src={chosen.source} style={{objectFit:fit}} alt="Предпросмотр фона" onLoad={()=>setReady(true)} onError={()=>{setReady(false);setError('Изображение недоступно. Выберите другой файл или ресурс.');}}/>:<ImageSquare size={48}/>}</div>
     <span>{busy?'Читаем изображение…':chosen?`${chosen.name} · ${chosen.width??'—'} × ${chosen.height??'—'}`:'Фон пока не выбран'}</span>
     <button ref={upload} type="button" className="button secondary" onClick={()=>fileInput.current?.click()}><UploadSimple/>{chosen?'Загрузить другое изображение':'Загрузить изображение'}</button>
     <input ref={fileInput} hidden type="file" accept="image/png,image/webp,image/jpeg" onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void load(file);}}/>
    </div><div className="character-create-fields">
     {!!available.length&&<label className="field"><span>Из ресурсов проекта</span><select value={resourceId} onChange={event=>{generation.current++;setBusy(false);setReady(false);setError('');setResourceId(event.target.value);}}><option value="">Не выбран</option>{available.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>}
     <label className="field"><span>Как применить</span><select value={mode} onChange={event=>setMode(event.target.value)}><option value="current">Заменить текущий фон</option><option value="insert">{origin.current.timed?'Добавить фон с позиции курсора':'Сменить фон после выбранного кадра'}</option></select></label>
     <label className="field"><span>Подгонка изображения</span><select value={fit} onChange={event=>setFit(event.target.value)}><option value="cover">Заполнить кадр</option><option value="contain">Вписать целиком</option><option value="fill">Растянуть</option></select></label>
     {mode==='insert'&&<><label className="field"><span>Переход</span><select value={transition} onChange={event=>setTransition(event.target.value)}><option value="dissolve">Плавная смена</option><option value="fade">Через затемнение</option><option value="none">Мгновенно</option></select></label>{origin.current.timed?<label className="field"><span>Длительность · сек.</span><input type="number" min="0.1" max="3600" step="0.1" value={duration} onChange={event=>setDuration(Number(event.target.value))}/></label>:<label className="background-author-check"><input type="checkbox" checked={preserve} onChange={event=>setPreserve(event.target.checked)}/><span>Оставить персонажей в кадре</span></label>}</>}
     <p>{mode==='current'?'Меняется фон, который виден в выбранном кадре. Персонажи и порядок шагов сохраняются.':origin.current.timed?`Новый клип начнётся с ${origin.current.time.toFixed(1)} сек. Остальные клипы сохранятся.`:'Смена фона станет отдельным шагом. Её можно перемещать и отменять.'}</p>
    </div></div>
    {error&&<p className="character-author-error" role="alert">{error}</p>}
    <footer><button type="button" className="button secondary" onClick={onClose}>Отмена</button><button type="submit" className="button primary" disabled={busy||!chosen||!ready}>{mode==='current'?'Применить фон':'Добавить смену фона'}</button></footer>
   </form>
  </section>
 </div>,document.body);
}
