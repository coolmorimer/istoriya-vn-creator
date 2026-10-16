import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {ASSET_FIELDS} from '../runtime/asset-fields.mjs';
import {targetScene} from '../runtime/story-routing.mjs';
import {compilerInternals} from '../runtime/compiler.mjs';
import {validateProject} from '../src/domain/validator.js';
const json=async file=>JSON.parse((await fs.readFile(file,'utf8')).replace(/^\uFEFF/,''));
const metadata=await json('.artifacts/native-ui-qa-location.json'),processResult=await json(path.join(metadata.run,'process-result.json'));assert.equal(processResult.ExitCode,0);assert.equal(processResult.TimedOut,false);
const root=await fs.realpath(metadata.root),profile=await json(path.join(root,'ui-profile.json')),base=await fs.realpath(profile.profile);assert.equal(path.dirname(base),root);assert.equal(path.basename(base),profile.marker);assert.ok(profile.marker.startsWith('ui-profile-'));
const workspace=await json(path.join(base,'workspace/workspace.json')),active=JSON.parse(workspace.values['istoriya-project-v2']),library=JSON.parse(workspace.values['istoriya-project-library-v1']);
// Opening a saved hub card is read-only; its document lives in the durable
// library even when the active checkpoint still belongs to the prior card.
assert.deepEqual(active,library.find(p=>p.id===active.id));const p=library.find(p=>p.id==='destinations_qa');assert.ok(p);assert.equal(library.length,2);assert.equal(workspace.values['istoriya-project-recovery-v1'],undefined);
const large=library.find(p=>p.id==='destinations_500');assert.equal(Object.keys(large.scenes).length,500);assert.equal(large.scenes.s0.actions[0].options[0].targetSceneId,'s499');assert.ok(!large.scenes.s0.actions[0].options[0].targetChapterId);
assert.equal(p.chapters.find(c=>c.id==='b').entrySceneId,'new');assert.equal(p.scenes.jump.actions[0].targetSceneId,'yes');assert.ok(!p.scenes.jump.actions[0].targetChapterId);const check=p.scenes.condition.actions[1];assert.equal(check.trueChapterId,'b');assert.equal(check.falseSceneId,'no');assert.ok(!check.falseChapterId);assert.equal(targetScene(p,check,'trueSceneId'),'new');assert.equal(targetScene(p,p.scenes.start.actions[0].options[0]),'new');assert.equal(p.scenes.prop.images[0].interactions.length,1);assert.equal(targetScene(p,p.scenes.prop.images[0].interactions[0]),'new');
const built=await json(path.join(root,'ui-build-result.json'));assert.equal(built.projectId,p.id);assert.equal(built.isolatedQa,true);
const media=[];async function embed(value,field=''){
 if(Array.isArray(value))return Promise.all(value.map(v=>embed(v)));
 if(value&&typeof value==='object')return Object.fromEntries(await Promise.all(Object.entries(value).map(async([k,v])=>[k,await embed(v,k)])));
 if(ASSET_FIELDS.has(field)&&typeof value==='string'&&value.startsWith('file:')){const file=await fs.realpath(fileURLToPath(value)),relative=path.relative(base,file);assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));const bytes=await fs.readFile(file);media.push({sha256:createHash('sha256').update(bytes).digest('hex'),file});return `data:image/png;base64,${bytes.toString('base64')}`;}return value;
}
const portable=await embed(p);assert.equal(media.length,1);assert.equal(validateProject(portable).valid,true);const output=path.resolve('.artifacts/native-0225-destinations');await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'authored.vnproject'),JSON.stringify(portable));
const header=(await fs.readFile('tests/fixtures/character-animation-checks.rpy','utf8')).split('testcase ')[0];
const fixture=`testcase destination_media_integrity:
    assert eval __import__("hashlib").sha256(renpy.loader.load("assets/generated/${compilerInternals.asciiId('prop_door-image','asset')}.png").read()).hexdigest() == "${media[0].sha256}"

testcase choice_chapter_entry_save_load_rollback:
    run Start("scene_start")
    pause 0.1 until screen "choice"
    assert screen "choice"
    run FileSave("destination-choice", confirm=False, page="qa")
    assert eval FileLoadable("destination-choice", page="qa")
    click "Вход в главу"
    advance until eval (_last_say_what or "") == "НОВЫЙ ВХОД"
    assert eval (_last_say_what or "") == "НОВЫЙ ВХОД"
    run Rollback()
    pause 0.1 until screen "choice"
    assert screen "choice"
    click "Другой путь"
    advance until eval (_last_say_what or "") == "ДРУГОЙ ФИНАЛ"
    assert eval (_last_say_what or "") == "ДРУГОЙ ФИНАЛ"
    run FileLoad("destination-choice", confirm=False, page="qa")
    pause 0.1 until screen "choice"
    assert screen "choice"
    click "Вход в главу"
    advance until eval (_last_say_what or "") == "НОВЫЙ ВХОД"
    assert eval (_last_say_what or "") == "НОВЫЙ ВХОД"

testcase jump_scene_clears_old_chapter_override:
    run Start("scene_jump")
    advance until eval (_last_say_what or "") == "ВЕРНАЯ СЦЕНА"
    assert eval (_last_say_what or "") == "ВЕРНАЯ СЦЕНА"

testcase conditional_false_scene_clears_old_chapter_override:
    run Start("scene_condition")
    advance until eval (_last_say_what or "") == "ПРОВЕРКА УСЛОВИЯ"
    assert eval flag_gate is False
    advance until eval (_last_say_what or "") == "ДРУГОЙ ФИНАЛ"
    assert eval (_last_say_what or "") == "ДРУГОЙ ФИНАЛ"

testcase conditional_true_follows_changed_chapter_entry:
    run Start("scene_condition")
    advance until eval (_last_say_what or "") == "ПРОВЕРКА УСЛОВИЯ"
    run SetVariable("flag_gate", True)
    assert eval flag_gate is True
    advance until eval (_last_say_what or "") == "НОВЫЙ ВХОД"
    assert eval (_last_say_what or "") == "НОВЫЙ ВХОД"

testcase prop_reply_then_changed_chapter_entry:
    run Start("scene_prop")
    pause 0.1 until screen "istoriya_explore"
    assert screen "istoriya_explore"
    click pos (640, 360)
    advance until eval (_last_say_what or "") == "ДВЕРЬ ОТКРЫТА"
    assert eval (_last_say_what or "") == "ДВЕРЬ ОТКРЫТА"
    advance until eval (_last_say_what or "") == "НОВЫЙ ВХОД"
    assert eval (_last_say_what or "") == "НОВЫЙ ВХОД"
`;
await fs.writeFile(path.join(output,'testcases.rpy'),header+fixture);
const result={passed:true,version:'0.2.25',metadata,processResult,built,activeCheckpointId:active.id,verifiedProjectId:p.id,projects:library.length,largeScenes:500,mediaHashes:media,assertions:(fixture.match(/^    assert /gm)??[]).length,cases:(fixture.match(/^testcase /gm)??[]).length,projectPath:path.join(output,'authored.vnproject'),fixturePath:path.join(output,'testcases.rpy')};await fs.writeFile(path.join(output,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
