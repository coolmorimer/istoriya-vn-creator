import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {parseRuntimeReport,runtimeException} from '../runtime/runtime-verification.mjs';

const isolated=process.argv.includes('--isolated-desktop');
const startup=process.argv.includes('--startup');
const option=name=>{const index=process.argv.indexOf(name);return index<0?null:process.argv[index+1];};
const sourcePath=path.resolve(option('--source')??'.artifacts/tea-layered-runtime');
const fixturePath=path.resolve(startup?'tests/fixtures/standalone-startup.rpy':option('--fixture')??'tests/fixtures/tea-runtime-test.rpy');
const qaBase=path.resolve(option('--qa-root')??'.artifacts');await fs.mkdir(qaBase,{recursive:true});
const qa=await fs.mkdtemp(path.join(qaBase,'tea-runtime-qa-'));
const packageIndex=process.argv.indexOf('--package'),packagePath=packageIndex>=0?path.resolve(process.argv[packageIndex+1]):null;
let gameRoot=qa;
if(packagePath){
 const extracted=path.join(qa,'extracted');
 const unpack=spawn('powershell.exe',['-NoProfile','-File',path.resolve('scripts/unpack-game-qa.ps1'),'-Archive',packagePath,'-Destination',extracted],{windowsHide:true,stdio:'inherit'});
 if(await new Promise((resolve,reject)=>{unpack.on('error',reject);unpack.on('close',resolve);})!==0)throw Error('Не удалось распаковать игру для проверки.');
 const roots=(await fs.readdir(extracted,{withFileTypes:true})).filter(item=>item.isDirectory());
 if(roots.length!==1)throw Error('В ZIP ожидалась одна папка игры.');
 gameRoot=path.join(extracted,roots[0].name);
}else await fs.cp(sourcePath,qa,{recursive:true});
if(startup&&!packagePath)throw Error('Обычный запуск проверяется только для готового ZIP.');
await fs.copyFile(fixturePath,path.join(gameRoot,'game/qa_testcases.rpy'));
const sdk=path.resolve('../renpy-8.5.3-sdk');
const gameExe=packagePath?(await fs.readdir(gameRoot)).filter(file=>file.endsWith('.exe')):[];
if(packagePath&&gameExe.length!==1)throw Error('Не найден единственный EXE игры.');
const executable=packagePath?path.join(gameRoot,gameExe[0]):path.join(sdk,'lib/py3-windows-x86_64/python.exe');
const args=startup?[]:[...(packagePath?[gameRoot]:[path.join(sdk,'renpy.py'),qa]),'test','--report-detailed','--overwrite-screenshots'];
const request=path.join(qa,'request.json');
await fs.writeFile(request,JSON.stringify({executable,arguments:args,directory:gameRoot,logPath:path.join(qa,'test-output.log'),resultPath:path.join(qa,'process-result.json'),timeoutSeconds:startup?30:120},null,2));
console.log(`Runtime QA: ${qa}`);
const child=isolated?spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.resolve('scripts/run-isolated-game.ps1'),'-Request',request],{
 windowsHide:true,stdio:'inherit',env:{...process.env,SDL_VIDEODRIVER:'windows',SDL_AUDIODRIVER:'dummy',RENPY_RENDERER:'angle2',RENPY_PATH_TO_SAVES:path.join(qa,'saves')},
}):spawn(executable,args,{
 windowsHide:true,stdio:'inherit',env:{...process.env,SDL_VIDEODRIVER:'dummy',SDL_AUDIODRIVER:'dummy',RENPY_RENDERER:'sw',RENPY_PATH_TO_SAVES:path.join(qa,'saves')},
});
const timeout=isolated?null:setTimeout(()=>{console.error('Headless RenPy did not complete within 90 seconds. SDL dummy may not support this renderer; no desktop interaction was attempted.');child.kill();process.exitCode=1;},90_000);
let exitCode;
try{exitCode=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});}finally{clearTimeout(timeout);}
const output=await fs.readFile(path.join(qa,'test-output.log'),'utf8').catch(()=>''),fixture=await fs.readFile(fixturePath,'utf8');
const engineLog=await fs.readFile(path.join(gameRoot,'log.txt'),'utf8').catch(()=>'');
const expected=(fixture.match(/^testcase /gm)??[]).length;
const report=startup?{passed:exitCode===0&&output.includes('QA_STANDALONE_READY')&&!runtimeException(output+engineLog),runtimeException:runtimeException(output+engineLog),mainMenuReady:output.includes('QA_STANDALONE_READY')}:parseRuntimeReport(output+engineLog,exitCode,expected);
const result={...report,exitCode,mode:startup?'standalone-startup':packagePath?'packaged-exe':'compiled-source',packagePath,gameRoot,...(!startup&&{expectedCases:expected}),logPath:path.join(qa,'test-output.log'),isolatedDesktop:isolated,audioDriver:'dummy',checkedAt:new Date().toISOString()};
await fs.writeFile(path.join(qa,'result.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
process.exitCode=report.passed?0:1;
