import fs from 'node:fs/promises';
import path from 'node:path';
import {buildWindowsGame} from '../runtime/builder.mjs';
import {createTeaVisualProject} from '../examples/tea-with-goblins/project.mjs';
import {prepareTeaAudio} from './tea-audio.mjs';
import {validateProject} from '../src/domain/validator.js';
const root=path.resolve('examples/tea-with-goblins'),assets=path.join(root,'assets');
await prepareTeaAudio(assets);
const images=[['forest-rain','Лес в дождь','background'],['forest-clear','Лес после дождя','background'],['cave-empty','Интерьер без стола','background'],['table','Стол','prop'],['tea-service','Чай и пирог','prop'],...['elira-neutral','elira-worried','elira-embarrassed','elira-happy','brog-neutral','brog-happy','tik-neutral','tik-happy'].map(id=>[id,id,'sprite'])];
const resources=[];
for(const [id,name,category]of images){const data=await fs.readFile(path.join(assets,`${id}.png`));resources.push({id,name,category,fileName:`${id}.png`,mime:'image/png',source:`data:image/png;base64,${data.toString('base64')}`,size:data.length,width:data.readUInt32BE(16),height:data.readUInt32BE(20)});}
for(const name of ['mystery','tea-theme','rain','fire','cup','twig','magic']){const data=await fs.readFile(path.join(assets,`${name}.wav`));resources.push({id:name,name:({'mystery':'Тревожная тема','tea-theme':'Тема чаепития','rain':'Дождь','fire':'Огонь','cup':'Звон чашки','twig':'Хруст ветки','magic':'Амулет'})[name],category:['mystery','tea-theme'].includes(name)?'music':'sound',fileName:`${name}.wav`,mime:'audio/wav',source:`data:audio/wav;base64,${data.toString('base64')}`,size:data.length});}
const text=JSON.parse(await fs.readFile(path.join(root,'Чай вместо подвига.vnproject'),'utf8')),project=createTeaVisualProject(text,resources);
project.meta.version='1.0.2';
const checked=validateProject(project);
if(!checked.valid)throw Error(JSON.stringify(checked.issues));
const output=path.resolve('release-games/tea-with-goblins');await fs.mkdir(output,{recursive:true});
await fs.writeFile(path.join(output,'Чай вместо подвига.vnproject'),JSON.stringify(project));
await fs.writeFile(path.join(root,'Чай вместо подвига — послойный проект.vnproject'),JSON.stringify(project));
if(!process.argv.includes('--project-only')){
 const result=await buildWindowsGame(project,{sdkPath:path.resolve('../renpy-8.5.3-sdk'),assetsRoot:path.resolve('public'),workDir:path.resolve('.artifacts/tea-layered-runtime'),outputDir:output,onProgress:message=>process.stdout.write(message)});
 await fs.writeFile(path.join(output,'build-result.json'),JSON.stringify({...result,resources:resources.length,scenes:Object.keys(project.scenes).length,validation:checked.summary},null,2));
 console.log(result);
}
console.log(`Portable project ready: ${resources.length} embedded resources, ${Object.keys(project.scenes).length} scenes.`);
