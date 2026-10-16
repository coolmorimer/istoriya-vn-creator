import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {createHash} from 'node:crypto';
import {createQaDirectory} from './qa-directory.mjs';import {solidPng} from './qa-png.mjs';import {createProject} from '../src/domain/projectFactory.js';import {compilerInternals} from '../runtime/compiler.mjs';
if(process.platform!=='win32')throw Error('This check requires Windows and the release EXE.');
const root=await createQaDirectory('release-smoke-'),executable=path.resolve('src-tauri/target/release/istoriya.exe'),json=async file=>JSON.parse((await fs.readFile(file,'utf8')).replace(/^\uFEFF/,''));
async function command(name,exe,args){let output='';const child=spawn(exe,args,{windowsHide:true,env:{...process.env,TEMP:path.join(root,'temp'),TMP:path.join(root,'temp')}});for(const stream of [child.stdout,child.stderr])stream.on('data',data=>{output+=data;process.stdout.write(data);});const exitCode=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});await fs.writeFile(path.join(root,name+'.log'),output);assert.equal(exitCode,0,name);return output;}
await fs.mkdir(path.join(root,'temp'));const p=createProject({title:'Проверка выпуска — QA',resolution:{width:1280,height:720}}),s=Object.values(p.scenes)[0],image=solidPng(64,64,[50,40,80,255]);p.resources=[{id:'bg',name:'QA rectangle — not artwork',category:'background',mime:'image/png',source:'data:image/png;base64,'+image.toString('base64')}];
s.actions=[{id:'bg',type:'background',assetId:'bg',transition:'none'},{id:'intro',type:'narration',text:'Начало проверки'},{id:'choice',type:'choice',prompt:'Выберите путь',options:[{id:'one',text:'Первый путь',targetSceneId:'release_one'},{id:'two',text:'Второй путь',targetSceneId:'release_two'}]}];for(const [id,text]of [['release_one','Первый финал'],['release_two','Второй финал']]){p.scenes[id]={id,title:text,characters:[],actions:[{id:'text',type:'narration',text},{id:'end',type:'end'}]};p.chapters[0].scenes.push(id);}
const fixture=path.join(root,'fixture.vnproject');await fs.writeFile(fixture,JSON.stringify(p));const bundleFile=path.join(root,'bundle.json');await command('bundle',executable,['--verify-bundle',bundleFile]);assert.equal((await json(bundleFile)).standalone,true);
const native=path.join(root,'native');await command('native',executable,['--verify-native',fixture,native]);const built=await json(path.join(native,'result.json'));assert.equal(built.nativeStorage,true);assert.equal(built.reopenEqualsOriginal,true);const packagePath=built.build.packagePath;assert.ok((await fs.stat(packagePath)).size>0);
const testcase=path.join(root,'testcases.rpy'),label=compilerInternals.asciiId(s.id,'scene');await fs.writeFile(testcase,`testsuite global:
    before testcase:
        $ _test.timeout = 20.0
        $ _test.transition_timeout = 0.05
    teardown:
        exit

testcase release_native_save_branches_and_load:
    run Start(${JSON.stringify(label)})
    advance until eval (_last_say_what or "") == "Начало проверки"
    assert eval __import__("hashlib").sha256(renpy.loader.load("assets/generated/asset_background_bg.png").read()).hexdigest() == "${createHash('sha256').update(image).digest('hex')}"
    advance until screen "choice"
    run FileSave("release-choice", confirm=False, page="qa")
    assert eval FileLoadable("release-choice", page="qa")
    click "Первый путь"
    advance until eval (_last_say_what or "") == "Первый финал"
    assert eval (_last_say_what or "") == "Первый финал"
    run FileLoad("release-choice", confirm=False, page="qa")
    pause 0.1
    assert screen "choice"
    click "Второй путь"
    advance until eval (_last_say_what or "") == "Второй финал"
    assert eval (_last_say_what or "") == "Второй финал"
`);
const runtime=[];for(const mode of ['tests','startup']){const output=await command(mode,process.execPath,['scripts/test-tea-runtime.mjs','--isolated-desktop','--package',packagePath,'--qa-root',root,...(mode==='startup'?['--startup']:['--fixture',testcase])]);const directory=output.split(/\r?\n/).find(line=>line.startsWith('Runtime QA: '))?.slice(12);assert.ok(directory);const result=await json(path.join(directory,'result.json'));assert.equal(result.passed,true);assert.equal(result.runtimeException,false);runtime.push({mode,directory,result});}
const result={passed:true,version:JSON.parse(await fs.readFile('package.json','utf8')).version,root,native:built,runtime,cleanWindowsInstallationVerified:false,installerUpgradeVerified:false,fullProductionAccepted:false};await fs.writeFile(path.join(root,'release-smoke.json'),JSON.stringify(result,null,2));await fs.writeFile('.artifacts/release-smoke-location.json',JSON.stringify({root,resultPath:path.join(root,'release-smoke.json')},null,2));console.log(JSON.stringify({passed:true,root,scope:'Native storage/compiler/package smoke only, not installer or full production acceptance'}));
