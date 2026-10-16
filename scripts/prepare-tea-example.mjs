import fs from 'node:fs/promises';
import {createProject} from '../src/domain/projectFactory.js';
import {validateProject} from '../src/domain/validator.js';
const source=await fs.readFile('examples/tea-with-goblins/SCENARIO.md','utf8');
const sections=source.split(/^## /m).slice(1);
const cast=[['elira','Элира','#e2bdff'],['brog','Брог','#a5d48b'],['tik','Тик','#e5bd6f']];
const p=createProject({title:'Чай вместо подвига — текстовая постановка'});
p.meta.description='Оригинальный сценарий с двумя выборами. Иллюстрации ещё не добавлены; это не финальная визуальная сборка.';
p.id='example_tea_text';p.characters=cast.map(([id,name,color])=>({id,name,color,portrait:null,sprites:[],description:id==='elira'?'Жрица, 27 лет':'Взрослый гоблин'}));
const base=Object.values(p.scenes)[0];p.scenes={};
for(const [index,section] of sections.entries()) {
 const [title,...body]=section.split('\n');const id=`tea_${index+1}`;
 const paragraphs=body.join('\n').trim().split(/\n\s*\n/);
 p.scenes[id]={...structuredClone(base),id,number:`1.${index+1}`,title:title.replace(/^\d+\. /,''),description:'Текстовая постановка. План графики: STORYBOARD.md',timelineEnabled:false,actions:paragraphs.map((text,i)=>{
   const speaker=cast.find(([,name])=>text.startsWith(`${name}: `));
   return speaker?{id:`${id}_${i}`,type:'dialogue',speakerId:speaker[0],text:text.slice(speaker[1].length+2)}:{id:`${id}_${i}`,type:'narration',text};
 })};
}
const jump=(from,to)=>p.scenes[`tea_${from}`].actions.push({id:`jump_${from}`,type:'jump',targetSceneId:`tea_${to}`});
jump(1,2);jump(3,5);jump(4,5);jump(6,8);jump(7,8);
const choice=(scene,prompt,options)=>p.scenes[`tea_${scene}`].actions.push({id:`choice_${scene}`,type:'choice',prompt,options:options.map(([text,target],i)=>({id:`option_${scene}_${i}`,text,targetSceneId:`tea_${target}`,effects:[]}))});
choice(2,'Как встретить неизвестность?',[['Прикрыться светом амулета',3],['Спросить, что в котле',4]]);
choice(5,'За столом стало спокойно. Что сказать?',[['Признаться в своих подозрениях',6],['Похвалить пирог и попросить рецепт',7]]);
p.scenes.tea_8.actions.push({id:'tea_end',type:'end'});
p.chapters=[{id:'tea_chapter',title:'Чай вместо подвига',entrySceneId:'tea_1',scenes:Object.keys(p.scenes)}];
const result=validateProject(p);if(!result.valid)throw Error(JSON.stringify(result.issues));
await fs.writeFile('examples/tea-with-goblins/Чай вместо подвига.vnproject',JSON.stringify(p,null,2));
const words=Object.values(p.scenes).flatMap(s=>s.actions).filter(a=>a.text).map(a=>a.text).join(' ').split(/\s+/).length;
console.log(`Prepared editable text project: ${sections.length} scenes, 2 choices, ${words} words across all branches. Playtime depends on reading speed.`);
