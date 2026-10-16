import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
let cases=await fs.readFile('.artifacts/native-0221-media-repair/testcases.rpy','utf8');const first='    run Start("scene_scene_22118462")\n    pause 0.1 until screen "istoriya_explore"';assert.ok(cases.includes(first));cases=cases.replace(first,`    run Start("scene_scene_22118462")
    advance until eval (_last_say_what or "") == "Черновик после аварии — восстановлен без потери ресурсов."
    assert eval (_last_say_what or "") == "Черновик после аварии — восстановлен без потери ресурсов."
    assert eval renpy.get_widget("say", "what").style.font == "assets/generated/asset_font_font_imported.ttf"
    assert eval renpy.music.get_playing("voice") == "assets/generated/asset_sound_resource_873ce4e5.wav"
    advance until screen "istoriya_explore"`);const output=path.resolve('.artifacts/native-0223-recovery');await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'testcases.rpy'),cases);console.log(JSON.stringify({fixture:path.join(output,'testcases.rpy'),assertions:(cases.match(/^    assert /gm)??[]).length}));
