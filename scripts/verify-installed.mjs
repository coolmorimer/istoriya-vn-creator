import path from 'node:path';
import { buildGame } from '../runtime/builder.mjs';
import { createProject } from '../src/domain/projectFactory.js';
const install=path.resolve(process.argv[2] ?? '.artifacts/installer-smoke-0.1.1');
const project=createProject({title:'Installation smoke test'});
Object.values(project.scenes)[0].actions=[{id:'hello',type:'narration',text:'Установленная версия работает.'}];
const result=await buildGame(project,'windows',{
  sdkPath:path.join(install,'resources/renpy-sdk'),assetsRoot:path.join(install,'resources/public'),
  workDir:path.resolve('.artifacts/installed-runtime-test'),outputDir:path.resolve('.artifacts/installed-game'),
});
console.log(JSON.stringify(result,null,2));
