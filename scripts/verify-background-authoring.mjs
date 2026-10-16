import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createProject} from '../src/domain/projectFactory.js';
import {compileProject} from '../runtime/compiler.mjs';
import {authorBackground,backgroundTarget} from '../src/domain/backgroundAuthoring.js';
import {createQaDirectory} from './qa-directory.mjs';
const root=await createQaDirectory('background-runtime-'),p=createProject({title:'Проверка смены фона'}),s=Object.values(p.scenes)[0];
// Stable scene id makes the actual-runtime fixture independent of factory ids.
delete p.scenes[s.id];s.id='background_test';p.scenes[s.id]=s;p.chapters[0].scenes=[s.id];p.ui.textStyle={speed:0};
p.resources=[{id:'first',name:'Сияние',category:'background',mime:'image/png',source:path.resolve('public/assets/demo-aurora.png')},{id:'second',name:'Костёр',category:'background',mime:'image/png',source:path.resolve('public/assets/demo-campfire.png')},{id:'table',name:'Стол',category:'prop',mime:'image/png',source:path.resolve('examples/tea-with-goblins/assets/table.png')}];
p.characters=[{id:'hero',name:'Элира',sprites:[{id:'worried',name:'Тревога',source:path.resolve('examples/tea-with-goblins/assets/elira-worried.png')}]}];
s.characters=[{id:'hero-layer',characterId:'hero',spriteId:'worried',x:60,y:110,scale:130,rotation:12,opacity:70,flip:true}];s.images=[{id:'table',resourceId:'table',x:50,y:126,width:94,height:105,scale:100,opacity:100,zOrder:50}];
authorBackground(p,{...backgroundTarget(p,s.id),mode:'current',resourceId:'first',fit:'cover'},{resourceId:'unused',actionId:'unused'});
s.actions=[{id:'before',type:'narration',text:'before'}];
authorBackground(p,{...backgroundTarget(p,s.id,'before'),mode:'insert',resourceId:'second',fit:'cover',transition:'none',preserveCharacters:true},{resourceId:'unused',actionId:'keep'});
s.actions.push({id:'after',type:'narration',text:'keep'},{id:'old-clear',type:'background',assetId:'first',transition:'none'},{id:'clear',type:'narration',text:'clear'},{id:'end',type:'end'});
await compileProject(p,path.join(root,'project'),{sdkPath:path.resolve('../renpy-8.5.3-sdk'),assetsRoot:path.resolve('public')});
const header=await fs.readFile('tests/fixtures/character-animation-checks.rpy','utf8'),testcases=`
testcase background_keep_clear_restore:
    run Start("scene_background_test")
    advance until eval (_last_say_what or "") == "before"
    $ before_bounds = renpy.get_image_bounds("actor_hero")
    $ before_sources = _qa_image_sources("actor_hero")
    assert eval any("first" in source for source in _qa_image_sources("istoriya_scene_bg"))
    advance until eval (_last_say_what or "") == "keep"
    assert eval renpy.get_image_bounds("actor_hero") == before_bounds
    assert eval _qa_image_sources("actor_hero") == before_sources
    assert eval any("second" in source for source in _qa_image_sources("istoriya_scene_bg"))
    assert eval renpy.showing("image_table")
    run FileSave("background", confirm=False, page="qa")
    assert eval FileLoadable("background", page="qa")
    advance until eval (_last_say_what or "") == "clear"
    assert not eval renpy.showing("actor_hero")
    assert eval any("first" in source for source in _qa_image_sources("istoriya_scene_bg"))
    assert eval renpy.showing("image_table")
    run FileLoad("background", confirm=False, page="qa")
    assert eval renpy.get_image_bounds("actor_hero") == before_bounds
    assert eval any("second" in source for source in _qa_image_sources("istoriya_scene_bg"))
    screenshot "background-restored.png"
`;
const fixture=path.join(root,'testcases.rpy');await fs.writeFile(fixture,header+testcases);console.log(`Background fixture: ${root}`);
const child=spawn(process.execPath,['scripts/test-tea-runtime.mjs','--isolated-desktop','--source',path.join(root,'project'),'--fixture',fixture,'--qa-root',root],{stdio:'inherit',windowsHide:true});
process.exitCode=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});
