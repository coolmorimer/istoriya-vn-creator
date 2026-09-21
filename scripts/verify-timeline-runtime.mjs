import path from 'node:path';
import {compileProject} from '../runtime/compiler.mjs';
import {createProject} from '../src/domain/projectFactory.js';
const project=createProject({title:'Проверка временной шкалы'});
const scene=Object.values(project.scenes)[0];
scene.timelineEnabled=true;
scene.actions=[
 {id:'text',type:'narration',text:'Текст с первой секунды. Остальные дорожки продолжаются.',timeline:{start:1,duration:3,waitForClick:true}},
 {id:'text2',type:'narration',text:'Автоматический клип без ожидания.',timeline:{start:4,duration:1,waitForClick:false}},
];
console.log(await compileProject(project,path.resolve('.artifacts/timeline-runtime'),{sdkPath:path.resolve('../renpy-8.5.3-sdk'),assetsRoot:path.resolve('public')}));
