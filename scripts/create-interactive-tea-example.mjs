import fs from 'node:fs/promises';
import path from 'node:path';
import {validateProject} from '../src/domain/validator.js';
import {initialPreview,advancePreview,interactPreview} from '../src/domain/preview.js';
const root=path.resolve('examples/tea-with-goblins');
const project=JSON.parse(await fs.readFile(path.join(root,'Чай вместо подвига — послойный проект.vnproject'),'utf8'));
project.id='example_tea_interactive_v1';project.schemaVersion=3;project.meta.version='1.1.0';project.meta.saveDirectory='istoriya_tea_interactive_v1';
project.items=[{id:'tea-recipe',name:'Рецепт чая «Три пара»',description:'Мята, чабрец, ягоды и немного мёда. Брог всё ещё уточняет, сколько это — «на глаз».',iconResourceId:null}];
project.flags.push({id:'tea-recipe-received',name:'Получен рецепт чая',initial:false});
const scene=project.scenes.tea_5,service=scene.images.find(l=>l.resourceId==='tea-service'),table=scene.images.find(l=>l.resourceId==='table');
service.interactions=[{id:'inspect-tea',label:'Рассмотреть сервиз',text:'На каждой чашке — свой узор. Одну ручку заботливо обмотали тканью, чтобы она не обжигала пальцы.',once:false},
 {id:'take-recipe',label:'Попросить рецепт',speakerId:'brog',text:'Конечно. Мята, чабрец и ягоды. Только запиши: мёд — после заваривания. Тик однажды добавил полбанки. Потом мы пили пирог.',once:true,soundAssetId:'cup',soundVolume:0.55,inventory:{operation:'add',itemId:'tea-recipe',quantity:1},effects:[{kind:'flag',flagId:'tea-recipe-received',value:true}]}];
table.interactions=[{id:'inspect-table',label:'Осмотреть стол',text:'Край стола сглажен, а под короткой ножкой лежит плоский камень. Брог явно готовился к приходу гостей.',once:false}];
const insertion=scene.actions.findIndex(a=>a.type==='choice');
scene.actions.splice(insertion<0?scene.actions.length:insertion,0,{id:'tea-explore',type:'explore',prompt:'Осмотрите стол и попросите у Брога рецепт чая.',requiredFlagId:'tea-recipe-received'});
const validation=validateProject(project);if(!validation.valid)throw Error(JSON.stringify(validation.issues));
for(const first of [0,1])for(const second of [0,1]){
 let state=advancePreview(project,initialPreview(project,project.chapters[0].scenes[0])),choices=0,explored=false;
 for(let n=0;n<400&&!state.ended;n++){
  if(state.waiting?.type==='explore'){state=interactPreview(project,state,service.id,'take-recipe');if(state.waiting?.returnToExplore)state=advancePreview(project,state);state=advancePreview(project,state);explored=true;}
  else if(state.waiting?.type==='choice'){const index=choices++===0?first:second;state=advancePreview(project,state,state.waiting.options[index]?.id);}
  else state=advancePreview(project,state);
 }
 if(!state.ended||state.error||!explored||state.inventory['tea-recipe']!==1)throw Error('Интерактивная ветка не дошла до финала.');
}
const output=path.join(root,'Чай вместо подвига — интерактивный проект.vnproject');await fs.writeFile(output,JSON.stringify(project));
console.log(JSON.stringify({output,scenes:Object.keys(project.scenes).length,resources:project.resources.length,paths:4,validation:validation.summary,voiceRecordings:0},null,2));
