import fs from 'node:fs/promises';
import path from 'node:path';
import {createProject} from '../src/domain/projectFactory.js';
import {validateProject} from '../src/domain/validator.js';
import {solidPng} from './qa-png.mjs';
import {createQaDirectory} from './qa-directory.mjs';
const root=await createQaDirectory('navigation-assets-'),project=createProject({title:'Навигация — QA',resolution:{width:1280,height:720}}),base=Object.values(project.scenes)[0];project.id='navigation_qa';
const png=solidPng(100,120,[80,120,180,255]);project.resources=[{id:'shared-image',name:'Общий рисунок',category:'prop',mime:'image/png',source:`data:image/png;base64,${png.toString('base64')}`,fileName:'shared.png',size:png.length,width:100,height:120}];
project.scenes={};project.chapters=Array.from({length:10},(_,c)=>({id:`chapter_${c}`,title:`Глава ${c+1}`,scenes:Array.from({length:50},(_,i)=>`s${c*50+i}`)}));
for(let i=0;i<500;i++){const id=`s${i}`;project.scenes[id]={...structuredClone(base),id,number:`${Math.floor(i/50)+1}.${i%50+1}`,title:i===499?'Последняя сцена':'Сцена '+i,backgroundResourceId:'shared-image',actions:[{id:`text${i}`,type:'narration',text:`Контрольная реплика ${i}`},{id:`end${i}`,type:'end'}]};}
project.scenes.s0.title='Проверка ссылок';project.scenes.s0.actions=[{id:'initial',type:'narration',text:'ПЕРВЫЙ ШАГ'},{id:'second',type:'narration',text:'ПОТЕРЯННАЯ РЕПЛИКА'},{id:'explore',type:'explore',prompt:'Откройте дверь'},{id:'stop',type:'end'}];
project.scenes.s0.images=[{id:'door',name:'Дверь',resourceId:'shared-image',x:50,y:80,width:30,height:60,scale:100,rotation:0,opacity:100,visible:true,zOrder:50,interactions:[{id:'inspect',label:'Осмотреть',text:'ОБЫЧНАЯ РЕАКЦИЯ',effects:[]},{id:'open',label:'Открыть тайник',text:'ТАЙНАЯ РЕАКЦИЯ',resultResourceId:'shared-image',effects:[]}]}];
project.scenes.s1.timelineEnabled=true;project.scenes.s1.title='Старый монтаж';project.scenes.s1.actions=[{id:'timed',type:'showCG',assetId:'shared-image',timeline:{start:17,duration:3,enabled:true}},{id:'timed-text',type:'narration',text:'ВРЕМЕННОЙ ШАГ',timeline:{start:21,duration:3,enabled:true}},{id:'timed-end',type:'end',timeline:{start:25,duration:1,enabled:true}}];
project.characters=[{id:'hero',name:'Берёзка',color:'#ccaaff',mainSpriteId:'neutral',sprites:[{id:'neutral',name:'Спокойная',resourceId:'shared-image'},{id:'angry',name:'Сердитая',resourceId:'shared-image'}]}];
project.items=[{id:'key',name:'Ключ от тайника',description:'Проверка инвентаря',iconResourceId:'shared-image'}];project.gallery.sections=[{id:'initial-gallery',title:'Первый раздел',items:[]},{id:'second-gallery',title:'Второй раздел',items:[{id:'first-cg',title:'Первый рисунок',resourceId:'shared-image'},{id:'last-cg',title:'Последний рисунок',resourceId:'shared-image'}]}];project.ui.dialogueBackgroundResourceId='shared-image';
const report=validateProject(project);if(!report.valid)throw Error(JSON.stringify(report.issues));
const story=path.join(root,'navigation.vnproject');await fs.writeFile(story,JSON.stringify(project));const result={root,story};await fs.writeFile('.artifacts/navigation026-assets.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
