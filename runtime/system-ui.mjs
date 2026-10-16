export const SYSTEM_SCREENS=[['pause','Пауза'],['save','Сохранение'],['load','Загрузка'],['preferences','Настройки'],['history','История'],['gallery','Галерея'],['notify','Уведомления']];
export const PAUSE_ACTIONS=[['save','Сохранить'],['load','Загрузить'],['preferences','Настройки'],['history','История'],['gallery','Галерея'],['main_menu','Главное меню'],['quit','Выход']];
export const PLAYER_OPTIONS=[['music','Громкость музыки'],['sound','Громкость звуков'],['voice','Громкость голосов'],['text','Скорость текста'],['auto','Скорость автоперехода'],['display','Полноэкранный режим'],['resolution','Размер окна'],['skipSeen','Пропуск прочитанного'],['skipAll','Пропуск всего текста']];
export function defaultSystemUi(enabled,button,style){
 const result={};
 for(const [id,label]of SYSTEM_SCREENS){
  if(id==='notify'){result[id]={enabled,duration:3,content:{rect:{x:6,y:4,w:70,h:10},...style(26),backgroundColor:'#25202e',resourceId:null,opacity:92}};continue;}
  result[id]={enabled,backgroundColor:'#11131a',resourceId:null,title:{label,visible:true,rect:{x:6,y:5,w:88,h:10},...style(42)},back:{...button('back','Назад',6,91,22,6),visible:true},content:{rect:{x:6,y:20,w:88,h:60},...style(26),spacing:2},button:{...button('item','Элемент',0,0),size:24}};
  if(id==='pause'){result[id].back.label='Продолжить';result[id].buttons=PAUSE_ACTIONS.map(([key,text],i)=>button(key,text,30,18+i*9,40,7));}
  if(['save','load','gallery'].includes(id))result[id].content.columns=3;
  if(['save','load'].includes(id)){result[id].content.rows=2;result[id].pages={rect:{x:6,y:82,w:88,h:6},...style(22)};}
  if(id==='gallery'){result[id].content.cardHeight=25;result[id].button.lockedResourceId=null;result[id].button.label='Закрыто';}
  if(id==='preferences')result[id].options=Object.fromEntries(PLAYER_OPTIONS.map(([key])=>[key,true]));
 }
 return result;
}
export function systemElements(page,screen){
 if(screen==='notify')return [{id:'content',label:'Уведомление',object:page.content}];
 if(screen==='pause')return [{id:'title',label:'Заголовок',object:page.title},...page.buttons.map(b=>({id:`button:${b.id}`,label:b.label,object:b})),{id:'back',label:'Вернуться в игру',object:page.back}];
 return [{id:'title',label:'Заголовок',object:page.title},{id:'content',label:{save:'Карточки сохранений',load:'Карточки загрузки',preferences:'Параметры игрока',history:'Список реплик',gallery:'Карточки галереи'}[screen],object:page.content},...(page.pages?[{id:'pages',label:'Страницы сохранений',object:page.pages}]:[]),{id:'back',label:'Кнопка возврата',object:page.back}];
}
export function systemUiProblems(screen,page){
 const errors=[];
 if(['save','load','gallery'].includes(screen)){
  if(!Number.isInteger(page.content.columns)||page.content.columns<1||page.content.columns>5)errors.push('Количество колонок должно быть от 1 до 5.');
  if(['save','load'].includes(screen)&&(!Number.isInteger(page.content.rows)||page.content.rows<1||page.content.rows>5))errors.push('Количество строк должно быть от 1 до 5.');
  const r=page.content.rect,gap=page.content.spacing;
  if(r.w-(page.content.columns-1)*gap<=0||(['save','load'].includes(screen)&&r.h-(page.content.rows-1)*gap<=0))errors.push('Отступы не оставляют места для карточек.');
 }
 if(page.content?.spacing!=null&&(!Number.isFinite(page.content.spacing)||page.content.spacing<0||page.content.spacing>10))errors.push('Расстояние между элементами должно быть от 0 до 10%.');
 if(screen==='gallery'&&(!Number.isFinite(page.content.cardHeight)||page.content.cardHeight<10||page.content.cardHeight>60))errors.push('Высота карточки галереи должна быть от 10 до 60%.');
 if(screen==='notify'&&(!Number.isFinite(page.duration)||page.duration<.5||page.duration>60))errors.push('Длительность уведомления должна быть от 0,5 до 60 секунд.');
 if(screen==='preferences'&&Object.keys(page.options??{}).some(key=>!PLAYER_OPTIONS.some(([id])=>key===id)||typeof page.options[key]!=='boolean'))errors.push('Повреждён список доступных настроек игрока.');
 if(page.back?.visible===false)errors.push('Кнопка возврата должна оставаться доступной.');
 return errors;
}
