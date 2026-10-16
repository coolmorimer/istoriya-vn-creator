import fs from 'node:fs/promises';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {createProject} from '../src/domain/projectFactory.js';
import {useProjectStore as store} from '../src/store/projectStore.js';

const project=createProject(),base=Object.values(project.scenes)[0];
project.scenes={};project.chapters[0].scenes=[];
for(let i=0;i<500;i++){
 const id=`stress_scene_${i}`;
 project.scenes[id]={...base,id,title:`Сцена ${i+1}`,characters:[],actions:Array.from({length:10},(_,j)=>({id:`line_${i}_${j}`,type:'narration',text:`Реплика ${i+1}.${j+1}. Проверяем редактирование большого проекта без копирования ресурсов.`}))};
 project.chapters[0].scenes.push(id);
}
project.resources=[{id:'large',name:'Синтетический ресурс для измерения памяти',category:'background',source:'data:image/png;base64,'+'x'.repeat(8*1024*1024)}];
store.setState({project,activeSceneId:'stress_scene_0',activeActionId:'line_0_0',past:[],future:[],saveState:'saved'});
global.gc?.();const before=process.memoryUsage().heapUsed,times=[];
for(let i=0;i<25;i++){
 const start=performance.now();
 store.getState().updateAction('stress_scene_0','line_0_0',{text:`Изменение ${i}`});
 times.push(performance.now()-start);
}
global.gc?.();const after=process.memoryUsage().heapUsed;
const ordered=[...times].sort((a,b)=>a-b),state=store.getState();
const result={sceneCount:500,actionCount:5000,resourceBytes:8*1024*1024,edits:25,editMedianMs:ordered[12],editP95Ms:ordered[23],editTotalMs:times.reduce((a,b)=>a+b,0),retainedHeapDeltaBytes:after-before,historyEntries:state.past.length,historyFormat:state.past[0]?.forward?'patches':'project-snapshots',node:process.version};
const undoStart=performance.now();for(let i=0;i<25;i++)store.getState().undo();result.undoTotalMs=performance.now()-undoStart;
if(store.getState().project.scenes.stress_scene_0.actions[0].text!==project.scenes.stress_scene_0.actions[0].text)throw Error('Undo failed');
for(let i=0;i<25;i++)store.getState().redo();
if(store.getState().project.scenes.stress_scene_0.actions[0].text!=='Изменение 24')throw Error('Redo failed');
console.log(JSON.stringify(result,null,2));
if(process.argv[2]){const output=path.resolve(process.argv[2]);await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(result,null,2));}
