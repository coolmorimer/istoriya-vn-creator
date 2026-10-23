import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {createHash} from 'node:crypto';
import {createQaDirectory} from './qa-directory.mjs';import {storyGame} from '../tests/fixtures/story-game.mjs';
if(process.platform!=='win32')throw Error('Actual Windows EXE/SDK required');
const root=await createQaDirectory('story-runtime-'),read=async p=>JSON.parse((await fs.readFile(p,'utf8')).replace(/^\uFEFF/,''));await fs.mkdir(path.join(root,'temp'));const project=storyGame(),fixture=path.join(root,'fixture.vnproject');await fs.writeFile(fixture,JSON.stringify(project));
const command=async(name,exe,args)=>{let text='';const p=spawn(exe,args,{windowsHide:true,env:{...process.env,TEMP:path.join(root,'temp'),TMP:path.join(root,'temp')}});for(const s of[p.stdout,p.stderr])s.on('data',b=>{text+=b;process.stdout.write(b);});const code=await new Promise((resolve,reject)=>{p.on('error',reject);p.on('close',resolve);});await fs.writeFile(path.join(root,name+'.log'),text);assert.equal(code,0,name);return text;};
const exe=path.resolve('src-tauri/target/release/istoriya.exe'),uiIndex=process.argv.indexOf('--ui-receipt');let native;
if(uiIndex>=0){
 const receiptFile=await fs.realpath(process.argv[uiIndex+1]),uiRoot=path.dirname(receiptFile),profile=await read(path.join(uiRoot,'ui-profile.json')),profileRoot=await fs.realpath(profile.profile);
 assert.equal(path.dirname(profileRoot),uiRoot);assert.match(path.basename(profileRoot),/^ui-profile-/);assert.equal(await fs.readFile(path.join(profileRoot,'qa-profile-marker'),'utf8'),profile.marker);
 native=await read(receiptFile);assert.equal(native.isolatedQa,true);assert.ok(path.resolve(native.build.packagePath).startsWith(uiRoot+path.sep));
 const stored=await read(path.join(profileRoot,'workspace/workspace.json')),authored=JSON.parse(stored.values['istoriya-project-v2']);assert.equal(authored.id,native.projectId);assert.equal(authored.meta.title,project.meta.title);assert.equal(Object.keys(authored.scenes).length,Object.keys(project.scenes).length);
}else{await command('native',exe,['--verify-native',fixture,path.join(root,'native')]);native=await read(path.join(root,'native/result.json'));assert.equal(native.reopenEqualsOriginal,true);}
assert.equal(native.build.engine.storyPlanner,'rust');assert.equal(native.build.engine.storyStart,'entry');
const cases=path.join(root,'story-tests.rpy');await fs.writeFile(cases,`testsuite global:
    before testcase:
        $ _test.timeout = 25.0
        $ _test.transition_timeout = 0.05
        if not screen "main_menu":
            run MainMenu(confirm=False)
    teardown:
        exit

testcase typed_chapter_prop_condition_orphan_and_save_load:
    run Start()
    advance until eval (_last_say_what or "") == "Вход первой главы"
    assert eval (_last_say_what or "") == "Вход первой главы"
    advance until eval (_last_say_what or "") == "Осмотрите дверь"
    assert eval (_last_say_what or "") == "Осмотрите дверь"
    advance until screen "istoriya_explore"
    click pos (640, 300)
    advance until eval (_last_say_what or "") == "Дверь открылась"
    assert eval (_last_say_what or "") == "Дверь открылась"
    advance until eval (_last_say_what or "") == "Переход предмета в главу"
    assert eval (_last_say_what or "") == "Переход предмета в главу"
    advance until screen "choice"
    run FileSave('story038', confirm=False, page='qa')
    assert eval FileLoadable('story038', page='qa')
    click "Условие да"
    advance until eval (_last_say_what or "") == "Вход последней главы"
    assert eval (_last_say_what or "") == "Вход последней главы"
    advance until eval (_last_say_what or "") == "Свободная сцена"
    assert eval (_last_say_what or "") == "Свободная сцена"
    run FileLoad('story038', confirm=False, page='qa')
    pause 0.1
    assert screen "choice"
    assert eval not flag_gate
    click "Литеральная сцена"
    advance until eval (_last_say_what or "") == "Литеральное имя сцены"
    assert eval (_last_say_what or "") == "Литеральное имя сцены"

testcase false_condition_stays_on_scene_destination:
    run Start('scene_choice')
    advance until screen "choice"
    click "Условие нет"
    advance until eval (_last_say_what or "") == "Ложная ветвь"
    assert eval (_last_say_what or "") == "Ложная ветвь"
`);
const games=[];for(const startup of[false,true]){const text=await command(startup?'startup':'game',process.execPath,['scripts/test-tea-runtime.mjs','--isolated-desktop','--package',native.build.packagePath,'--qa-root',root,...(startup?['--startup']:['--fixture',cases])]);const dir=text.split(/\r?\n/).find(l=>l.startsWith('Runtime QA: '))?.slice(12);assert.ok(dir);const r=await read(path.join(dir,'result.json'));assert.equal(r.passed,true);assert.equal(r.runtimeException,false);games.push(r);}
const result={passed:true,version:JSON.parse(await fs.readFile('package.json','utf8')).version,root,native,games,actualUiBuild:uiIndex>=0,executableSha256:createHash('sha256').update(await fs.readFile(exe)).digest('hex'),ownerProfileChanged:false,osMouseAutomation:false,fullRustRuntime:false};await fs.writeFile(path.join(root,'story-runtime-report.json'),JSON.stringify(result,null,2));await fs.writeFile('.artifacts/story-runtime-location.json',JSON.stringify({root,resultPath:path.join(root,'story-runtime-report.json')},null,2));console.log(JSON.stringify({passed:true,root,scope:'Actual native planner and Windows game; not the own Rust player runtime'}));
