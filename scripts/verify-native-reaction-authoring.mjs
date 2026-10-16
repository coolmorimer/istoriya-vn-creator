import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {ASSET_FIELDS} from '../runtime/asset-fields.mjs';
import {compilerInternals} from '../runtime/compiler.mjs';
import {validateProject} from '../src/domain/validator.js';
const json=async file=>JSON.parse((await fs.readFile(file,'utf8')).replace(/^\uFEFF/,''));
const option=name=>{const index=process.argv.indexOf(name);return index<0?null:process.argv[index+1];};
const version=option('--version')??'0.2.20',projectTitle=option('--title')??'Мастерская взаимодействий — QA';
const metadata=await json('.artifacts/native-ui-qa-location.json'),processResult=await json(path.join(metadata.run,'process-result.json'));
assert.equal(processResult.ExitCode,0);assert.equal(processResult.TimedOut,false);
const {profile,marker}=await json(path.join(metadata.root,'ui-profile.json')),base=await fs.realpath(profile),root=await fs.realpath(metadata.root);
assert.equal(path.dirname(base),root);assert.equal(path.basename(base),marker);assert.ok(marker.startsWith('ui-profile-'));
let workspaceRoot=path.join(base,'workspace');const locatorFile=path.join(base,'profile-location.json');const hasLocator=await fs.access(locatorFile).then(()=>true,error=>{if(error.code==='ENOENT')return false;throw error;});
if(hasLocator){const locator=await json(locatorFile);assert.equal(locator.version,1);if(locator.active.kind==='custom'){const directory=await fs.realpath(locator.active.directory),destinations=await fs.realpath(path.join(root,'profile-destinations'));assert.equal(path.dirname(directory),destinations);assert.ok(path.basename(directory).startsWith('Istoriya-profile-'));const marker=await json(path.join(directory,'profile-marker.json'));assert.equal(marker.format,'istoriya-profile-1');assert.equal(marker.complete,true);assert.equal(marker.id,locator.active.id);workspaceRoot=path.join(directory,'data');}else assert.equal(locator.active.kind,'default');}
workspaceRoot=await fs.realpath(workspaceRoot);
const workspace=await json(path.join(workspaceRoot,'workspace.json')),p=JSON.parse(workspace.values['istoriya-project-v2']),library=JSON.parse(workspace.values['istoriya-project-library-v1']),built=await json(path.join(root,'ui-build-result.json'));
const authored=await json(option('--authored')??'.artifacts/reaction020-author-receipt.json'),played=await json(option('--played')??'.artifacts/reaction020-play-receipt.json');
assert.equal(library.length,1);assert.equal(p.meta.title,projectTitle);assert.equal(p.schemaVersion,6);assert.equal(p.id,authored.projectId);assert.equal(p.id,played.projectId);assert.equal(p.id,built.projectId);assert.equal(built.isolatedQa,true);assert.equal(workspace.values['istoriya-project-recovery-v1'],undefined);
const s=Object.values(p.scenes)[0],key=s.images.find(l=>l.name==='Латунный ключ'),door=s.images.find(l=>l.name==='Дверь'),seal=s.images.find(l=>l.name==='Печать'),item=p.items[0].id,hero=p.characters[0].id;
assert.equal(s.images.length,3);assert.equal(p.resources.length,4);assert.equal(p.characters.length,1);assert.equal(p.items.length,1);assert.deepEqual(s.actions.map(a=>a.type),['showCharacter','explore','narration']);assert.equal(s.actions[2].soundVolume,0);
for(const layer of [key,door,seal])assert.equal(layer.interactions[0].speakerId,hero);
assert.equal(key.interactions[0].voiceVolume,.35);assert.equal(key.interactions[0].soundVolume,.6);assert.equal(door.interactions[0].inventory.operation,'remove');assert.equal(door.interactions[0].inventory.itemId,item);assert.equal(seal.interactions[0].requiredItemId,item);assert.equal(seal.interactions[0].inventory,null);assert.equal(seal.interactions[0].once,true);
const hashes=[];async function embed(value,field=''){
 if(Array.isArray(value))return Promise.all(value.map(v=>embed(v)));
 if(value&&typeof value==='object')return Object.fromEntries(await Promise.all(Object.entries(value).map(async([k,v])=>[k,await embed(v,k)])));
 if(ASSET_FIELDS.has(field)&&typeof value==='string'&&value.startsWith('file:')){
  const file=await fs.realpath(fileURLToPath(value)),relative=path.relative(workspaceRoot,file);assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));
  const mime=({'.png':'image/png','.wav':'audio/wav'})[path.extname(file).toLowerCase()];assert.ok(mime);const bytes=await fs.readFile(file);hashes.push(createHash('sha256').update(bytes).digest('hex'));return `data:${mime};base64,${bytes.toString('base64')}`;
 }return value;
}
const portable=await embed(p);assert.equal(hashes.length,4);assert.equal(validateProject(portable).valid,true);
const output=path.resolve(option('--output')??'.artifacts/native-0220-reactions');await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'authored.vnproject'),JSON.stringify(portable));
const header=(await fs.readFile('tests/fixtures/character-animation-checks.rpy','utf8')).split('testcase ')[0],q=JSON.stringify,scene=q(s.id),inventory=q(item),sceneLabel=q(compilerInternals.asciiId(s.id,'scene'));
const who=q(compilerInternals.asciiId(hero,'character'));
const resourceHashes=await Promise.all(p.resources.map(async r=>({id:r.id,sha256:createHash('sha256').update(await fs.readFile(fileURLToPath(r.source))).digest('hex')})));
const mediaChecks=p.resources.map((r,index)=>`    assert eval __import__("hashlib").sha256(renpy.loader.load(${q(`assets/generated/${compilerInternals.asciiId(`${r.category}_${r.id}`,'asset')}${path.extname(fileURLToPath(r.source)).toLowerCase()}`)}).read()).hexdigest() == ${q(resourceHashes[index].sha256)}`).join('\n');
const testcase=`testcase native_interaction_recipe_voice_inventory_save_load_rollback:
${mediaChecks}
    run Start(${sceneLabel})
    pause 0.1 until screen "istoriya_explore"
    assert eval istoriya_inventory.get(${inventory}, 0) == 0
    assert eval _istoriya_inventory_targets(${scene}, ${inventory}) == []
    click pos (350, 414)
    advance until eval (_last_say_what or "") == "Ключ взят."
    assert eval _last_say_who == ${who}
    assert eval renpy.get_widget("say", "who").get_all_text() == "Хранитель"
    assert eval istoriya_inventory.get(${inventory}, 0) == 1
    assert eval (renpy.music.get_playing(channel="voice") or "").startswith("<volume 0.35>")
    assert eval renpy.music.get_playing(channel="sound") is not None
    assert eval _istoriya_key(${scene}, ${q(key.id)}) in istoriya_hidden_props
    advance until screen "istoriya_explore"
    click "Инвентарь"
    pause 0.1
    click "Применить: Латунный ключ"
    assert eval len(_istoriya_inventory_targets(${scene}, ${inventory})) == 2
    click "Печать — Показать ключ"
    advance until eval (_last_say_what or "") == "Печать узнала ключ."
    assert eval _last_say_who == ${who}
    assert eval renpy.get_widget("say", "who").get_all_text() == "Хранитель"
    assert eval istoriya_inventory.get(${inventory}, 0) == 1
    assert eval renpy.music.get_playing(channel="voice") is not None
    advance until screen "istoriya_explore"
    assert eval len(_istoriya_inventory_targets(${scene}, ${inventory})) == 1
    run FileSave("interaction-before-use", confirm=False, page="qa")
    assert eval FileLoadable("interaction-before-use", page="qa")
    click "Инвентарь"
    pause 0.1
    click "Применить: Латунный ключ"
    screenshot "native-reaction-targets.png"
    click "Дверь — Открыть ключом"
    advance until eval (_last_say_what or "") == "Дверь открыта."
    assert eval istoriya_inventory.get(${inventory}, 0) == 0
    assert eval _istoriya_inventory_targets(${scene}, ${inventory}) == []
    run FileLoad("interaction-before-use", confirm=False, page="qa")
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
    assert eval renpy.music.get_playing(channel="voice") is not None
`;
await fs.writeFile(path.join(output,'testcases.rpy'),header+testcase);
const result={passed:true,version,authored,played,hashes,resourceHashes,metadata,workspaceRoot,processResult,built,projectPath:path.join(output,'authored.vnproject'),fixturePath:path.join(output,'testcases.rpy')};await fs.writeFile(path.join(output,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({...result,authored:'[saved in result]',played:'[saved in result]'},null,2));
