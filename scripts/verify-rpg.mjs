import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';
import {createProject} from '../src/domain/projectFactory.js';import {defaultRpg} from '../runtime/rpg-model.mjs';import {createQaDirectory} from './qa-directory.mjs';import {solidPng} from './qa-png.mjs';import {compilerInternals} from '../runtime/compiler.mjs';
if(process.platform!=='win32')throw Error('Native RPG acceptance requires Windows release EXE');
const root=await createQaDirectory('rpg-runtime-'),p=createProject({title:'Игровые системы — техническая проверка',resolution:{width:1280,height:720}}),s=Object.values(p.scenes)[0];
p.items=[{id:'herb',name:'Трава'},{id:'water',name:'Вода'},{id:'tea',name:'Чай'},{id:'gem',name:'Знак'}];p.resources=[{id:'bg',name:'Synthetic QA background',category:'background',mime:'image/png',source:'data:image/png;base64,'+solidPng(64,64,[35,45,65,255]).toString('base64')}];s.backgroundResourceId='bg';s.transition='none';p.rpg={...defaultRpg(),enabled:true,skills:[{id:'magic',name:'Искра',initial:1,max:10,power:5}],recipes:[{id:'tea',name:'Чай',ingredients:[{itemId:'herb',quantity:2},{itemId:'water',quantity:1}],results:[{itemId:'tea',quantity:1}],skillId:'magic',requiredLevel:1}],locations:[{id:'home',name:'Дом',sceneId:'home',x:30,y:50,condition:{itemId:'tea',operator:'gte',value:1}}],actors:[{id:'host',name:'Хозяин',role:'npc',text:'Не код: [missing_name]',loot:[]},{id:'mob',name:'Тренер',role:'enemy',text:'',health:30,attack:5,xp:100,loot:[{itemId:'gem',quantity:1}],winSceneId:'home'}]};
s.actions=[{id:'supply',type:'choice',prompt:'Припасы',options:[{id:'take',text:'Взять припасы',targetSceneId:'craft',effects:[{kind:'inventory',itemId:'herb',operation:'add',quantity:2},{kind:'inventory',itemId:'water',operation:'add',quantity:1}]}]}];
const scene=(id,title,actions)=>({id,title,backgroundResourceId:'bg',transition:'none',characters:[],images:[],actions});p.scenes.craft=scene('craft','Мастерская',[{id:'craft',type:'rpg',operation:'craft'},{id:'npc',type:'rpg',operation:'actor',actorId:'host'},{id:'battle',type:'rpg',operation:'actor',actorId:'mob'},{id:'end',type:'end'}]);p.scenes.home=scene('home','Дом',[{id:'home',type:'narration',text:'Домой после победы'},{id:'map',type:'rpg',operation:'map'},{id:'end',type:'end'}]);p.chapters[0].scenes.push('craft','home');
await fs.mkdir(path.join(root,'temp'));const fixture=path.join(root,'fixture.vnproject');await fs.writeFile(fixture,JSON.stringify(p));const command=async(name,exe,args)=>{let output='';const child=spawn(exe,args,{windowsHide:true,env:{...process.env,TEMP:path.join(root,'temp'),TMP:path.join(root,'temp')}});for(const stream of [child.stdout,child.stderr])stream.on('data',data=>{output+=data;process.stdout.write(data);});const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});await fs.writeFile(path.join(root,name+'.log'),output);assert.equal(code,0,name);};
await command('native',path.resolve('src-tauri/target/release/istoriya.exe'),['--verify-native',fixture,path.join(root,'native')]);const built=JSON.parse(await fs.readFile(path.join(root,'native/result.json'),'utf8'));assert.equal(built.nativeStorage,true);assert.equal(built.reopenEqualsOriginal,true);
const checks=`testsuite global:
    before testcase:
        $ _test.timeout = 30.0
        $ _test.transition_timeout = 0.05
    teardown:
        exit

testcase rpg_craft_npc_battle_save_rollback_map:
    run Start("${compilerInternals.asciiId(s.id,'scene')}")
    advance until screen "choice"
    click "Взять припасы"
    advance until screen "istoriya_rpg_panel"
    assert eval istoriya_inventory.get('herb') == 2
    assert eval _istoriya_rpg_craft_reason('tea') == ''
    run FileSave('before-craft', confirm=False, page='qa')
    click "Создать: Чай"
    assert eval istoriya_inventory.get('tea') == 1 and istoriya_inventory.get('herb') == 0 and istoriya_inventory.get('water') == 0
    assert eval _istoriya_rpg_craft_reason('tea') != ''
    run FileLoad('before-craft', confirm=False, page='qa')
    pause 0.1
    assert eval istoriya_inventory.get('herb') == 2 and istoriya_inventory.get('tea', 0) == 0
    click "Создать: Чай"
    click "Продолжить"
    advance until screen "istoriya_rpg_panel"
    click "Поговорить"
    advance until screen "say"
    assert eval renpy.get_screen('say') is not None and _rpg_actor['text'] == 'Не код: [missing_name]'
    advance until screen "istoriya_rpg_panel"
    click "Продолжить"
    advance until eval istoriya_rpg.get('battle') is not None
    run FileSave('battle', confirm=False, page='qa')
    click "Атаковать"
    assert eval istoriya_rpg['health'] == 95 and istoriya_rpg['battle']['health'] == 20
    run FileLoad('battle', confirm=False, page='qa')
    pause 0.1
    assert eval istoriya_rpg['health'] == 100 and istoriya_rpg['battle']['health'] == 30
    click "Навык: Искра"
    assert eval istoriya_rpg['health'] == 95 and istoriya_rpg['battle']['health'] == 15
    click "Навык: Искра"
    advance until eval (_last_say_what or '') == 'Домой после победы'
    assert eval istoriya_rpg['xp'] == 100 and _istoriya_rpg_stat('level') == 2
    assert eval istoriya_inventory.get('gem') == 1 and 'mob' in istoriya_rpg['defeated']
    run FileSave('victory', confirm=False, page='qa')
    run Rollback()
    advance until screen "istoriya_rpg_panel"
    assert eval istoriya_rpg['battle'] is not None and istoriya_inventory.get('gem', 0) == 0
    run FileLoad('victory', confirm=False, page='qa')
    pause 0.1
    assert eval istoriya_inventory.get('gem') == 1 and istoriya_rpg['xp'] == 100
    $ _istoriya_rpg_begin('mob')
    assert eval istoriya_rpg['battle'] is None
    $ _istoriya_rpg_change('health', 'subtract', 1000)
    assert eval istoriya_rpg['health'] == 0
    $ _istoriya_rpg_change('health', 'add', 1000)
    assert eval istoriya_rpg['health'] == 100
    advance until screen "istoriya_rpg_panel"
    assert eval _istoriya_rpg_travel('home') == 'scene_home'
    click "Дом"
    advance until eval (_last_say_what or '') == 'Домой после победы'
    assert eval istoriya_inventory.get('tea') == 1
`;
const testcase=path.join(root,'testcases.rpy');await fs.writeFile(testcase,checks);const before=new Set(await fs.readdir(root));await command('runtime',process.execPath,['scripts/test-tea-runtime.mjs','--isolated-desktop','--package',built.build.packagePath,'--fixture',testcase,'--qa-root',root]);const directory=(await fs.readdir(root)).filter(n=>n.startsWith('tea-runtime-qa-')&&!before.has(n));assert.equal(directory.length,1);const runtime=JSON.parse(await fs.readFile(path.join(root,directory[0],'result.json'),'utf8'));assert.equal(runtime.passed,true);assert.equal(runtime.runtimeException,false);const result={passed:true,root,built,runtime,scope:'Technical RPG runtime, not UI authoring or full production acceptance'};await fs.writeFile(path.join(root,'rpg-result.json'),JSON.stringify(result,null,2));await fs.writeFile('.artifacts/rpg-runtime-location.json',JSON.stringify({root,resultPath:path.join(root,'rpg-result.json')},null,2));console.log(JSON.stringify({passed:true,root,assertions:runtime.passedAssertions}));
