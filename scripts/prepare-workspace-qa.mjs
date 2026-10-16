import fs from 'node:fs/promises';
import path from 'node:path';
import {createQaDirectory} from './qa-directory.mjs';
import {validateProject} from '../src/domain/validator.js';
const root=await createQaDirectory('workspace-assets-'),nav=JSON.parse(await fs.readFile('.artifacts/navigation026-assets.json','utf8')),p=JSON.parse(await fs.readFile(nav.story,'utf8'));p.id='workspace_qa';p.meta.title='Большая история — QA';
for(let i=0;i<500;i++){const s=p.scenes[`s${i}`];s.title=i===499?'Последняя сцена':'Сцена '+i;delete s.timelineEnabled;s.actions=[{id:`text${i}`,type:'narration',text:`РЕПЛИКА ${i}`},i===499?{id:'finish',type:'end'}:{id:`branch${i}`,type:'choice',prompt:'Выберите путь',options:[{id:`next${i}`,text:'Дальше',targetSceneId:`s${i+1}`,effects:[]},{id:`other${i}`,text:'Другая ветка',targetSceneId:`s${Math.min(499,i+2)}`,effects:[]}]}];s.mapPosition={x:50+(i%5)*300,y:50+Math.floor(i/5)*200};}
const report=validateProject(p);if(!report.valid)throw Error(JSON.stringify(report.issues));const story=path.join(root,'workspace.vnproject');await fs.writeFile(story,JSON.stringify(p));await fs.writeFile('.artifacts/workspace027-assets.json',JSON.stringify({root,story},null,2));console.log(JSON.stringify({root,story}));
