import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {ASSET_FIELDS} from '../runtime/asset-fields.mjs';
import {validateProject} from '../src/domain/validator.js';
const json=async file=>JSON.parse((await fs.readFile(file,'utf8')).replace(/^\uFEFF/,''));
const metadata=await json('.artifacts/native-ui-qa-location.json'),processResult=await json(path.join(metadata.run,'process-result.json'));
assert.equal(processResult.ExitCode,0);assert.equal(processResult.TimedOut,false);
const {profile,marker}=await json(path.join(metadata.root,'ui-profile.json')),base=await fs.realpath(profile),root=await fs.realpath(metadata.root);
assert.equal(path.dirname(base),root);assert.equal(path.basename(base),marker);assert.ok(marker.startsWith('ui-profile-'));
const workspace=await json(path.join(base,'workspace/workspace.json')),p=JSON.parse(workspace.values['istoriya-project-v2']),library=JSON.parse(workspace.values['istoriya-project-library-v1']);
assert.equal(library.length,1);assert.equal(p.meta.title,'Ключ и дверь — с нуля QA');assert.equal(p.schemaVersion,6);assert.equal(p.resources.length,4);assert.equal(p.items.length,1);assert.equal(workspace.values['istoriya-project-recovery-v1'],undefined);
const s=Object.values(p.scenes)[0],key=s.images.find(l=>l.name==='Латунный ключ'),door=s.images.find(l=>l.name==='Дверь'),take=key.interactions[0],unlock=door.interactions[0],item=p.items[0].id;
assert.equal(s.actions.length,2);assert.equal(s.actions[0].type,'explore');assert.equal(s.actions[1].type,'narration');assert.equal(take.inventory.itemId,item);assert.equal(unlock.inventory.itemId,item);assert.equal(unlock.inventory.operation,'remove');assert.equal(take.voiceVolume,.35);assert.equal(take.soundVolume,.6);assert.equal(take.once,true);assert.equal(take.hideAfter,true);assert.equal(unlock.once,true);assert.equal(unlock.hideAfter,false);assert.ok(take.voiceAssetId&&take.soundAssetId);assert.equal(s.actions[1].voiceAssetId,take.voiceAssetId);
let media=0;async function embed(value,field=''){
 if(Array.isArray(value))return Promise.all(value.map(v=>embed(v)));
 if(value&&typeof value==='object')return Object.fromEntries(await Promise.all(Object.entries(value).map(async([k,v])=>[k,await embed(v,k)])));
 if(ASSET_FIELDS.has(field)&&typeof value==='string'&&value.startsWith('file:')){
  const file=await fs.realpath(fileURLToPath(value)),relative=path.relative(base,file);assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));
  const mime=({'.png':'image/png','.wav':'audio/wav','.ogg':'audio/ogg','.mp3':'audio/mpeg'})[path.extname(file).toLowerCase()];assert.ok(mime);media++;return `data:${mime};base64,${(await fs.readFile(file)).toString('base64')}`;
 }
 return value;
}
const portable=await embed(p);assert.equal(media,4);assert.equal(validateProject(portable).valid,true);
const outputIndex=process.argv.indexOf('--output');
const output=path.resolve(outputIndex>=0?process.argv[outputIndex+1]:'.artifacts/native-0214-props');await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'authored.vnproject'),JSON.stringify(portable));
const header=(await fs.readFile('tests/fixtures/character-animation-checks.rpy','utf8')).split('testcase ')[0];
const q=JSON.stringify,tag=`image_${key.id}`;
const testcase=`testcase native_authored_prop_inventory_audio_save_load_rollback:
    run Start(${q(`scene_${s.id}`)})
    pause 0.1 until screen "istoriya_explore"
    assert eval istoriya_inventory.get(${q(item)}, 0) == 0
    assert not eval _istoriya_allowed(${q(s.id)}, ${q(door.id)}, ${q(unlock.id)})
    click pos (320, 414)
    pause 0.1
    assert screen "istoriya_explore"
    click pos (350, 414)
    advance until eval (_last_say_what or "") == "Ключ взят."
    assert eval istoriya_inventory.get(${q(item)}, 0) == 1
    assert not eval renpy.showing(${q(tag)})
    assert eval (renpy.music.get_playing(channel="voice") or "").startswith("<volume 0.35>")
    assert eval renpy.music.get_playing(channel="sound") is not None
    run FileSave("taken", confirm=False, page="qa")
    assert eval FileLoadable("taken", page="qa")
    advance until screen "istoriya_explore"
    click "Инвентарь"
    assert screen "istoriya_inventory_screen"
    pause 0.1
    assert eval renpy.get_widget("istoriya_inventory_screen", ${q(`inventory_${item}`)}).text == ["Латунный ключ × 1"]
    click "Закрыть"
    click pos (960, 350)
    advance until eval (_last_say_what or "") == "Дверь открыта."
    assert eval istoriya_inventory.get(${q(item)}, 0) == 0
    run FileLoad("taken", confirm=False, page="qa")
    assert eval (_last_say_what or "") == "Ключ взят."
    assert eval istoriya_inventory.get(${q(item)}, 0) == 1
    assert not eval renpy.showing(${q(tag)})
    advance until screen "istoriya_explore"
    click pos (960, 350)
    advance until eval (_last_say_what or "") == "Дверь открыта."
    advance until screen "istoriya_explore"
    assert not eval _istoriya_allowed(${q(s.id)}, ${q(door.id)}, ${q(unlock.id)})
    click "Продолжить"
    advance until eval (_last_say_what or "") == "after"
    assert eval renpy.music.get_playing(channel="voice") is not None
    run Rollback()
    assert screen "istoriya_explore"
    run Rollback()
    assert eval (_last_say_what or "") == "Дверь открыта."
    run Rollback()
    assert screen "istoriya_explore"
    assert eval istoriya_inventory.get(${q(item)}, 0) == 1
    assert eval _istoriya_allowed(${q(s.id)}, ${q(door.id)}, ${q(unlock.id)})
`;
await fs.writeFile(path.join(output,'testcases.rpy'),header+testcase);
const result={passed:true,createdWithoutProjectImport:true,nativeAuthoring:true,media,metadata,processResult,projectPath:path.join(output,'authored.vnproject'),fixturePath:path.join(output,'testcases.rpy')};await fs.writeFile(path.join(output,'result.json'),JSON.stringify(result,null,2));console.log(result);
