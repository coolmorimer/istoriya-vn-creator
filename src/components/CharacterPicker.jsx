import {visibleDialogControl} from '../domain/dialogFocus.js';
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {UserPlus,UploadSimple,X} from '@phosphor-icons/react';
import {useProjectStore} from '../store/projectStore.js';
import {resolveCharacterSprite} from '../../runtime/character-sprites.mjs';
import {readCharacterImage} from '../platform/characterImage.js';
import './character-picker.css';

export function CharacterPicker({sceneId,onClose,onAdded,placement,time}) {
 const {project,activeActionId,timelineTime,addSceneCharacter,createCharacterOnScene}=useProjectStore();
 const [mode,setMode]=useState(project.characters.length?'existing':'create'),[query,setQuery]=useState('');
 const [name,setName]=useState(''),[spriteName,setSpriteName]=useState('Основной'),[position,setPosition]=useState('center');
 const [image,setImage]=useState(null),[resourceId,setResourceId]=useState(''),[characterId,setCharacterId]=useState(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[imageReady,setImageReady]=useState(false);
 const dialog=useRef(null),nameInput=useRef(null),searchInput=useRef(null),fileInput=useRef(null),generation=useRef(0),committing=useRef(false),mounted=useRef(false);
 const previousFocus=useRef(document.activeElement);
 const origin=useRef({projectId:project.id,sceneId,afterId:activeActionId,time:time??timelineTime});
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;generation.current++;const previous=previousFocus.current;requestAnimationFrame(()=>{if(!mounted.current&&previous?.isConnected)previous.focus();});};},[]);
 useEffect(()=>{(mode==='create'?nameInput:searchInput).current?.focus();},[mode]);
 const changeMode=next=>{setMode(next);setError('');};
 const load=async file=>{
  const token=++generation.current;setBusy(true);setError('');setResourceId('');setImage(null);setImageReady(false);
  try{const resource=await readCharacterImage(file);if(token===generation.current)setImage(resource);}
  catch(err){if(token===generation.current)setError(err.message);}
  finally{if(token===generation.current)setBusy(false);}
 };
 const selectExisting=character=>{
  if(!resolveCharacterSprite(character,null,project.resources).source){setCharacterId(character.id);setName(character.name);setPosition(character.defaultPosition??'center');changeMode('create');return;}
  try{if(onAdded)onAdded(character.id);else addSceneCharacter(sceneId,character.id);onClose();}catch(err){setError(err.message);}
 };
 const submit=event=>{
  event.preventDefault();if(busy||!imageReady||committing.current)return;
  committing.current=true;
  try{createCharacterOnScene({...origin.current,placement,name,spriteName,position,characterId,resourceId:resourceId||undefined,resource:image});onClose();}
  catch(err){setError(err.message);committing.current=false;}
 };
 const keyDown=event=>{
  event.stopPropagation();
  if(event.key==='Escape'){event.preventDefault();onClose();return;}
  if(event.key!=='Tab')return;
  const focusable=[...dialog.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(visibleDialogControl);
  const first=focusable[0],last=focusable.at(-1);
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
 };
 const available=project.resources.filter(r=>['image/png','image/jpeg','image/webp'].includes(r.mime));
 const chosen=resourceId?available.find(r=>r.id===resourceId):image;
 const characters=project.characters.filter(c=>c.name.toLowerCase().includes(query.toLowerCase()));
 return createPortal(<div className="character-author-backdrop" onPointerDown={event=>{if(event.target===event.currentTarget)onClose();}}>
  <section ref={dialog} className="character-author-picker" role="dialog" aria-modal="true" aria-labelledby="character-author-title" onKeyDown={keyDown}>
   <header><div><h2 id="character-author-title">Добавить персонажа на сцену</h2><p>Герой появится в текущем кадре. Положение и размер можно изменить на холсте.</p></div><button type="button" className="character-author-close" aria-label="Закрыть выбор персонажа" onClick={onClose}><X/></button></header>
   <div className="character-author-modes" role="group" aria-label="Выбор персонажа"><button type="button" aria-pressed={mode==='existing'} onClick={()=>changeMode('existing')}>Из проекта · {project.characters.length}</button><button type="button" aria-pressed={mode==='create'} onClick={()=>{setCharacterId(null);changeMode('create');}}>Новый персонаж</button></div>
   {error&&<p className="character-author-error" role="alert">{error}</p>}
   {mode==='existing'?<>
    <label className="field"><span>Поиск персонажа</span><input ref={searchInput} placeholder="Имя персонажа" value={query} onChange={event=>setQuery(event.target.value)}/></label>
    <div className="character-author-grid">{characters.map(character=>{const source=resolveCharacterSprite(character,null,project.resources).source;return <button type="button" key={character.id} onClick={()=>selectExisting(character)}>{source?<img src={source} alt="" loading="lazy"/>:<UserPlus/>}<strong>{character.name}</strong><small>{source?'Добавить в кадр':'Загрузить изображение'}</small></button>;})}</div>
    {!characters.length&&<p>{project.characters.length?'Персонажей с таким именем нет. Измените поиск или создайте нового.':'Персонажей пока нет. Откройте «Новый персонаж», укажите имя и загрузите изображение.'}</p>}
   </>:<form onSubmit={submit} className="character-create-form">
    {characterId&&<p>Добавьте изображение для персонажа «{project.characters.find(c=>c.id===characterId)?.name}».</p>}
    <div className="character-create-body"><div className="character-create-preview">{chosen?<img key={resourceId||'uploaded-image'} src={chosen.source} alt="Предпросмотр спрайта" onLoad={()=>setImageReady(true)} onError={()=>{setImageReady(false);setError('Изображение недоступно. Загрузите файл повторно или выберите другой ресурс.');}}/>:<UserPlus size={48}/>}<span>{busy?'Читаем изображение…':chosen?`${chosen.width??'—'} × ${chosen.height??'—'}`:'Изображение персонажа'}</span><button type="button" className="button secondary" onClick={()=>fileInput.current?.click()}><UploadSimple/>{chosen?'Заменить изображение':'Загрузить изображение'}</button><input ref={fileInput} hidden type="file" accept="image/png,image/webp,image/jpeg" onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void load(file);}}/></div>
     <div className="character-create-fields"><label className="field"><span>Имя персонажа</span><input ref={nameInput} required maxLength={100} placeholder="Например, Элира" value={name} onChange={event=>setName(event.target.value)}/></label><label className="field"><span>Название спрайта</span><input required maxLength={100} value={spriteName} onChange={event=>setSpriteName(event.target.value)}/></label><label className="field"><span>Начальное положение</span><select value={position} onChange={event=>setPosition(event.target.value)}><option value="left">Слева</option><option value="center">По центру</option><option value="right">Справа</option></select></label>
      {!!available.length&&<label className="field"><span>Или изображение из ресурсов</span><select value={resourceId} onChange={event=>{generation.current++;setBusy(false);setError('');setImageReady(false);setResourceId(event.target.value);}}><option value="">Не выбрано</option>{available.map(resource=><option key={resource.id} value={resource.id}>{resource.name}</option>)}</select></label>}
      <p>PNG и WebP сохраняют прозрачность. Имя и эмоции можно менять позже в разделе «Персонажи».</p>
     </div></div>
    <footer><button type="button" className="button secondary" onClick={onClose}>Отмена</button><button type="submit" className="button primary" disabled={busy||!chosen||!imageReady||!name.trim()||!spriteName.trim()}>{characterId?'Сохранить и добавить':'Создать и добавить'}</button></footer>
   </form>}
  </section>
 </div>,document.body);
}
