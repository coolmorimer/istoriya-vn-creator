import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
import {ASSET_FIELDS} from '../runtime/asset-fields.mjs';import {compilerInternals} from '../runtime/compiler.mjs';import {validateProject} from '../src/domain/validator.js';import {normalizeProject} from '../src/store/projectStore.js';
const json=async f=>JSON.parse((await fs.readFile(f,'utf8')).replace(/^\uFEFF/,''));
const metadataIndex=process.argv.indexOf('--metadata'),metadata=await json(metadataIndex<0?'.artifacts/native-ui-qa-location.json':process.argv[metadataIndex+1]),processResult=await json(path.join(metadata.run,'process-result.json'));assert.equal(processResult.ExitCode,0);assert.equal(processResult.TimedOut,false);
const root=await fs.realpath(metadata.root),profile=await json(path.join(root,'ui-profile.json')),base=await fs.realpath(profile.profile);assert.equal(path.dirname(base),root);assert.equal(path.basename(base),profile.marker);assert.equal(await fs.readFile(path.join(base,'qa-profile-marker'),'utf8'),profile.marker);
const w=await json(path.join(base,'workspace/workspace.json')),p=JSON.parse(w.values['istoriya-project-v2']),library=JSON.parse(w.values['istoriya-project-library-v1']);assert.equal(library.length,1);assert.deepEqual(p,library[0]);assert.equal(w.values['istoriya-project-recovery-v1'],undefined);
const authored=await json('.artifacts/canvas029-author-receipt.json'),built=await json(path.join(root,'ui-build-result.json')),fixture=await json('.artifacts/canvas029-fixture.json');assert.equal(p.id,fixture.projectId);assert.equal(built.projectId,p.id);assert.equal(built.isolatedQa,true);assert.equal(p.schemaVersion,6);assert.deepEqual(p.meta.resolution,{width:1280,height:720});
const original=JSON.parse(JSON.stringify(normalizeProject(await json(fixture.file)))),s=p.scenes[authored.sceneId],before=original.scenes[authored.sceneId],prop=s.images.find(l=>l.id==='prop'),hero=s.actions.find(a=>a.id==='show');
assert.equal(Object.keys(p.scenes).length,1);assert.equal(s.images.length,2);assert.equal(s.characters.length,0);assert.equal(s.actions.length,4);assert.equal(p.resources.length,3);assert.deepEqual(prop,authored.prop);assert.deepEqual(hero,authored.hero);assert.deepEqual(s.backgroundTransform,authored.background);assert.deepEqual(s.images[1],before.images[1]);assert.deepEqual(s.actions.slice(1),before.actions.slice(1));assert.deepEqual(p.characters,original.characters);assert.deepEqual(p.chapters,original.chapters);assert.deepEqual(p.ui,original.ui);
assert.equal(authored.smallCenterDraggable,true);assert.equal(authored.outOfFrameDrag.scale,100);assert.ok(authored.outOfFrameDrag.x<0&&authored.outOfFrameDrag.y>100);assert.ok(prop.scale>110);assert.ok(hero.x>25&&hero.y<95);
const media=[];async function embed(value,field=''){
 if(Array.isArray(value))return Promise.all(value.map(v=>embed(v)));if(value&&typeof value==='object')return Object.fromEntries(await Promise.all(Object.entries(value).map(async([k,v])=>[k,await embed(v,k)])));
 if(ASSET_FIELDS.has(field)&&typeof value==='string'&&value.startsWith('file:')){const file=await fs.realpath(fileURLToPath(value)),relative=path.relative(base,file);assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));const bytes=await fs.readFile(file),sha256=createHash('sha256').update(bytes).digest('hex');media.push({file,sha256});return `data:image/png;base64,${bytes.toString('base64')}`;}return value;
}
const portable=await embed(p);assert.equal(media.length,3);assert.deepEqual(portable.resources,original.resources);assert.equal(validateProject(portable).valid,true);
const output=path.resolve('.artifacts/native-0229-canvas');await fs.mkdir(output,{recursive:true});const projectPath=path.join(output,'authored.vnproject'),fixturePath=path.join(output,'testcases.rpy');await fs.writeFile(projectPath,JSON.stringify(portable));
const q=JSON.stringify,header=(await fs.readFile('tests/fixtures/character-animation-checks.rpy','utf8')).split('testcase ')[0],scene=q(compilerInternals.asciiId(s.id,'scene'));
const checks=p.resources.map(r=>{const sha256=createHash('sha256').update(Buffer.from(portable.resources.find(a=>a.id===r.id).source.split(',')[1],'base64')).digest('hex');return `    assert eval __import__("hashlib").sha256(renpy.loader.load(${q(`assets/generated/${compilerInternals.asciiId(`${r.category}_${r.id}`,'asset')}.png`)}).read()).hexdigest() == ${q(sha256)}`;}).join('\n');
const runtime=`init python:
    def qa_canvas_state(tag):
        pending = [renpy.game.context().scene_lists.get_displayable_by_tag("master", tag)]
        seen = set()
        while pending and len(seen) < 128:
            displayable = pending.pop(0)
            if displayable is None or id(displayable) in seen:
                continue
            seen.add(id(displayable))
            if hasattr(displayable, "state"):
                return displayable.state
            pending[0:0] = displayable.visit()
        raise Exception("No rendered transform for " + tag)

testcase authored_canvas_transforms_save_load_rollback:
${checks}
    run Start(${scene})
    advance until eval (_last_say_what or "") == "Холст не меняет сюжет."
    assert eval abs(qa_canvas_state("actor_hero").xpos - ${hero.x/100}) < 0.00001
    assert eval abs(qa_canvas_state("actor_hero").ypos - ${hero.y/100}) < 0.00001
    assert eval abs(qa_canvas_state("actor_hero").zoom - ${hero.scale/100}) < 0.00001
    assert eval abs(qa_canvas_state("image_prop").xpos - ${prop.x/100}) < 0.00001
    assert eval abs(qa_canvas_state("image_prop").ypos - ${prop.y/100}) < 0.00001
    assert eval abs(qa_canvas_state("image_prop").zoom - ${prop.scale/100}) < 0.00001
    assert eval abs(qa_canvas_state("image_outside").xpos + 1.6) < 0.00001
    assert eval abs(qa_canvas_state("image_outside").ypos - 2.2) < 0.00001
    assert eval qa_canvas_state("image_outside").rotate == 30
    assert eval abs(qa_canvas_state("istoriya_scene_bg").xpos - ${s.backgroundTransform.x/100}) < 0.00001
    assert eval abs(qa_canvas_state("istoriya_scene_bg").ypos - ${s.backgroundTransform.y/100}) < 0.00001
    $ prop_bounds = renpy.get_image_bounds("image_prop")
    $ hero_bounds = renpy.get_image_bounds("actor_hero")
    $ bg_bounds = renpy.get_image_bounds("istoriya_scene_bg")
    assert eval abs(prop_bounds[0] + prop_bounds[2] / 2 - ${prop.x/100*1280}) < 2
    assert eval abs(prop_bounds[1] + prop_bounds[3] - ${prop.y/100*720}) < 2
    assert eval abs(hero_bounds[0] + hero_bounds[2] / 2 - ${hero.x/100*1280}) < 2
    assert eval abs(hero_bounds[1] + hero_bounds[3] - ${hero.y/100*720}) < 2
    assert eval abs(bg_bounds[0] + bg_bounds[2] / 2 - ${s.backgroundTransform.x/100*1280}) < 2
    assert eval abs(bg_bounds[1] + bg_bounds[3] / 2 - ${s.backgroundTransform.y/100*720}) < 2
    $ print("QA_CANVAS_BOUNDS", __import__("json").dumps({"prop": prop_bounds, "hero": hero_bounds}))
    pause 1.2
    assert eval renpy.get_displayable("say", "what").get_all_text() == "Холст не меняет сюжет."
    screenshot "canvas-authored.png"
    run FileSave("canvas-authored", confirm=False, page="qa")
    assert eval FileLoadable("canvas-authored", page="qa")
    advance until screen "istoriya_explore"
    assert eval renpy.get_image_bounds("image_prop") == prop_bounds
    run Rollback()
    pause 0.1
    assert eval (_last_say_what or "") == "Холст не меняет сюжет."
    assert eval abs(qa_canvas_state("actor_hero").xpos - ${hero.x/100}) < 0.00001 and abs(qa_canvas_state("actor_hero").ypos - ${hero.y/100}) < 0.00001 and abs(qa_canvas_state("actor_hero").zoom - ${hero.scale/100}) < 0.00001
    advance until screen "istoriya_explore"
    run FileLoad("canvas-authored", confirm=False, page="qa")
    pause 0.1
    assert eval abs(qa_canvas_state("image_prop").xpos - ${prop.x/100}) < 0.00001 and abs(qa_canvas_state("image_prop").ypos - ${prop.y/100}) < 0.00001 and abs(qa_canvas_state("image_prop").zoom - ${prop.scale/100}) < 0.00001
    assert eval abs(qa_canvas_state("actor_hero").xpos - ${hero.x/100}) < 0.00001 and abs(qa_canvas_state("actor_hero").ypos - ${hero.y/100}) < 0.00001 and abs(qa_canvas_state("actor_hero").zoom - ${hero.scale/100}) < 0.00001
`;
await fs.writeFile(fixturePath,header+runtime);const result={passed:true,version:'0.2.29',metadata,processResult,authored,built,media,projectPath,fixturePath,cases:1,assertions:(runtime.match(/^    assert /gm)??[]).length};await fs.writeFile(path.join(output,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
