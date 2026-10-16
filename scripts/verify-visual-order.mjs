import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createProject} from '../src/domain/projectFactory.js';
import {compileProject} from '../runtime/compiler.mjs';
import {solidPng,pngPixels} from './qa-png.mjs';
import {createQaDirectory} from './qa-directory.mjs';
const root=await createQaDirectory('visual-order-');
const p=createProject({title:'Проверка порядка слоёв',resolution:{width:1280,height:720}}),s=Object.values(p.scenes)[0];
delete p.scenes[s.id];s.id='layers';p.scenes[s.id]=s;p.chapters[0].scenes=[s.id];p.ui.textStyle={speed:0};
const colours={bg:[20,60,80,255],hero:[30,80,230,255],prop:[230,40,50,255],hidden:[250,240,0,255],cg:[40,220,80,255]};
p.resources=Object.entries(colours).map(([id,colour])=>({id,name:`QA ${id}`,category:id==='bg'?'background':id==='cg'?'cg':'prop',mime:'image/png',source:`data:image/png;base64,${solidPng(id==='cg'?96:64,64,colour).toString('base64')}`}));
p.characters=[{id:'hero',name:'QA герой',sprites:[{id:'main',name:'Основной',resourceId:'hero'}],defaultSpriteId:'main'}];
s.backgroundResourceId='bg';s.characters=[{id:'actor',characterId:'hero',x:50,y:100,zOrder:10}];
s.images=[{id:'equal',resourceId:'prop',x:50,y:100,width:34,height:88,zOrder:10},{id:'negative',resourceId:'hidden',x:20,y:50,width:20,height:20,zOrder:-150}];
s.actions=[{id:'initial',type:'narration',text:'initial'},
 {id:'show-low',type:'showCharacter',characterId:'hero',zOrder:-50,transition:'none'},{id:'low',type:'narration',text:'low'},
 {id:'show-high',type:'showCharacter',characterId:'hero',zOrder:10,transition:'none'},{id:'high',type:'narration',text:'high'},
 {id:'cg',type:'showCG',assetId:'cg',transition:'none'},{id:'cg-text',type:'narration',text:'cg'},
 {id:'keep',type:'background',assetId:'bg',preserveCharacters:true,transition:'none'},{id:'kept',type:'narration',text:'kept'},
 {id:'hide-cg',type:'hideCG',transition:'none'},{id:'hidden-text',type:'narration',text:'hidden'},
 {id:'cg2',type:'showCG',assetId:'cg',transition:'none'},{id:'clear',type:'background',assetId:'bg',transition:'none'},{id:'clear-text',type:'narration',text:'clear'},
 {id:'cg3',type:'showCG',assetId:'cg',transition:'none'},{id:'jump',type:'jump',targetSceneId:'next'}];
p.scenes.next={...structuredClone(s),id:'next',title:'Следующая',characters:[],images:[],actions:[{id:'next-text',type:'narration',text:'next'},{id:'end',type:'end'}]};p.chapters[0].scenes.push('next');
await fs.writeFile(path.join(root,'fixture.vnproject'),JSON.stringify(p));
await compileProject(p,path.join(root,'project'),{sdkPath:path.resolve('../renpy-8.5.3-sdk'),assetsRoot:path.resolve('public')});
const header=await fs.readFile('tests/fixtures/character-animation-checks.rpy','utf8');
const cases=`
testcase visual_layers_cg_and_restore:
    run Start("scene_layers")
    advance until eval (_last_say_what or "") == "initial"
    assert eval renpy.get_zorder_list("master") == [("image_negative", -150), ("istoriya_scene_bg", -100), ("actor_hero", 10), ("image_equal", 10)]
    screenshot "layers-initial.png"
    advance until eval (_last_say_what or "") == "low"
    assert eval dict(renpy.get_zorder_list("master"))["actor_hero"] == -50
    advance until eval (_last_say_what or "") == "high"
    assert eval renpy.get_zorder_list("master")[-1] == ("actor_hero", 10)
    screenshot "layers-high.png"
    advance until eval (_last_say_what or "") == "cg"
    assert eval renpy.showing("istoriya_cg", layer="istoriya_cg_layer")
    assert eval config.layers.index("master") < config.layers.index("istoriya_cg_layer") < config.layers.index("screens")
    assert eval renpy.get_image_bounds("istoriya_cg", layer="istoriya_cg_layer") == (100.0, 0.0, 1080, 720)
    screenshot "layers-cg.png"
    run FileSave("layers", confirm=False, page="qa")
    assert eval FileLoadable("layers", page="qa")
    advance until eval (_last_say_what or "") == "kept"
    assert eval renpy.showing("istoriya_cg", layer="istoriya_cg_layer")
    advance until eval (_last_say_what or "") == "hidden"
    assert not eval renpy.showing("istoriya_cg", layer="istoriya_cg_layer")
    run FileLoad("layers", confirm=False, page="qa")
    assert eval renpy.showing("istoriya_cg", layer="istoriya_cg_layer")
    assert eval (_last_say_what or "") == "cg"
    advance until eval (_last_say_what or "") == "clear"
    assert not eval renpy.showing("istoriya_cg", layer="istoriya_cg_layer")
    assert not eval renpy.showing("actor_hero")
    assert eval renpy.showing("image_equal")
    advance until eval (_last_say_what or "") == "next"
    assert not eval renpy.showing("istoriya_cg", layer="istoriya_cg_layer")
    run Rollback()
    assert eval (_last_say_what or "") == "clear"
    assert not eval renpy.showing("istoriya_cg", layer="istoriya_cg_layer")
`;
const fixture=path.join(root,'testcases.rpy');await fs.writeFile(fixture,header+cases);
const child=spawn(process.execPath,['scripts/test-tea-runtime.mjs','--isolated-desktop','--source',path.join(root,'project'),'--fixture',fixture,'--qa-root',root],{windowsHide:true});
let output='';child.stdout.on('data',chunk=>{output+=chunk;process.stdout.write(chunk);});child.stderr.pipe(process.stderr);
const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});
if(code!==0)process.exit(code??1);
const qa=output.match(/Runtime QA: (.+)/)?.[1].trim();assert.ok(qa);
async function find(directory,name) {for(const item of await fs.readdir(directory,{withFileTypes:true})){const file=path.join(directory,item.name);if(item.isDirectory()){const found=await find(file,name);if(found)return found;}else if(item.name===name)return file;}}
const pixels=[];
for(const [name,expected] of [['layers-initial.png',colours.prop],['layers-high.png',colours.hero],['layers-cg.png',colours.cg]]) {
 const file=await find(qa,name);assert.ok(file,`missing ${name}`);const image=pngPixels(await fs.readFile(file));
 const actual=image.pixel(image.width*.5,image.height*.55),behind=image.pixel(image.width*.2,image.height*.4);
 assert.deepEqual(actual,expected.slice(0,3),`${name} visible top layer`);
 if(name!=='layers-cg.png')assert.deepEqual(behind,colours.bg.slice(0,3),'negative layer stays below opaque background');
 pixels.push({name,actual,behind,width:image.width,height:image.height});
}
await fs.writeFile(path.join(root,'result.json'),JSON.stringify({passed:true,runtimeResult:path.join(qa,'result.json'),pixels},null,2));
console.log(`Visual ordering and screenshot pixels passed: ${root}`);
