import {createProject} from '../../src/domain/projectFactory.js';
import {solidPng} from '../../scripts/qa-png.mjs';
export function storyGame(){
 const p=createProject({title:'Переходы Rust — QA',resolution:{width:1280,height:720}});
 const line=(id,text,end=false)=>({id,title:text,characters:[],images:[],actions:[{id:id+'-line',type:'narration',text},...(end?[{id:id+'-end',type:'end'}]:[])]});
 p.flags=[{id:'gate',name:'Ветка',initial:false}];p.resources=[{id:'door-image',name:'Synthetic QA prop',category:'prop',mime:'image/png',source:'data:image/png;base64,'+solidPng(32,32,[230,160,80,255]).toString('base64')}];
 p.scenes={
  wrong:line('wrong','НЕВЕРНЫЙ СТАРТ',true),
  entry:line('entry','Вход первой главы'),
  wrongDoor:line('wrongDoor','НЕВЕРНАЯ ДВЕРЬ',true),
  door:line('door','Осмотрите дверь'),
  choice:line('choice','Переход предмета в главу'),
  'chapter:third':line('chapter:third','Литеральное имя сцены',true),
  condition:{id:'condition',title:'Условие',characters:[],images:[],actions:[{id:'if',type:'condition',condition:{flagId:'gate',value:true},trueChapterId:'fifth',trueSceneId:'last',falseSceneId:'bad'}]},
  bad:line('bad','Ложная ветвь',true),last:line('last','НЕВЕРНЫЙ ВХОД',true),
  finalEntry:line('finalEntry','Вход последней главы'),z_orphan:line('z_orphan','Свободная сцена',true)
 };
 p.chapters=[{id:'first',title:'Начало',scenes:['wrong','entry'],entrySceneId:'entry'},{id:'second',title:'Дверь',scenes:['wrongDoor','door'],entrySceneId:'door'},{id:'third',title:'Выбор',scenes:['choice','chapter:third'],entrySceneId:'choice'},{id:'fourth',title:'Условие',scenes:['condition','bad']},{id:'fifth',title:'Финал',scenes:['last','finalEntry'],entrySceneId:'finalEntry'}];
 p.chapters.forEach((c,i)=>c.scenes.forEach((id,j)=>p.scenes[id].number=`${i+1}.${j+1}`));p.scenes.z_orphan.number='6.1';
 p.scenes.entry.actions.push({id:'jump',type:'jump',targetChapterId:'second',targetSceneId:'wrongDoor'});
 p.scenes.door.images=[{id:'door-prop',name:'Дверь QA',resourceId:'door-image',x:50,y:60,width:20,height:35,scale:100,rotation:0,opacity:100,visible:true,zOrder:50,interactions:[{id:'open',label:'Войти',text:'Дверь открылась',targetChapterId:'third',targetSceneId:'wrong',once:false,effects:[]}]}];
 p.scenes.door.actions.push({id:'explore',type:'explore',prompt:'Нажмите дверь'},{id:'door-end',type:'end'});
 p.scenes.choice.actions.push({id:'choices',type:'choice',prompt:'Как проверить?',options:[{id:'yes',text:'Условие да',targetSceneId:'condition',effects:[{kind:'flag',flagId:'gate',value:true}]},{id:'no',text:'Условие нет',targetSceneId:'condition',effects:[]},{id:'literal',text:'Литеральная сцена',targetSceneId:'chapter:third',effects:[]}]});
 return p;
}
