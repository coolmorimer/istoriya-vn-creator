// Shared geometry/defaults for visual authoring, browser playback and Ren'Py.
import {SYSTEM_SCREENS,PAUSE_ACTIONS,defaultSystemUi,systemElements,systemUiProblems} from './system-ui.mjs';
export const MENU_ACTIONS=[['start','Новая игра'],['continue','Продолжить'],['load','Загрузить'],['gallery','Галерея'],['preferences','Настройки'],['about','Об игре'],['quit','Выход']];
export const QUICK_ACTIONS=[['rollback','Назад'],['history','История'],['auto','Авто'],['skip','Пропуск'],['save','Сохранить'],['load','Загрузить'],['preferences','Настройки']];
export const UI_SCREENS=[['menu','Главное меню'],['dialogue','Диалог'],['choice','Выборы'],['quick','Быстрое меню'],...SYSTEM_SCREENS];
export const UI_IMAGE_KEYS=['resourceId','idleResourceId','hoverResourceId','pressedResourceId','disabledResourceId','lockedResourceId'];
export function assertGameUiShape(layout){
 if(layout==null)return;let count=0;const seen=new Set();
 const visit=(value,depth)=>{if(!value||typeof value!=='object')return;if(depth>8||++count>512||seen.has(value))throw Error('Повреждена компоновка интерфейса.');seen.add(value);for(const [key,child]of Object.entries(value)){if(['__proto__','constructor','prototype'].includes(key))throw Error('Некорректное поле интерфейса.');if(['visible','enabled'].includes(key)&&typeof child!=='boolean')throw Error('Некорректное включение элемента интерфейса.');if(['label','font','align'].includes(key)&&typeof child!=='string')throw Error('Некорректный текст элемента интерфейса.');if(key==='rect'&&(!child||typeof child!=='object'||Array.isArray(child)||Object.entries(child).some(([k,n])=>!['x','y','w','h'].includes(k)||typeof n!=='number'||!Number.isFinite(n))))throw Error('Некорректная область интерфейса.');visit(child,depth+1);}seen.delete(value);};visit(layout,0);
 if(typeof layout!=='object'||Array.isArray(layout)||![1,2].includes(layout.version))throw Error('Неизвестная версия компоновки интерфейса.');
 for(const [screen]of UI_SCREENS){const page=layout[screen];if(page==null)continue;if(typeof page!=='object'||Array.isArray(page))throw Error('Повреждён экран интерфейса.');if(page.enabled!=null&&typeof page.enabled!=='boolean')throw Error('Некорректное включение экрана интерфейса.');
  const defaults=defaultGameUi({ui:{}})[screen];
  for(const key of Object.keys(defaults))if(defaults[key]&&typeof defaults[key]==='object'&&!Array.isArray(defaults[key])&&key in page&&(!page[key]||typeof page[key]!=='object'||Array.isArray(page[key])))throw Error('Повреждён элемент интерфейса.');
  if(screen==='menu'&&page.buttons!=null&&(!Array.isArray(page.buttons)||page.buttons.length!==MENU_ACTIONS.length||new Set(page.buttons.map(b=>b?.id)).size!==MENU_ACTIONS.length||page.buttons.some(b=>!b||typeof b!=='object'||Array.isArray(b)||!MENU_ACTIONS.some(([id])=>id===b.id)||typeof b.label!=='string')))throw Error('Повреждён список кнопок меню.');
  if(screen==='pause'&&page.buttons!=null&&(!Array.isArray(page.buttons)||page.buttons.length!==PAUSE_ACTIONS.length||new Set(page.buttons.map(b=>b?.id)).size!==PAUSE_ACTIONS.length||page.buttons.some(b=>!b||typeof b!=='object'||!PAUSE_ACTIONS.some(([id])=>id===b.id)||typeof b.label!=='string')))throw Error('Повреждён список кнопок паузы.');
 }
}
const rect=(x,y,w,h)=>({x,y,w,h});
const style=(size,color='#ffffff')=>({font:'DejaVuSans.ttf',size,color,align:'left'});
const button=(id,label,x,y,w=24,h=6)=>({id,label,visible:true,rect:rect(x,y,w,h),...style(30),backgroundColor:'#25202e',hoverColor:'#6f3ca2',pressedColor:'#482064',disabledColor:'#302d35',idleResourceId:null,hoverResourceId:null,pressedResourceId:null,disabledResourceId:null});
export function defaultGameUi(project,enabled=false){
 const ui=project.ui??{},dy=ui.dialoguePosition==='top'?3:ui.dialoguePosition==='center'?37:72;
 return {version:2,
  menu:{enabled,backgroundColor:'#11131a',resourceId:ui.mainMenuBackgroundResourceId??null,title:{visible:true,rect:rect(8,12,80,10),...style(54)},buttons:MENU_ACTIONS.map(([id,label],i)=>({...button(id,label,8,30+i*8,30,6),visible:id==='continue'?ui.mainMenuButtons?.continue===true:ui.mainMenuButtons?.[id]!==false}))},
  dialogue:{enabled,window:{rect:rect(5,dy,90,25),moveWithZones:true,resourceId:ui.dialogueBackgroundResourceId??null,color:'#101119',opacity:ui.dialogueOpacity??86},name:{visible:true,rect:rect(7,dy+1,60,5),...style(30,ui.dialogueNameColor??'#bd75ff')},text:{rect:rect(7,dy+7,86,14)},next:{visible:true,label:'Далее',rect:rect(83,dy+20,10,4),...style(22)},portrait:{visible:false,rect:rect(5,Math.max(0,dy-30),12,30)},hide:{visible:true,label:'Скрыть',rect:rect(83,dy+1,10,4),...style(22)}},
  choice:{enabled,rect:rect(ui.choicePosition==='right'?54:ui.choicePosition==='left'?6:25,28,ui.choicePosition==='right'||ui.choicePosition==='left'?40:50,58),spacing:2,button:{...button('choice','Вариант выбора',0,0),height:8,padding:2,...style(30)}},
  quick:{enabled,rect:rect(10,96,80,4),...style(22),backgroundColor:'#101119',opacity:75},
  ...defaultSystemUi(enabled,button,style)
 };
}
function merge(a,b){if(!b||typeof b!=='object'||Array.isArray(b))return a;const result={...a};for(const [key,value]of Object.entries(b)){if(['__proto__','constructor','prototype'].includes(key))continue;result[key]=value&&typeof value==='object'&&!Array.isArray(value)?merge(a?.[key]??{},value):value;}return result;}
export function gameUi(project){const defaults=defaultGameUi(project),result=merge(defaults,project.ui?.layout);for(const screen of ['menu','pause'])result[screen].buttons=result[screen].buttons.map(b=>merge(defaults[screen].buttons.find(d=>d.id===b.id)??defaults[screen].buttons[0],b));return result;}
export function uiElements(project,screen,layout=gameUi(project)){const page=layout[screen];if(!page)return[];
 if(screen==='menu')return [{id:'title',label:'Название игры',object:page.title},...page.buttons.map(b=>({id:`button:${b.id}`,label:b.label,object:b}))];
 if(screen==='dialogue')return [['window','Окно'],['name','Имя'],['text','Текст'],['next','Продолжение'],['portrait','Портрет'],['hide','Скрыть интерфейс']].map(([id,label])=>({id,label,object:page[id]}));
 if(SYSTEM_SCREENS.some(([id])=>id===screen))return systemElements(page,screen);
 return [{id:'screen',label:screen==='choice'?'Группа вариантов':'Панель быстрого меню',object:page}];
}
export function uiObject(layout,screen,id){const page=layout?.[screen];if(!page)return null;if(id==='screen')return page;if(['menu','pause'].includes(screen)&&id.startsWith('button:'))return page.buttons?.find(b=>b.id===id.slice(7));return page[id]??null;}
export function pixelRect(value,width,height){return {x:Math.round(value.x*width/100),y:Math.round(value.y*height/100),w:Math.round(value.w*width/100),h:Math.round(value.h*height/100)};}
export function rectStyle(value){return {left:`${value.x}%`,top:`${value.y}%`,width:`${value.w}%`,height:`${value.h}%`};}
export function uiSource(project,object,key='resourceId'){return project.resources?.find(r=>r.id===object?.[key])?.source??null;}
export function uiLayoutProblems(project){
 const raw=project.ui?.layout;if(raw==null)return[];const problems=[];
 try{assertGameUiShape(raw);}catch(error){return [{screen:'menu',message:error.message}];}
 const error=(screen,message)=>problems.push({screen,message});
 if(![1,2].includes(raw.version))return [{screen:'menu',message:'Неизвестная версия компоновки интерфейса.'}];
 const layout=gameUi(project),resources=project.resources??[];
 for(const [screen]of UI_SCREENS){const page=layout[screen];if(!page.enabled)continue;
  const objects=[{id:'screen',object:page},...uiElements(project,screen)];if(page.button)objects.push({id:'button',object:page.button});
  for(const message of systemUiProblems(screen,page))error(screen,message);
  for(const {id,object}of objects){
   if(!object||typeof object!=='object'){error(screen,'Повреждён элемент интерфейса.');continue;}
   if(object.rect){const r=object.rect;if(!['x','y','w','h'].every(k=>typeof r[k]==='number'&&Number.isFinite(r[k]))||r.x<0||r.y<0||r.w<=0||r.h<=0||r.x+r.w>100.001||r.y+r.h>100.001)error(screen,`Область «${id}» выходит за экран или имеет неверный размер.`);}
   if(object.size!=null&&(!Number.isFinite(object.size)||object.size<10||object.size>160))error(screen,'Размер текста интерфейса должен быть от10 до160.');
   for(const key of ['color','backgroundColor','hoverColor','pressedColor','disabledColor'])if(object[key]!=null&&!/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(object[key]))error(screen,'Некорректный цвет интерфейса.');
   if(object.opacity!=null&&(!Number.isFinite(object.opacity)||object.opacity<0||object.opacity>100))error(screen,'Прозрачность интерфейса должна быть от0 до100.');
   if(object.align!=null&&!['left','center','right'].includes(object.align))error(screen,'Неизвестное выравнивание текста интерфейса.');
   if(object.label!=null&&typeof object.label!=='string')error(screen,'Подпись элемента интерфейса должна быть текстом.');
   if(object.font&&!['DejaVuSans.ttf','DejaVuSans-Bold.ttf'].includes(object.font)&&!resources.some(r=>r.id===object.font&&r.category==='font'&&['font/ttf','font/otf'].includes(r.mime)&&r.source))error(screen,'Шрифт интерфейса удалён или не загружен.');
   for(const key of UI_IMAGE_KEYS)if(object[key]&&!resources.some(r=>r.id===object[key]&&r.mime?.startsWith('image/')&&r.source))error(screen,'Изображение интерфейса удалено или не загружено.');
  }
  if(screen==='menu'){const ids=page.buttons.map(b=>b.id);if(ids.length!==MENU_ACTIONS.length||new Set(ids).size!==ids.length||ids.some(id=>!MENU_ACTIONS.some(([key])=>key===id)))error(screen,'Некорректный набор действий главного меню.');if(!page.buttons.some(b=>b.id==='start'&&b.visible))error(screen,'В главном меню нужна доступная кнопка «Новая игра».');}
  if(screen==='choice'&&(!Number.isFinite(page.spacing)||page.spacing<0||page.spacing>20||!Number.isFinite(page.button.height)||page.button.height<=0||page.button.height>50||!Number.isFinite(page.button.padding)||page.button.padding<0||page.button.padding>20))error(screen,'Проверьте высоту, отступы и расстояние кнопок выбора.');
 }
 return problems;
}
export function uiResourceIds(project){const result=new Set();const scan=value=>{if(!value||typeof value!=='object')return;for(const [key,item]of Object.entries(value)){if(UI_IMAGE_KEYS.includes(key)&&typeof item==='string')result.add(item);if(key==='font'&&typeof item==='string')result.add(item);if(item&&typeof item==='object')scan(item);}};scan(project.ui?.layout);return result;}
export function uiResourceReferenceEntries(project){
 const result=[],add=(resourceId,usage)=>{if(typeof resourceId==='string'&&resourceId)result.push({resourceId,usage});};
 add(project.ui?.textStyle?.font,{kind:'interface',screen:'dialogue',target:'text',id:'default-font',label:'Шрифт текста диалога'});
 if(!project.ui?.layout)return result;
 const layout=gameUi(project);
 for(const [screen,label]of UI_SCREENS){
  const elements=uiElements(project,screen,layout);if(!elements.some(e=>e.id==='screen'))elements.push({id:'screen',label:'Фон',object:layout[screen]});
  if(layout[screen].button)elements.push({id:'button',label:'Кнопка элемента',object:layout[screen].button});
  for(const element of elements)for(const key of [...UI_IMAGE_KEYS,'font'])add(element.object?.[key],{kind:'interface',screen,target:element.id==='button'?(screen==='choice'?'screen':'content'):element.id,id:`${screen}:${element.id}:${key}`,label:`${label} · ${element.label}`});
 }
 return result;
}
export function uiResourceReferences(project,id){return uiResourceReferenceEntries(project).filter(entry=>entry.resourceId===id).map(entry=>entry.usage);}
export function clearUiResource(project,id){const scan=value=>{if(!value||typeof value!=='object')return;for(const [key,item]of Object.entries(value)){if(UI_IMAGE_KEYS.includes(key)&&item===id)value[key]=null;else if(key==='font'&&item===id)value[key]='DejaVuSans.ttf';else if(item&&typeof item==='object')scan(item);}};scan(project.ui?.layout);if(project.ui?.textStyle?.font===id)project.ui.textStyle.font='DejaVuSans.ttf';for(const scene of Object.values(project.scenes??{}))for(const action of scene.actions??[])if(action.textStyle?.font===id)delete action.textStyle.font;}
