import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {compilerInternals} from '../runtime/compiler.mjs';
const nativeRoot=path.resolve(process.argv[2]??'.artifacts/native-027-author-flow');
const project=JSON.parse(await fs.readFile('output/playwright/background-authored.vnproject','utf8'));
const native=JSON.parse(await fs.readFile(path.join(nativeRoot,'result.json'),'utf8'));
const actor=compilerInternals.asciiId(project.characters[0].id,'actor');
const scene=Object.values(project.scenes)[0];
const backgroundFile=id=>compilerInternals.asciiId(`background_${id}`,'asset');
const firstBackground=backgroundFile(scene.backgroundResourceId),lastBackground=backgroundFile(scene.actions.find(a=>a.type==='background').assetId);
const header=await fs.readFile('tests/fixtures/character-animation-checks.rpy','utf8');
const fixture=path.join(nativeRoot,'authored-background-testcases.rpy');
await fs.writeFile(fixture,header+`
testcase authored_background:
    run Start()
    advance until eval (_last_say_what or "") == "До смены фона"
    $ initial_background = _qa_image_sources("istoriya_scene_bg")
    $ initial_actor = renpy.get_image_bounds("${actor}")
    assert eval renpy.showing("${actor}")
    advance until eval (_last_say_what or "") == "После смены фона"
    $ changed_background = _qa_image_sources("istoriya_scene_bg")
    assert eval changed_background != initial_background
    assert eval renpy.get_image_bounds("${actor}") == initial_actor
    run FileSave("authored-bg", confirm=False, page="qa")
    assert eval FileLoadable("authored-bg", page="qa")
    run Rollback()
    assert eval any("${firstBackground}" in source for source in _qa_image_sources("istoriya_scene_bg"))
    assert eval (_last_say_what or "") == "До смены фона"
    run FileLoad("authored-bg", confirm=False, page="qa")
    assert eval any("${lastBackground}" in source for source in _qa_image_sources("istoriya_scene_bg"))
    assert eval renpy.showing("${actor}")
    screenshot "ui-authored-background.png"
`);
const child=spawn(process.execPath,['scripts/test-tea-runtime.mjs','--isolated-desktop','--package',native.build.packagePath,'--fixture',fixture],{stdio:'inherit',windowsHide:true});
process.exitCode=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});
