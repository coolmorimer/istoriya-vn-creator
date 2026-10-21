import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';
import {createProject} from '../src/domain/projectFactory.js';import {cameraPreset,cameraPose} from '../runtime/keyframes.mjs';import {solidPng} from './qa-png.mjs';import {createQaDirectory} from './qa-directory.mjs';
if(process.platform!=='win32')throw Error('Native keyframe acceptance requires the Windows release EXE.');
const root=await createQaDirectory('keyframe-runtime-'),p=createProject({title:'Камера — техническая проверка',resolution:{width:1280,height:720}});p.resources=[{id:'bg',name:'Synthetic QA background',category:'background',mime:'image/png',source:'data:image/png;base64,'+solidPng(64,64,[30,50,70,255]).toString('base64')}];p.characters=[{id:'hero',name:'Hero QA',sprites:[{id:'main',resourceId:'bg',name:'Основной'}],defaultSpriteId:'main'}];p.scenes={};p.chapters[0].scenes=['shake','cinema','timed'];
const frame=(id,time,values)=>({id,time,easing:'linear',...cameraPose(),...values}),base={backgroundResourceId:'bg',transition:'none',images:[],characters:[{id:'hero-layer',characterId:'hero',x:25,y:85,scale:70,opacity:100,rotation:0,visible:true}]};
for(const name of ['shake','cinema'])p.scenes[name]={...structuredClone(base),id:name,title:name,actions:[{id:'motion',type:'keyframes',target:{kind:'camera'},keyframes:cameraPreset(name)},{id:'after',type:'narration',text:'after '+name},{id:'end',type:'end'}]};
p.scenes.timed={...structuredClone(base),id:'timed',title:'Timed independent motion',timelineEnabled:true,actions:[{id:'background',type:'background',assetId:'bg',timeline:{start:0,duration:4}},{id:'text',type:'narration',text:'timed movement',timeline:{start:0,duration:5,waitForClick:true}},...[
 {id:'camera',target:{kind:'camera'},start:cameraPose(),end:{...cameraPose(),x:55,y:52,scale:125,rotation:5}},
 {id:'background-motion',target:{kind:'background'},start:cameraPose(),end:{...cameraPose(),x:48,scale:110,blur:2}},
 {id:'hero-motion',target:{kind:'character',id:'hero'},start:{...cameraPose(),x:25,y:85,scale:70},end:{...cameraPose(),x:55,y:90,scale:80,opacity:75,blur:3}}
].map(a=>({id:a.id,type:'keyframes',target:a.target,keyframes:[frame('start',0,a.start),frame('end',2,a.end)],timeline:{start:1,duration:2}}))]};
const fixturePath=path.join(root,'fixture.vnproject');await fs.writeFile(fixturePath,JSON.stringify(p));await fs.mkdir(path.join(root,'temp'));const command=async(name,exe,args)=>{let output='';const child=spawn(exe,args,{windowsHide:true,env:{...process.env,TEMP:path.join(root,'temp'),TMP:path.join(root,'temp')}});for(const s of [child.stdout,child.stderr])s.on('data',chunk=>{output+=chunk;process.stdout.write(chunk);});const exitCode=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});await fs.writeFile(path.join(root,name+'.log'),output);assert.equal(exitCode,0,name);};
await command('native',path.resolve('src-tauri/target/release/istoriya.exe'),['--verify-native',fixturePath,path.join(root,'native')]);const built=JSON.parse(await fs.readFile(path.join(root,'native/result.json'),'utf8'));assert.equal(built.reopenEqualsOriginal,true);
const checks=`init python:
    from renpy.display.position import position as _qa_position
    def _qa_rel(v):
        p = _qa_position.from_any(v)
        assert p.absolute == 0
        return p.relative

testsuite global:
    before testcase:
        $ _test.timeout = 30.0
        $ _test.transition_timeout = 0.05
        if not screen "main_menu":
            run MainMenu(confirm=False)
    teardown:
        exit

testcase camera_shake_settles:
    run Start("scene_shake")
    pause 0.12
    $ c = renpy.game.context().scene_lists.camera_transform["master"].state
    assert eval abs(_qa_rel(c.xpos) - 0.5) > 0.001
    advance until eval (_last_say_what or "") == "after shake"
    $ c = renpy.game.context().scene_lists.camera_transform["master"].state
    assert eval abs(_qa_rel(c.xpos) - 0.5) < 0.001
    assert eval abs(_qa_rel(c.ypos) - 0.5) < 0.001
    assert eval abs(c.zoom - 1.0) < 0.001

testcase camera_cinema_is_real_motion:
    run Start("scene_cinema")
    pause 1.0
    $ c = renpy.game.context().scene_lists.camera_transform["master"].state
    assert eval c.zoom > 1.001 and c.zoom < 1.5
    advance until eval (_last_say_what or "") == "after cinema"
    assert eval abs(renpy.game.context().scene_lists.camera_transform["master"].state.zoom - 1.5) < 0.001

testcase timed_parallel_camera_background_character:
    run Start("scene_timed")
    pause 1.8
    $ c = renpy.game.context().scene_lists.camera_transform["master"].state
    $ bg = renpy.game.context().scene_lists.get_displayable_by_tag("master", "istoriya_timeline_bg").state
    $ hero = renpy.game.context().scene_lists.get_displayable_by_tag("master", "actor_hero").state
    assert eval c.zoom > 1.02 and c.zoom < 1.25
    assert eval _qa_rel(bg.xpos) > 0.48 and _qa_rel(bg.xpos) < 0.5
    assert eval _qa_rel(hero.xpos) > 0.25 and _qa_rel(hero.xpos) < 0.55
    pause 1.6
    $ c = renpy.game.context().scene_lists.camera_transform["master"].state
    $ bg = renpy.game.context().scene_lists.get_displayable_by_tag("master", "istoriya_timeline_bg").state
    $ hero = renpy.game.context().scene_lists.get_displayable_by_tag("master", "actor_hero").state
    assert eval abs(c.zoom - 1.25) < 0.001
    assert eval abs(_qa_rel(bg.xpos) - 0.48) < 0.001 and abs(bg.blur - 2) < 0.001
    assert eval abs(_qa_rel(hero.xpos) - 0.55) < 0.001 and abs(hero.blur - 3) < 0.001
    pause 1.0
    assert eval not renpy.showing("istoriya_timeline_bg")
    assert eval renpy.showing("istoriya_scene_bg")
`;
const testcase=path.join(root,'testcases.rpy');await fs.writeFile(testcase,checks);const previous=new Set(await fs.readdir(root));await command('runtime',process.execPath,['scripts/test-tea-runtime.mjs','--isolated-desktop','--package',built.build.packagePath,'--fixture',testcase,'--qa-root',root]);const directories=(await fs.readdir(root)).filter(n=>n.startsWith('tea-runtime-qa-')&&!previous.has(n));assert.equal(directories.length,1);const runtime=JSON.parse(await fs.readFile(path.join(root,directories[0],'result.json'),'utf8'));assert.equal(runtime.passedCases,3);assert.equal(runtime.passedAssertions,14);assert.equal(runtime.runtimeException,false);const result={passed:true,root,nativeStorage:true,nativeReopen:true,packaged:true,built,runtime,fullProductionAccepted:false};await fs.writeFile(path.join(root,'keyframe-result.json'),JSON.stringify(result,null,2));await fs.writeFile('.artifacts/keyframe-runtime-location.json',JSON.stringify({root,resultPath:path.join(root,'keyframe-result.json')},null,2));console.log(JSON.stringify({passed:true,root,cases:3,assertions:14}));
