import {useState} from 'react';
import {GameplayDialog} from './PreviewGameplay.jsx';
import './preview-system.css';
const names={menu:'Меню теста',save:'Сохранить тест',load:'Загрузить тест',history:'История теста',preferences:'Настройки теста'};
export function PreviewSystemPanel({controls,project}){
 const {panel,setPanel,slots,save,load,preferences,updatePreferences,session,busy,ready,error,revision}=controls;
 const [confirm,setConfirm]=useState(null),[notice,setNotice]=useState('');
 const commit=async(slot,remove=false)=>{if(await save(slot,remove)){setConfirm(null);setNotice(remove?`Слот ${slot} удалён.`:`Тест сохранён в слот ${slot}.`);}};
 return <GameplayDialog label={names[panel]} className="preview-system-modal" onClose={()=>!busy&&setPanel(null)}><h3>{names[panel]}</h3>
  <p>Тестовое прохождение редактора. Не изменяет проект и не заменяет сохранения готовой игры.</p>
  {error&&<p role="alert" className="preview-system-error">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {panel==='menu'&&<nav aria-label="Меню теста">{['save','load','history','preferences'].map(id=><button key={id} onClick={()=>setPanel(id)}>{names[id]}</button>)}</nav>}
  {['save','load'].includes(panel)&&<>
   {!ready&&<p role="status">Хранилище тестов пока недоступно. {error?'Закройте предпросмотр и повторите открытие.':'Читаем сохранения…'}</p>}
   {confirm?<div className="preview-save-confirm"><p>{confirm.remove?`Удалить тестовый слот ${confirm.slot}?`:`Перезаписать тестовый слот ${confirm.slot}?`}</p><button disabled={busy} onClick={()=>void commit(confirm.slot,confirm.remove)}>{confirm.remove?'Удалить':'Перезаписать'}</button><button disabled={busy} onClick={()=>setConfirm(null)}>Отмена</button></div>:<div className="preview-test-slots">{slots.map((slot,i)=>{
    const incompatible=slot&&(slot.version!==1||slot.revision!==revision||slot.projectId!==project.id);
    return <div key={i}><button aria-label={`${panel==='save'?'Сохранить':'Загрузить'} тест: слот ${i+1}`} disabled={busy||!ready||(panel==='load'&&(!slot||incompatible))||(panel==='save'&&session.state.waiting?.type==='pause')} onClick={()=>panel==='load'?load(i+1):slot?setConfirm({slot:i+1}):void commit(i+1)}><strong>Слот {i+1} · {slot?.sceneTitle??'Пусто'}</strong><span>{slot?.excerpt??'Нет сохранения'}</span>{slot&&<small>{incompatible?'Сценарий изменён — начните тест заново':new Date(slot.savedAt).toLocaleString('ru-RU')}</small>}</button>{slot&&<button className="preview-delete-slot" aria-label={`Удалить тест: слот ${i+1}`} disabled={busy} onClick={()=>setConfirm({slot:i+1,remove:true})}>Удалить</button>}</div>;
   })}</div>}
  </>}
  {panel==='history'&&<div className="preview-test-history">{session.history.length?session.history.map((entry,i)=><article key={i}>{entry.speaker&&<strong>{entry.speaker}</strong>}<p>{entry.text}</p></article>):<p>Реплик пока нет. История появится после прохождения сцены.</p>}</div>}
  {panel==='preferences'&&<fieldset className="preview-test-settings" disabled={!ready}>
   {['music','sound','voice','ambience'].map((key,i)=><label key={key}><span>{['Музыка','Звуки действий','Голоса','Фоновые звуки'][i]} · {Math.round(preferences[key]*100)}%</span><input aria-label={`Тест: ${['музыка','звуки','голоса','фоновые звуки'][i]}`} type="range" min="0" max="100" value={Math.round(preferences[key]*100)} onChange={e=>updatePreferences({[key]:Number(e.target.value)/100})}/></label>)}
   <label><span>Скорость текста · {preferences.textSpeed===null?'как в проекте':preferences.textSpeed===0?'мгновенно':`${preferences.textSpeed} симв./с`}</span><input aria-label="Тест: скорость текста" type="range" min="0" max="150" value={preferences.textSpeed??project.ui.textStyle?.speed??35} onChange={e=>updatePreferences({textSpeed:Number(e.target.value)})}/></label><button onClick={()=>updatePreferences({textSpeed:null})}>Скорость из проекта</button>
   <label><span>Задержка автоперехода · {preferences.autoDelay} с</span><input aria-label="Тест: задержка автоперехода" type="range" min="0.2" max="10" step="0.2" value={preferences.autoDelay} onChange={e=>updatePreferences({autoDelay:Number(e.target.value)})}/></label>
   <label className="preview-test-check"><input type="checkbox" checked={preferences.skipSeenOnly} onChange={e=>updatePreferences({skipSeenOnly:e.target.checked})}/>Пропускать только прочитанные реплики</label>
  </fieldset>}
  <button disabled={busy} onClick={()=>setPanel(null)}>Вернуться к тесту</button>
 </GameplayDialog>;
}
