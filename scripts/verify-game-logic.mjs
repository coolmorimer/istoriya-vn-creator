import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {createProject} from '../src/domain/projectFactory.js';
import {compileProject} from '../runtime/compiler.mjs';
import {validateProject} from '../src/domain/validator.js';
import {solidPng} from './qa-png.mjs';
const base=path.join(process.env.LOCALAPPDATA??os.tmpdir(),'IstoriyaQA');await fs.mkdir(base,{recursive:true});
const root=await fs.mkdtemp(path.join(base,'game-logic-'));
const p=createProject({title:'Правила игры — QA',resolution:{width:1280,height:720}}),s=Object.values(p.scenes)[0];s.id='rules';s.title='Правила';p.scenes={rules:s};p.chapters[0].scenes=['rules','check','win','lose'];p.ui.textStyle={speed:0};
p.items=[{id:'coin',name:'Монета',description:''},{id:'token',name:'Пропуск',description:''}];p.flags=[{id:'touched',name:'Монеты найдены',initial:false},{id:'open',name:'Открыто',initial:false},{id:'keep',name:'Второй флаг',initial:true}];
p.variables=[{id:'love',name:'Отношения',type:'relationship',initial:0,min:0,max:3},{id:'score',name:'Очки',type:'number',initial:0},{id:'note',name:'Записка',type:'text',initial:'чай и мята'},{id:'yes',name:'Разрешено',type:'boolean',initial:false}];
const img=(id,colour)=>({id,name:id,category:'prop',mime:'image/png',source:`data:image/png;base64,${solidPng(64,64,colour).toString('base64')}`});p.resources=[img('coin-image',[230,40,50,255]),img('door-image',[40,80,220,255])];
s.images=[{id:'coins',name:'Монеты',resourceId:'coin-image',x:25,y:70,width:20,height:25,zOrder:30,interactions:[{id:'take',label:'Взять монеты',once:true,hideAfter:true,text:'Монеты взяты.',condition:{kind:'all',conditions:[{variableId:'note',operator:'contains',value:'мята'},{kind:'any',conditions:[{flagId:'touched',value:false},{itemId:'token',value:1}]}]},effects:[{kind:'inventory',itemId:'coin',operation:'add',quantity:2},{variableId:'love',operation:'add',value:10},{variableId:'score',operation:'add',value:2},{kind:'flag',flagId:'touched',value:true},{kind:'flag',flagId:'keep',value:'false'},{variableId:'yes',operation:'set',value:true}]}]},
 {id:'door',name:'Дверь',resourceId:'door-image',x:75,y:85,width:40,height:70,zOrder:40,interactions:[{id:'unlock',label:'Открыть',text:'Дверь открыта.',once:true,condition:{kind:'all',conditions:[{itemId:'coin',value:2,operator:'gte'},{flagId:'touched',value:false,negate:true},{variableId:'score',operator:'eq',value:2}]},effects:[{kind:'flag',flagId:'open',value:true},{kind:'inventory',itemId:'token',operation:'add',quantity:1}]}]}];
s.actions=[{id:'before',type:'narration',text:'before'},{id:'explore',type:'explore',prompt:'Найдите монеты и откройте дверь',condition:{kind:'all',conditions:[{flagId:'open',value:true},{itemId:'coin',operator:'gte',value:2},{variableId:'love',operator:'eq',value:3}]}},{id:'choice',type:'choice',prompt:'Оплатить проход?',options:[
 {id:'hidden',text:'Скрытый вариант',targetSceneId:'lose',condition:{kind:'any',conditions:[{variableId:'score',operator:'gt',value:100},{itemId:'token',operator:'gte',value:2}]},effects:[]},
 {id:'pay',text:'Отдать монету',targetSceneId:'check',condition:{kind:'all',conditions:[{itemId:'coin',operator:'gte',value:2},{itemId:'token',value:1},{variableId:'yes',value:true}]},effects:[{kind:'inventory',itemId:'coin',operation:'remove',quantity:1},{kind:'flag',flagId:'touched',value:'false'},{kind:'flag',flagId:'keep',value:true},{variableId:'note',operation:'set',value:'Передано'}]}]}];
const scene=(id,actions)=>({id,title:id,characters:[],images:[],actions});p.scenes.check=scene('check',[{id:'branch',type:'condition',condition:{kind:'all',conditions:[{itemId:'coin',operator:'eq',value:1},{flagId:'touched',value:false},{flagId:'keep',value:true},{variableId:'note',operator:'contains',value:'Передано'}]},trueSceneId:'win',falseSceneId:'lose'}]);p.scenes.win=scene('win',[{id:'win-text',type:'narration',text:'win'},{id:'end',type:'end'}]);p.scenes.lose=scene('lose',[{id:'lose-text',type:'narration',text:'lose'},{id:'end',type:'end'}]);
const checked=validateProject(p);if(!checked.valid)throw Error(JSON.stringify(checked.issues));
await fs.writeFile(path.join(root,'fixture.vnproject'),JSON.stringify(p));await compileProject(p,path.join(root,'project'),{sdkPath:path.resolve('../renpy-8.5.3-sdk'),assetsRoot:path.resolve('public')});
const header=await fs.readFile('tests/fixtures/character-animation-checks.rpy','utf8'),fixture=path.join(root,'testcases.rpy');
await fs.writeFile(fixture,header+`
testcase compound_conditions_inventory_and_multiple_results:
    run Start("scene_rules")
    advance until screen "istoriya_explore"
    assert not eval _istoriya_explore_ready("", "", _istoriya_key("rules", "explore"))
    assert eval len(_istoriya_reactions("rules", "door")) == 0
    click pos (350, 414)
    advance until eval (_last_say_what or "") == "Монеты взяты."
    assert eval istoriya_inventory.get("coin", 0) == 2
    assert eval v_love == 3 and v_score == 2 and v_yes is True
    assert eval flag_touched is True and flag_keep is False
    run FileSave("rules-taken", confirm=False, page="qa")
    assert eval FileLoadable("rules-taken", page="qa")
    advance until screen "istoriya_explore"
    assert eval len(_istoriya_reactions("rules", "door")) == 1
    click pos (960, 350)
    advance until eval (_last_say_what or "") == "Дверь открыта."
    assert eval flag_open is True and istoriya_inventory.get("token", 0) == 1
    advance until screen "istoriya_explore"
    assert eval _istoriya_explore_ready("", "", _istoriya_key("rules", "explore"))
    click "Продолжить"
    assert screen "choice"
    assert not "Скрытый вариант"
    run FileSave("rules-choice", confirm=False, page="qa")
    click "Отдать монету"
    advance until eval (_last_say_what or "") == "win"
    assert eval istoriya_inventory["coin"] == 1 and flag_touched is False and flag_keep is True
    assert eval v_note == "Передано"
    run Rollback()
    assert screen "choice"
    assert eval istoriya_inventory["coin"] == 2 and flag_touched is True and flag_keep is False
    run FileLoad("rules-taken", confirm=False, page="qa")
    assert eval (_last_say_what or "") == "Монеты взяты."
    assert eval istoriya_inventory["coin"] == 2 and v_love == 3
    assert eval flag_open is False and istoriya_inventory.get("token", 0) == 0
`);
await fs.writeFile('.artifacts/game-logic-location.json',JSON.stringify({root,project:path.join(root,'fixture.vnproject'),fixture},null,2));console.log(`Game logic fixture: ${root}`);
const child=spawn(process.execPath,['scripts/test-tea-runtime.mjs','--isolated-desktop','--source',path.join(root,'project'),'--fixture',fixture,'--qa-root',root],{stdio:'inherit',windowsHide:true});process.exitCode=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});
