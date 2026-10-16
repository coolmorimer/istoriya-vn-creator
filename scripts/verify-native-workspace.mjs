import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
import {ASSET_FIELDS} from '../runtime/asset-fields.mjs';import {validateProject} from '../src/domain/validator.js';import {compilerInternals} from '../runtime/compiler.mjs';
const json=async f=>JSON.parse((await fs.readFile(f,'utf8')).replace(/^\uFEFF/,''));
const metadata=await json('.artifacts/native-ui-qa-location.json'),processResult=await json(path.join(metadata.run,'process-result.json'));assert.equal(processResult.ExitCode,0);assert.equal(processResult.TimedOut,false);
const root=await fs.realpath(metadata.root),profile=await json(path.join(root,'ui-profile.json')),base=await fs.realpath(profile.profile);assert.equal(path.dirname(base),root);assert.equal(path.basename(base),profile.marker);assert.ok(profile.marker.startsWith('ui-profile-'));
const workspace=await json(path.join(base,'workspace/workspace.json')),library=JSON.parse(workspace.values['istoriya-project-library-v1']),p=JSON.parse(workspace.values['istoriya-project-v2']);assert.equal(library.length,1);assert.deepEqual(p,library[0]);assert.equal(workspace.values['istoriya-project-recovery-v1'],undefined);assert.equal(p.id,'workspace_qa');assert.equal(Object.keys(p.scenes).length,500);assert.equal(p.chapters.length,10);
for(let i=0;i<500;i++){const s=p.scenes[`s${i}`];assert.equal(s.actions.length,2);assert.equal(s.actions[0].text,`РЕПЛИКА ${i}`);assert.deepEqual(s.mapPosition,{x:50+(i%5)*300,y:50+Math.floor(i/5)*200});if(i<499){assert.equal(s.actions[1].options.length,2);assert.equal(s.actions[1].options[0].targetSceneId,`s${i+1}`);assert.equal(s.actions[1].options[1].targetSceneId,`s${i===0?499:Math.min(499,i+2)}`);}else assert.equal(s.actions[1].type,'end');}
assert.equal(p.scenes.s0.actions[1].options[1].text,'Сразу к финалу');assert.ok(!p.scenes.s0.actions[1].options[1].targetChapterId);assert.equal(p.scenes.s0.images[0].interactions.length,2);
const built=await json(path.join(root,'ui-build-result.json'));assert.equal(built.projectId,p.id);assert.equal(built.isolatedQa,true);await fs.access(built.build.packagePath);const media=[];
async function embed(value,field=''){if(Array.isArray(value))return Promise.all(value.map(v=>embed(v)));if(value&&typeof value==='object')return Object.fromEntries(await Promise.all(Object.entries(value).map(async([k,v])=>[k,await embed(v,k)])));if(ASSET_FIELDS.has(field)&&typeof value==='string'&&value.startsWith('file:')){const file=await fs.realpath(fileURLToPath(value)),relative=path.relative(base,file);assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));const bytes=await fs.readFile(file);media.push({file,sha256:createHash('sha256').update(bytes).digest('hex')});return `data:image/png;base64,${bytes.toString('base64')}`;}return value;}
const portable=await embed(p);assert.equal(media.length,1);assert.equal(validateProject(portable).valid,true);const output=path.resolve('.artifacts/native-0227-workspace');await fs.mkdir(output,{recursive:true});const projectPath=path.join(output,'authored.vnproject'),fixturePath=path.join(output,'testcases.rpy');await fs.writeFile(projectPath,JSON.stringify(portable));const header=(await fs.readFile('tests/fixtures/character-animation-checks.rpy','utf8')).split('testcase ')[0];
const fixture=`testcase workspace_labels_and_media:
    assert eval all(renpy.has_label("scene_s%d" % i) for i in range(500))
    assert eval __import__("hashlib").sha256(renpy.loader.load("assets/generated/${compilerInternals.asciiId('prop_shared-image','asset')}.png").read()).hexdigest() == "${media[0].sha256}"

testcase map_authored_cross_chapter_save_load_rollback:
    run Start("scene_s0")
    advance until eval (_last_say_what or "") == "РЕПЛИКА 0"
    advance until screen "choice"
    assert screen "choice"
    run FileSave("workspace-choice", confirm=False, page="qa")
    assert eval FileLoadable("workspace-choice", page="qa")
    click "Сразу к финалу"
    advance until eval (_last_say_what or "") == "РЕПЛИКА 499"
    assert eval (_last_say_what or "") == "РЕПЛИКА 499"
    run Rollback()
    pause 0.1 until screen "choice"
    assert screen "choice"
    click "Дальше"
    advance until eval (_last_say_what or "") == "РЕПЛИКА 1"
    assert eval (_last_say_what or "") == "РЕПЛИКА 1"
    run FileLoad("workspace-choice", confirm=False, page="qa")
    pause 0.1 until screen "choice"
    assert screen "choice"
    click "Сразу к финалу"
    advance until eval (_last_say_what or "") == "РЕПЛИКА 499"
    assert eval (_last_say_what or "") == "РЕПЛИКА 499"

testcase original_cross_chapter_branch_preserved:
    run Start("scene_s49")
    advance until screen "choice"
    assert screen "choice"
    click "Другая ветка"
    advance until eval (_last_say_what or "") == "РЕПЛИКА 51"
    assert eval (_last_say_what or "") == "РЕПЛИКА 51"

testcase last_scene_still_reachable:
    run Start("scene_s498")
    advance until screen "choice"
    assert screen "choice"
    click "Дальше"
    advance until eval (_last_say_what or "") == "РЕПЛИКА 499"
    assert eval (_last_say_what or "") == "РЕПЛИКА 499"
`;
await fs.writeFile(fixturePath,header+fixture);const result={passed:true,version:'0.2.27',metadata,processResult,built,projects:1,scenes:500,chapters:10,edges:998,media,projectPath,fixturePath,cases:4,assertions:(fixture.match(/^    assert /gm)??[]).length};await fs.writeFile(path.join(output,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
