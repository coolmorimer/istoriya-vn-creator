import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {ASSET_FIELDS} from '../runtime/asset-fields.mjs';
import {compilerInternals} from '../runtime/compiler.mjs';
import {validateProject} from '../src/domain/validator.js';
const json=async file=>JSON.parse((await fs.readFile(file,'utf8')).replace(/^\uFEFF/,''));
const metadata=await json('.artifacts/native-ui-qa-location.json'),processResult=await json(path.join(metadata.run,'process-result.json'));
assert.equal(processResult.ExitCode,0);assert.equal(processResult.TimedOut,false);
const {profile,marker}=await json(path.join(metadata.root,'ui-profile.json')),base=await fs.realpath(profile),root=await fs.realpath(metadata.root);
assert.equal(path.dirname(base),root);assert.equal(path.basename(base),marker);assert.ok(marker.startsWith('ui-profile-'));
const workspace=await json(path.join(base,'workspace/workspace.json')),p=JSON.parse(workspace.values['istoriya-project-v2']),library=JSON.parse(workspace.values['istoriya-project-library-v1']),build=await json(path.join(root,'ui-build-result.json'));
assert.equal(library.length,1);assert.equal(p.schemaVersion,6);assert.equal(p.meta.title,'Предметы и действия — QA');assert.equal(workspace.values['istoriya-project-recovery-v1'],undefined);assert.equal(build.projectId,p.id);assert.equal(build.isolatedQa,true);
const s=Object.values(p.scenes)[0],key=s.images.find(l=>l.name==='Латунный ключ'),door=s.images.find(l=>l.name==='Дверь'),seal=s.images.find(l=>l.name==='Печать'),item=p.items[0].id;
assert.equal(s.images.length,3);assert.equal(p.resources.length,5);assert.equal(p.items.length,1);assert.deepEqual(s.actions.map(a=>a.type),['explore','narration']);
assert.equal(key.interactions[0].voiceVolume,.35);assert.equal(door.interactions[0].inventory.itemId,item);assert.equal(door.interactions[0].inventory.operation,'remove');assert.equal(seal.interactions[0].requiredItemId,item);assert.equal(seal.interactions[0].inventory,null);assert.equal(seal.interactions[0].once,true);assert.equal(s.actions[1].soundVolume,0);
let media=0;const hashes=[];
async function embed(value,field=''){
 if(Array.isArray(value))return Promise.all(value.map(v=>embed(v)));
 if(value&&typeof value==='object')return Object.fromEntries(await Promise.all(Object.entries(value).map(async([k,v])=>[k,await embed(v,k)])));
 if(ASSET_FIELDS.has(field)&&typeof value==='string'&&value.startsWith('file:')){
  const file=await fs.realpath(fileURLToPath(value)),relative=path.relative(base,file);assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));
  const mime=({'.png':'image/png','.wav':'audio/wav'})[path.extname(file).toLowerCase()];assert.ok(mime);const bytes=await fs.readFile(file);media++;hashes.push(createHash('sha256').update(bytes).digest('hex'));return `data:${mime};base64,${bytes.toString('base64')}`;
 }
 return value;
}
const portable=await embed(p);assert.equal(media,5);assert.equal(validateProject(portable).valid,true);
const output=path.resolve('.artifacts/native-0218-inventory');await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'authored.vnproject'),JSON.stringify(portable));
const header=(await fs.readFile('tests/fixtures/character-animation-checks.rpy','utf8')).split('testcase ')[0],q=JSON.stringify,scene=q(s.id),inventory=q(item),sceneLabel=q(compilerInternals.asciiId(s.id,'scene'));
const testcase=`testcase native_inventory_reuse_consume_voice_sfx_save_load_rollback:
    run Start(${sceneLabel})
    pause 0.1 until screen "istoriya_explore"
    assert eval istoriya_inventory.get(${inventory}, 0) == 0
    assert eval _istoriya_inventory_targets(${scene}, ${inventory}) == []
    click pos (350, 414)
    advance until eval (_last_say_what or "") == "Ключ взят."
    assert eval istoriya_inventory.get(${inventory}, 0) == 1
    assert eval (renpy.music.get_playing(channel="voice") or "").startswith("<volume 0.35>")
    assert eval renpy.music.get_playing(channel="sound") is not None
    advance until screen "istoriya_explore"
    click "Инвентарь"
    pause 0.1
    click "Применить: Латунный ключ"
    assert eval len(_istoriya_inventory_targets(${scene}, ${inventory})) == 2
    screenshot "native-inventory-targets.png"
    click "Печать — Показать ключ"
    advance until eval (_last_say_what or "") == "Печать узнала ключ."
    assert not screen "istoriya_inventory_screen"
    assert eval istoriya_inventory.get(${inventory}, 0) == 1
    assert eval renpy.music.get_playing(channel="voice") is not None
    advance until screen "istoriya_explore"
    assert eval len(_istoriya_inventory_targets(${scene}, ${inventory})) == 1
    run FileSave("inventory-before-use", confirm=False, page="qa")
    assert eval FileLoadable("inventory-before-use", page="qa")
    click "Инвентарь"
    pause 0.1
    click "Применить: Латунный ключ"
    click "Дверь — Открыть ключом"
    advance until eval (_last_say_what or "") == "Дверь открыта."
    assert eval istoriya_inventory.get(${inventory}, 0) == 0
    assert eval _istoriya_inventory_targets(${scene}, ${inventory}) == []
    run FileLoad("inventory-before-use", confirm=False, page="qa")
    pause 0.1
    assert screen "istoriya_explore"
    assert eval istoriya_inventory.get(${inventory}, 0) == 1
    assert eval len(_istoriya_inventory_targets(${scene}, ${inventory})) == 1
    click "Инвентарь"
    pause 0.1
    click "Применить: Латунный ключ"
    click "Дверь — Открыть ключом"
    advance until eval (_last_say_what or "") == "Дверь открыта."
    run Rollback()
    pause 0.1
    assert screen "istoriya_explore"
    assert eval istoriya_inventory.get(${inventory}, 0) == 1
    assert eval len(_istoriya_inventory_targets(${scene}, ${inventory})) == 1
    click "Продолжить"
    advance until eval (_last_say_what or "") == "Готово."
    assert eval renpy.music.get_playing(channel="sound") is not None
`;
await fs.writeFile(path.join(output,'testcases.rpy'),header+testcase);
const result={passed:true,createdWithoutProjectImport:true,nativeAuthoring:true,inventoryTargets:true,reusableAndConsumable:true,nativeReopen:true,media,hashes,metadata,processResult,build,projectPath:path.join(output,'authored.vnproject'),fixturePath:path.join(output,'testcases.rpy')};await fs.writeFile(path.join(output,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
