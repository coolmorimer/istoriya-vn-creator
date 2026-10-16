import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {createProject} from '../src/domain/projectFactory.js';
import {compileProject} from '../runtime/compiler.mjs';
import {solidPng} from './qa-png.mjs';
import {validateProject} from '../src/domain/validator.js';
const qaRootIndex=process.argv.indexOf('--qa-root');
const base=qaRootIndex<0?path.join(process.env.LOCALAPPDATA??os.tmpdir(),'IstoriyaQA'):path.resolve(process.argv[qaRootIndex+1]);await fs.mkdir(base,{recursive:true});
const root=await fs.mkdtemp(path.join(base,'prop-runtime-'));
const p=createProject({title:'Ключ и дверь — QA',resolution:{width:1280,height:720}}),s=Object.values(p.scenes)[0];delete p.scenes[s.id];s.id='props';p.scenes.props=s;p.chapters[0].scenes=[s.id];p.ui.textStyle={speed:0};
function wave(frequency) {const rate=24000,seconds=4,count=rate*seconds,data=Buffer.alloc(44+count*2);data.write('RIFF');data.writeUInt32LE(data.length-8,4);data.write('WAVEfmt ',8);data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(1,22);data.writeUInt32LE(rate,24);data.writeUInt32LE(rate*2,28);data.writeUInt16LE(2,32);data.writeUInt16LE(16,34);data.write('data',36);data.writeUInt32LE(count*2,40);for(let i=0;i<count;i++)data.writeInt16LE(Math.round(Math.sin(2*Math.PI*frequency*i/rate)*3000),44+i*2);return data;}
const image=(id,colour)=>({id,name:id,category:'prop',mime:'image/png',source:`data:image/png;base64,${solidPng(64,64,colour).toString('base64')}`});
p.resources=[image('key-image',(x,y)=>x>=24&&x<40&&y>=24&&y<40?[0,0,0,0]:[230,40,50,255]),image('closed',[30,80,230,255]),image('opened',[40,220,80,255]),image('bg',[20,60,80,255]),{id:'click',name:'QA tone',category:'sound',mime:'audio/wav',source:`data:audio/wav;base64,${wave(350).toString('base64')}`},{id:'voice',name:'QA voice channel tone — not speech',category:'voice',mime:'audio/wav',source:`data:audio/wav;base64,${wave(550).toString('base64')}`}];
if(process.argv.includes('--legacy-audio'))for(const resource of p.resources.filter(r=>['sound','voice'].includes(r.category)))delete resource.mime;
p.items=[{id:'key-item',name:'Латунный ключ',description:'Открывает дверь.',iconResourceId:'key-image'}];p.flags=[{id:'open',name:'Дверь открыта',initial:false}];
s.backgroundResourceId='bg';s.images=[
 {id:'key',name:'Ключ',resourceId:'key-image',x:25,y:70,width:20,height:25,zOrder:30,interactions:[{id:'look',label:'Осмотреть',text:'Латунный ключ.',once:true},{id:'take',label:'Взять',text:'Ключ взят.',once:true,hideAfter:true,soundAssetId:'click',soundVolume:.6,voiceAssetId:'voice',voiceVolume:.35,inventory:{operation:'add',itemId:'key-item',quantity:1}}]},
 {id:'door',name:'Дверь',resourceId:'closed',x:75,y:85,width:40,height:70,zOrder:40,interactions:[{id:'unlock',label:'Открыть ключом',text:'Дверь открыта.',once:true,requiredItemId:'key-item',inventory:{operation:'remove',itemId:'key-item',quantity:1},effects:[{kind:'flag',flagId:'open',value:true}],resultResourceId:'opened',soundAssetId:'click'}]},
];
s.actions=[{id:'before',type:'narration',text:'before'},{id:'explore',type:'explore',prompt:'Найдите ключ и откройте дверь',requiredFlagId:'open'},{id:'after',type:'narration',text:'after',voiceAssetId:'voice',soundAssetId:'click'},{id:'end',type:'end'}];
p.scenes.audio={id:'audio',title:'Аудиоканалы',characters:[],images:[],actions:[{id:'music',type:'music',assetId:'click',volume:.5,loop:true},{id:'ambience',type:'ambience',assetId:'click',volume:.2},{id:'sound',type:'sound',assetId:'click',volume:.6,loop:true},{id:'line',type:'narration',text:'audio-before',voiceAssetId:'voice',voiceVolume:.35},{id:'stop',type:'stopAudio',channel:'sound',fadeOut:0},{id:'stopped',type:'narration',text:'audio-sound-stopped'},{id:'stop-ambience',type:'stopAudio',channel:'ambience',fadeOut:0},{id:'stop-music',type:'stopAudio',channel:'music',fadeOut:0},{id:'silent',type:'narration',text:'audio-silent'},{id:'end',type:'end'}]};p.chapters[0].scenes.push('audio');
p.scenes['voice-only']={id:'voice-only',title:'Ответ без субтитров',characters:[],images:[{id:'bell',name:'Колокол',resourceId:'key-image',x:50,y:70,width:20,height:25,interactions:[{id:'listen',label:'Послушать',text:'',voiceAssetId:'voice',voiceVolume:.35,targetSceneId:'voice-destination'}]}],actions:[{id:'listen',type:'explore',prompt:'Послушайте ответ'},{id:'end',type:'end'}]};
p.scenes['voice-destination']={id:'voice-destination',title:'После записи',characters:[],images:[],actions:[{id:'after-voice',type:'narration',text:'voice-finished'},{id:'end',type:'end'}]};p.chapters[0].scenes.push('voice-only','voice-destination');
const inventoryScene=structuredClone(s);inventoryScene.id='inventory-use';inventoryScene.title='Применение из инвентаря';
inventoryScene.actions=[{id:'explore',type:'explore',prompt:'Примените ключ из инвентаря'},{id:'end',type:'end'}];
inventoryScene.images.push({id:'seal',name:'Печать',resourceId:'opened',x:50,y:70,width:20,height:25,interactions:[{id:'recognize',label:'Показать ключ',requiredItemId:'key-item',text:'Печать узнала ключ.',once:true,voiceAssetId:'voice',voiceVolume:.35,soundAssetId:'click'}]});
p.scenes[inventoryScene.id]=inventoryScene;p.chapters[0].scenes.push(inventoryScene.id);
const validation=validateProject(p);if(!validation.valid)throw Error(JSON.stringify(validation.issues.filter(i=>i.severity==='error')));
await fs.writeFile(path.join(root,'fixture.vnproject'),JSON.stringify(p));await fs.mkdir('.artifacts',{recursive:true});await fs.writeFile('.artifacts/prop-runtime-location.json',JSON.stringify({root,project:path.join(root,'fixture.vnproject')},null,2));
await compileProject(p,path.join(root,'project'),{sdkPath:path.resolve('../renpy-8.5.3-sdk'),assetsRoot:path.resolve('public')});
const header=await fs.readFile('tests/fixtures/character-animation-checks.rpy','utf8');
const cases=`
testcase inventory_targets_reuse_consume_save_load_rollback:
    run Start("scene_inventory_use")
    advance until screen "istoriya_explore"
    assert eval _istoriya_inventory_targets("inventory-use", "key-item") == []
    click pos (350, 414)
    pause 0.1
    click "Взять"
    advance until eval (_last_say_what or "") == "Ключ взят."
    advance until screen "istoriya_explore"
    click "Инвентарь"
    pause 0.1
    click "Применить: Латунный ключ"
    assert eval len(_istoriya_inventory_targets("inventory-use", "key-item")) == 2
    screenshot "inventory-targets.png"
    click "Печать — Показать ключ"
    advance until eval (_last_say_what or "") == "Печать узнала ключ."
    assert not screen "istoriya_inventory_screen"
    assert eval istoriya_inventory.get("key-item", 0) == 1
    assert eval (renpy.music.get_playing(channel="voice") or "").startswith("<volume 0.35>")
    advance until screen "istoriya_explore"
    assert eval len(_istoriya_inventory_targets("inventory-use", "key-item")) == 1
    run FileSave("inventory-target", confirm=False, page="qa")
    click "Инвентарь"
    pause 0.1
    click "Применить: Латунный ключ"
    click "Дверь — Открыть ключом"
    advance until eval (_last_say_what or "") == "Дверь открыта."
    assert eval istoriya_inventory.get("key-item", 0) == 0
    assert eval flag_open is True
    assert eval _istoriya_inventory_targets("inventory-use", "key-item") == []
    run FileLoad("inventory-target", confirm=False, page="qa")
    pause 0.1
    assert screen "istoriya_explore"
    assert eval istoriya_inventory.get("key-item", 0) == 1
    assert eval flag_open is False
    assert eval len(_istoriya_inventory_targets("inventory-use", "key-item")) == 1
    click "Инвентарь"
    pause 0.1
    click "Применить: Латунный ключ"
    click "Дверь — Открыть ключом"
    advance until eval (_last_say_what or "") == "Дверь открыта."
    run Rollback()
    pause 0.1
    assert screen "istoriya_explore"
    assert eval istoriya_inventory.get("key-item", 0) == 1
    assert eval flag_open is False
    assert eval len(_istoriya_inventory_targets("inventory-use", "key-item")) == 1

testcase props_inventory_sound_voice_save_load_rollback:
    run Start("scene_props")
    advance until eval (_last_say_what or "") == "before"
    assert eval renpy.get_zorder_list("master") == [("istoriya_scene_bg", -100), ("image_key", 30), ("image_door", 40)]
    advance until screen "istoriya_explore"
    assert not eval _istoriya_explore_ready("", "open")
    screenshot "props-before.png"
    click pos (320, 414)
    pause 0.1
    assert screen "istoriya_explore"
    assert not screen "istoriya_prop_verbs"
    click pos (350, 414)
    pause 0.1
    assert screen "istoriya_prop_verbs"
    click "Осмотреть"
    advance until eval (_last_say_what or "") == "Латунный ключ."
    assert eval istoriya_inventory.get("key-item", 0) == 0
    advance until screen "istoriya_explore"
    click pos (350, 414)
    advance until eval (_last_say_what or "") == "Ключ взят."
    assert eval istoriya_inventory.get("key-item", 0) == 1
    assert not eval renpy.showing("image_key")
    assert eval "click" in (renpy.music.get_playing(channel="sound") or "")
    assert eval "voice" in (renpy.music.get_playing(channel="voice") or "")
    assert eval (renpy.music.get_playing(channel="voice") or "").startswith("<volume 0.35>")
    run FileSave("props-taken", confirm=False, page="qa")
    assert eval FileLoadable("props-taken", page="qa")
    advance until screen "istoriya_explore"
    click "Инвентарь"
    assert screen "istoriya_inventory_screen"
    pause 0.1
    assert eval renpy.get_widget("istoriya_inventory_screen", "inventory_key-item").text == ["Латунный ключ × 1"]
    click "Закрыть"
    click pos (960, 350)
    advance until eval (_last_say_what or "") == "Дверь открыта."
    assert eval istoriya_inventory.get("key-item", 0) == 0
    assert eval flag_open is True
    assert eval istoriya_prop_images[_istoriya_key("props", "door")] == "opened"
    run FileLoad("props-taken", confirm=False, page="qa")
    assert eval (_last_say_what or "") == "Ключ взят."
    assert eval istoriya_inventory.get("key-item", 0) == 1
    assert eval flag_open is False
    assert not eval renpy.showing("image_key")
    advance until screen "istoriya_explore"
    click pos (960, 350)
    advance until eval (_last_say_what or "") == "Дверь открыта."
    advance until screen "istoriya_explore"
    assert eval _istoriya_explore_ready("", "open")
    screenshot "props-opened.png"
    click "Продолжить"
    advance until eval (_last_say_what or "") == "after"
    assert eval "voice" in (renpy.music.get_playing(channel="voice") or "")
    run Rollback()
    assert screen "istoriya_explore"
    assert eval flag_open is True
    run Rollback()
    assert eval (_last_say_what or "") == "Дверь открыта."
    run Rollback()
    assert screen "istoriya_explore"
    assert eval istoriya_inventory.get("key-item", 0) == 1
    assert eval flag_open is False

testcase independent_audio_channels_and_volume:
    run Start("scene_audio")
    advance until eval (_last_say_what or "") == "audio-before"
    assert eval renpy.music.get_playing(channel="music") is not None
    assert eval renpy.music.get_playing(channel="ambience") is not None
    assert eval renpy.music.get_playing(channel="sound") is not None
    assert eval (renpy.music.get_playing(channel="voice") or "").startswith("<volume 0.35>")
    advance until eval (_last_say_what or "") == "audio-sound-stopped"
    pause 0.2
    assert eval renpy.music.get_playing(channel="sound") is None
    assert eval renpy.music.get_playing(channel="voice") is None
    assert eval renpy.music.get_playing(channel="music") is not None
    assert eval renpy.music.get_playing(channel="ambience") is not None
    advance until eval (_last_say_what or "") == "audio-silent"
    pause 0.2
    assert eval renpy.music.get_playing(channel="music") is None
    assert eval renpy.music.get_playing(channel="ambience") is None

testcase voice_only_reaction_waits_and_saves_before_transition:
    run Start("scene_voice_only")
    advance until screen "istoriya_explore"
    click pos (670, 414)
    advance until screen "say"
    pause 0.1
    assert not screen "istoriya_explore"
    assert eval (_last_say_what or "") == ""
    assert eval (renpy.music.get_playing(channel="voice") or "").startswith("<volume 0.35>")
    run FileSave("voice-only", confirm=False, page="qa")
    advance until eval (_last_say_what or "") == "voice-finished"
    run FileLoad("voice-only", confirm=False, page="qa")
    assert screen "say"
    assert eval (_last_say_what or "") == ""
    advance until eval (_last_say_what or "") == "voice-finished"
    pause 0.1
    assert eval renpy.music.get_playing(channel="voice") is None
`;
const fixture=path.join(root,'testcases.rpy');await fs.writeFile(fixture,header+cases);console.log(`Prop runtime fixture: ${root}`);
const child=spawn(process.execPath,['scripts/test-tea-runtime.mjs','--isolated-desktop','--source',path.join(root,'project'),'--fixture',fixture,'--qa-root',root],{stdio:'inherit',windowsHide:true});
process.exitCode=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});
