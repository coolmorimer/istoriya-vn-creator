import fs from 'node:fs/promises';
import path from 'node:path';
import {createProject} from '../src/domain/projectFactory.js';
import {validateProject} from '../src/domain/validator.js';
import {solidPng} from './qa-png.mjs';
import {createQaDirectory} from './qa-directory.mjs';
const root=await createQaDirectory('destinations-assets-');
const project=createProject({title:'Переходы — QA',resolution:{width:1280,height:720}}),base=Object.values(project.scenes)[0];project.id='destinations_qa';
const scene=(id,title,actions)=>({...structuredClone(base),id,title,actions,characters:[],images:[]});
project.chapters=[{id:'a',title:'Начало',scenes:['start','jump','condition','prop']},{id:'b',title:'Чужая глава',scenes:['old','new'],entrySceneId:'old'},{id:'c',title:'Финалы',scenes:['yes','no']}];
project.flags=[{id:'gate',name:'Дверь открыта',initial:false}];project.scenes={};
for(const [id,title,text]of [['old','Старый вход','СТАРЫЙ ВХОД'],['new','Новый вход','НОВЫЙ ВХОД'],['yes','Верная сцена','ВЕРНАЯ СЦЕНА'],['no','Другой финал','ДРУГОЙ ФИНАЛ']])project.scenes[id]=scene(id,title,[{id:`${id}_text`,type:'narration',text},{id:`${id}_end`,type:'end'}]);
project.scenes.start=scene('start','Развилка',[{id:'choice',type:'choice',prompt:'Выберите направление',options:[{id:'one',text:'Вход в главу',targetChapterId:'b',targetSceneId:null,effects:[]},{id:'two',text:'Другой путь',targetSceneId:'no',effects:[]}]}]);
project.scenes.jump=scene('jump','Обычный переход',[{id:'jump_action',type:'jump',targetChapterId:'b',targetSceneId:'old'}]);
project.scenes.condition=scene('condition','Условное направление',[{id:'before',type:'narration',text:'ПРОВЕРКА УСЛОВИЯ'},{id:'check',type:'condition',condition:{flagId:'gate',value:true},trueChapterId:'b',trueSceneId:'old',falseChapterId:'b',falseSceneId:'old'}]);
project.scenes.prop=scene('prop','Предмет с переходом',[{id:'explore',type:'explore',prompt:'Откройте дверь'},{id:'stop',type:'end'}]);
const png=solidPng(100,120,[80,120,180,255]);project.resources=[{id:'door-image',name:'Дверь',category:'prop',mime:'image/png',source:`data:image/png;base64,${png.toString('base64')}`,fileName:'door.png',size:png.length,width:100,height:120}];
project.scenes.prop.images=[{id:'door',name:'Дверь',resourceId:'door-image',x:50,y:80,width:30,height:60,scale:100,rotation:0,opacity:100,visible:true,zOrder:50,interactions:[{id:'open',label:'Войти',text:'ДВЕРЬ ОТКРЫТА',targetChapterId:'b',targetSceneId:null,effects:[]}]}];
for(const [ci,chapter]of project.chapters.entries())for(const [si,id]of chapter.scenes.entries()){project.scenes[id].number=`${ci+1}.${si+1}`;project.scenes[id].mapPosition={x:40+si*280,y:40+ci*200};}
const large=createProject({title:'500 сцен — выбор назначения'}),largeBase=Object.values(large.scenes)[0];large.id='destinations_500';large.scenes={};large.chapters=Array.from({length:10},(_,c)=>({id:`chapter_${c}`,title:`Глава ${c+1}`,scenes:Array.from({length:50},(_,i)=>`s${c*50+i}`)}));
for(let i=499;i>=0;i--){const id=`s${i}`;large.scenes[id]={...structuredClone(largeBase),id,number:`${Math.floor(i/50)+1}.${i%50+1}`,title:i===499?'Последняя цель':'Сцена '+i,actions:[{id:`end${i}`,type:'end'}]};}
large.scenes.s0.actions=[{id:'choose',type:'choice',prompt:'Куда?',options:[{id:'first',text:'Последняя',targetSceneId:'s499',effects:[]},{id:'second',text:'Начальная',targetSceneId:'s0',effects:[]}]}];
for(const [name,value]of [['story.vnproject',project],['large.vnproject',large]]){const report=validateProject(value);if(!report.valid)throw Error(JSON.stringify(report.issues));await fs.writeFile(path.join(root,name),JSON.stringify(value));}
const result={root,story:path.join(root,'story.vnproject'),large:path.join(root,'large.vnproject')};await fs.writeFile('.artifacts/destinations025-assets.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
