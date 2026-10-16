import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {ASSET_FIELDS} from '../runtime/asset-fields.mjs';
import {validateProject} from '../src/domain/validator.js';
const json=async file=>JSON.parse((await fs.readFile(file,'utf8')).replace(/^\uFEFF/,''));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const metadata=await json('.artifacts/native-ui-qa-location.json'),processResult=await json(path.join(metadata.run,'process-result.json'));
assert.equal(processResult.ExitCode,0);assert.equal(processResult.TimedOut,false);
const {profile,marker}=await json(path.join(metadata.root,'ui-profile.json')),base=await fs.realpath(profile),root=await fs.realpath(metadata.root);
assert.equal(path.dirname(base),root);assert.equal(path.basename(base),marker);assert.ok(marker.startsWith('ui-profile-'));
const workspace=await json(path.join(base,'workspace/workspace.json')),p=JSON.parse(workspace.values['istoriya-project-v2']),library=JSON.parse(workspace.values['istoriya-project-library-v1']);
const receipt=await json('.artifacts/author95-0217-receipt.json'),built=await json(path.join(root,'ui-build-result.json'));
assert.equal(library.length,1);assert.equal(workspace.values['istoriya-project-recovery-v1'],undefined);assert.equal(p.schemaVersion,6);assert.equal(p.id,receipt.projectId);assert.equal(built.projectId,p.id);assert.equal(built.isolatedQa,true);
assert.equal(p.meta.title,'Две тропы — первая история');assert.deepEqual(p.meta.resolution,{width:1920,height:1080});assert.equal(p.chapters.length,1);assert.equal(Object.keys(p.scenes).length,3);assert.equal(p.characters.length,1);
const entry=Object.values(p.scenes).find(s=>s.title==='Лесная развилка'),tea=Object.values(p.scenes).find(s=>s.title==='Чаепитие'),dawn=Object.values(p.scenes).find(s=>s.title==='Рассвет'),hero=p.characters[0];
assert.equal(entry.id,receipt.entrySceneId);assert.deepEqual(entry.actions.map(a=>a.type),['music','showCharacter','dialogue','choice']);
const show=entry.actions[1],choice=entry.actions[3],font=p.resources.find(r=>r.category==='font'),window=p.ui.layout.dialogue.window;
assert.equal(show.transition,'moveinright');assert.equal(show.x,66.1);assert.equal(show.y,91.8);assert.equal(entry.actions[0].volume,.35);assert.equal(entry.actions[0].loop,true);
assert.deepEqual(choice.options.map(o=>o.targetSceneId),[tea.id,dawn.id]);assert.ok(choice.options.every(o=>!o.targetChapterId));
for(const scene of [tea,dawn]){assert.deepEqual(scene.actions.map(a=>a.type),['showCharacter','dialogue','end']);assert.ok(!scene.timelineEnabled);}
assert.deepEqual(hero.sprites.map(s=>s.name),['Спокойствие','Тревога','Радость']);assert.equal(hero.defaultSpriteId,hero.sprites[0].id);assert.equal(show.spriteId,hero.sprites[1].id);assert.equal(tea.actions[1].spriteId,hero.sprites[2].id);assert.equal(dawn.actions[1].spriteId,hero.sprites[0].id);
assert.deepEqual(window.rect,{x:6,y:70,w:88,h:25});assert.equal(window.color,'#181426');assert.equal(window.opacity,92);assert.equal(p.ui.textStyle.font,font.id);assert.equal(p.ui.textStyle.size,36);assert.equal(p.ui.textStyle.speed,0);assert.equal(p.ui.textStyle.shadow,true);
const original=path.resolve('examples/tea-with-goblins/assets'),mediaHashes=[];let media=0;
async function mediaBytes(source){
 const file=await fs.realpath(fileURLToPath(source)),relative=path.relative(base,file);assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));return fs.readFile(file);
}
for(const [scene,name] of [[entry,'forest-rain.png'],[tea,'cave-hall.png'],[dawn,'forest-clear.png']]){
 const resource=p.resources.find(r=>r.id===scene.backgroundResourceId);assert.equal(digest(await mediaBytes(resource.source)),digest(await fs.readFile(path.join(original,name))));
}
for(const [sprite,name] of hero.sprites.map((s,i)=>[s,['elira-neutral.png','elira-worried.png','elira-happy.png'][i]])){
 const source=sprite.source??p.resources.find(r=>r.id===sprite.resourceId).source;assert.equal(digest(await mediaBytes(source)),digest(await fs.readFile(path.join(original,name))));
}
assert.equal(digest(await mediaBytes(p.resources.find(r=>r.id===entry.actions[0].assetId).source)),digest(await fs.readFile(path.join(original,'mystery.wav'))));
assert.equal(digest(await mediaBytes(font.source)),digest(await fs.readFile('public/fonts/DejaVuSans.ttf')));
async function embed(value,field=''){
 if(Array.isArray(value))return Promise.all(value.map(v=>embed(v)));
 if(value&&typeof value==='object')return Object.fromEntries(await Promise.all(Object.entries(value).map(async([k,v])=>[k,await embed(v,k)])));
 if(ASSET_FIELDS.has(field)&&typeof value==='string'&&value.startsWith('file:')){
  const file=fileURLToPath(value),mime=({'.png':'image/png','.wav':'audio/wav','.ttf':'font/ttf'})[path.extname(file).toLowerCase()];assert.ok(mime);const bytes=await mediaBytes(value);media++;mediaHashes.push(digest(bytes));return `data:${mime};base64,${bytes.toString('base64')}`;
 }
 return value;
}
const portable=await embed(p);assert.equal(media,8);const validation=validateProject(portable);assert.equal(validation.valid,true,JSON.stringify(validation.issues));
const packagePath=await fs.realpath(built.build.packagePath),relativePackage=path.relative(root,packagePath);assert.ok(relativePackage.startsWith('ui-build'+path.sep)&&!relativePackage.includes('..'));assert.ok((await fs.stat(packagePath)).size>30e6);
const output=path.resolve('.artifacts/native-0217-authoring');await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'authored.vnproject'),JSON.stringify(portable));
const q=JSON.stringify,tag='actor_'+hero.id,label=id=>'scene_'+id;
const portableResource=new Map(portable.resources.map(r=>[r.id,r]));
const sourceHash=source=>digest(Buffer.from(source.slice(source.indexOf(',')+1),'base64'));
const resourceHash=id=>sourceHash(portableResource.get(id).source);
const spriteHash=index=>sourceHash(portable.characters[0].sprites[index].source??portableResource.get(hero.sprites[index].resourceId).source);
const header=(await fs.readFile('tests/fixtures/character-animation-checks.rpy','utf8')).split('testcase ')[0];
const fixture=header+`
init python:
    def _qa_author_geometry(tag, x, y):
        bounds = renpy.get_image_bounds(tag)
        return bounds is not None and abs(bounds[0] + bounds[2] / 2.0 - x) < 2 and abs(bounds[1] + bounds[3] - y) < 2
    def _qa_author_window_size():
        window = renpy.get_displayable("say", "window", base=True)
        return renpy.render(window, config.screen_width, config.screen_height, 0, 0).get_size()
    def _qa_author_file_hash(filename):
        import hashlib
        with renpy.file(filename) as stream:
            return hashlib.sha256(stream.read()).hexdigest()
    def _qa_author_image_hash(tag, wanted):
        return any(_qa_author_file_hash(filename) == wanted for filename in _qa_image_sources(tag))

testcase author_first_game_custom_window_branches_save_load:
    run Start(${q(label(entry.id))})
    advance until eval (_last_say_what or "") == ${q(entry.actions[2].text)}
    pause 0.2
    assert eval config.screen_width == 1920 and config.screen_height == 1080
    assert eval any(${q(entry.backgroundResourceId)} in source for source in _qa_image_sources("istoriya_scene_bg"))
    assert eval any(${q(hero.sprites[1].id)} in source for source in _qa_image_sources(${q(tag)}))
    assert eval _qa_author_image_hash("istoriya_scene_bg", ${q(resourceHash(entry.backgroundResourceId))})
    assert eval _qa_author_image_hash(${q(tag)}, ${q(spriteHash(1))})
    assert eval _qa_author_geometry(${q(tag)}, ${show.x/100*1920}, ${show.y/100*1080})
    assert eval ${q(entry.actions[0].assetId)} in (renpy.music.get_playing(channel="music") or "")
    assert eval _qa_author_file_hash(renpy.music.get_playing(channel="music")) == ${q(resourceHash(entry.actions[0].assetId))}
    assert eval renpy.get_displayable("say", "window", base=True).style.xpos == 115
    assert eval renpy.get_displayable("say", "window", base=True).style.ypos == 756
    assert eval _qa_author_window_size()[0] == 1690
    assert eval _qa_author_window_size()[1] == 270
    assert eval ${q(font.id)} in renpy.get_widget("say", "what").style.font
    assert eval _qa_author_file_hash(renpy.get_widget("say", "what").style.font) == ${q(resourceHash(font.id))}
    assert eval renpy.get_widget("say", "what").style.size == 36
    assert eval len(renpy.get_widget("say", "what").style.outlines) > 0
    screenshot "author-intro.png"
    advance until screen "choice"
    run FileSave("author-choice", confirm=False, page="qa")
    assert eval FileLoadable("author-choice", page="qa")
    click ${q(choice.options[0].text)}
    advance until eval (_last_say_what or "") == ${q(tea.actions[1].text)}
    assert eval any(${q(tea.backgroundResourceId)} in source for source in _qa_image_sources("istoriya_scene_bg"))
    assert eval any(${q(hero.sprites[2].id)} in source for source in _qa_image_sources(${q(tag)}))
    assert eval _qa_author_image_hash("istoriya_scene_bg", ${q(resourceHash(tea.backgroundResourceId))})
    assert eval _qa_author_image_hash(${q(tag)}, ${q(spriteHash(2))})
    run Rollback()
    assert screen "choice"
    click ${q(choice.options[0].text)}
    advance until eval (_last_say_what or "") == ${q(tea.actions[1].text)}
    run FileSave("author-tea", confirm=False, page="qa")
    run FileLoad("author-choice", confirm=False, page="qa")
    assert screen "choice"
    click ${q(choice.options[1].text)}
    advance until eval (_last_say_what or "") == ${q(dawn.actions[1].text)}
    assert eval any(${q(dawn.backgroundResourceId)} in source for source in _qa_image_sources("istoriya_scene_bg"))
    assert eval any(${q(hero.sprites[0].resourceId)} in source for source in _qa_image_sources(${q(tag)}))
    assert eval _qa_author_image_hash("istoriya_scene_bg", ${q(resourceHash(dawn.backgroundResourceId))})
    assert eval _qa_author_image_hash(${q(tag)}, ${q(spriteHash(0))})
    screenshot "author-dawn.png"
    run FileLoad("author-tea", confirm=False, page="qa")
    assert eval (_last_say_what or "") == ${q(tea.actions[1].text)}
    click pos (960, 540)
    pause 0.1 until screen "main_menu"
    assert screen "main_menu"

testcase author_second_ending_finishes_without_fallthrough:
    run Start(${q(label(entry.id))})
    advance until screen "choice"
    click ${q(choice.options[1].text)}
    advance until eval (_last_say_what or "") == ${q(dawn.actions[1].text)}
    click pos (960, 540)
    pause 0.1 until screen "main_menu"
    assert screen "main_menu"

testcase author_real_quick_menu_save_and_load_cards:
    run Start(${q(label(entry.id))})
    advance until screen "choice"
    click "Сохранить"
    pause 0.1 until screen "save"
    assert screen "save"
    click "1"
    click pos (384, 368)
    pause 0.1
    assert eval FileLoadable("1", page="1")
    click pos (326, 1015)
    pause 0.1 until screen "choice"
    assert screen "choice"
    click ${q(choice.options[0].text)}
    advance until eval (_last_say_what or "") == ${q(tea.actions[1].text)}
    click "Загрузить"
    pause 0.1 until screen "load"
    assert screen "load"
    click "1"
    click pos (384, 368)
    pause 0.1
    if screen "confirm":
        click "Да"
    pause 0.1 until screen "choice"
    assert screen "choice"
    click ${q(choice.options[1].text)}
    advance until eval (_last_say_what or "") == ${q(dawn.actions[1].text)}
    assert eval (_last_say_what or "") == ${q(dawn.actions[1].text)}
    click pos (960, 540)
    pause 0.1 until screen "main_menu"
    assert screen "main_menu"
`;
await fs.writeFile(path.join(output,'testcases.rpy'),fixture);
const result={passed:true,metadata,processResult,createdWithoutProjectImport:true,uiWindowsBuild:true,qaFolderOverride:true,reopened:true,media,originalMediaUnchanged:true,mediaHashes,packagePath,projectPath:path.join(output,'authored.vnproject'),fixturePath:path.join(output,'testcases.rpy'),scope:'Spec95 authoring on isolated native UI; ordinary OS folder-picker interaction remains unverified.'};
await fs.writeFile(path.join(output,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
