import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {validateProject} from '../src/domain/validator.js';
const metadata=JSON.parse(await fs.readFile('.artifacts/map-authoring-location.json','utf8'));
const input=process.argv[2]??'.artifacts/map-ui/authored.vnproject';
const p=JSON.parse(await fs.readFile(input,'utf8'));
assert.equal(validateProject(p).valid,true);
assert.equal(p.scenes.rules.images.find(l=>l.id==='door').interactions[0].label,'Войти в зал');
const choice=p.scenes.payment.actions[0],option=choice.options.find(o=>o.id==='pay');
assert.equal(choice.prompt,'Пройти дальше за одну монету?');assert.equal(option.text,'Заплатить монетой');
assert.equal(option.effects.length,4);assert.equal(option.effects[2].value,false);
assert.equal(p.scenes.check.actions[0].condition.conditions[2].value,false);
const header=await fs.readFile('tests/fixtures/character-animation-checks.rpy','utf8');
const fixture=path.join(metadata.root,'testcases.rpy');
await fs.writeFile(fixture,header+`
testcase map_authored_prop_chapter_choice_and_condition:
    run Start("scene_rules")
    advance until screen "istoriya_explore"
    assert eval len(_istoriya_reactions("rules", "door")) == 0
    click pos (350, 414)
    advance until eval (_last_say_what or "") == "Монеты взяты."
    assert eval istoriya_inventory.get("coin", 0) == 2
    assert eval v_love == 3 and v_score == 2 and v_yes is True
    assert eval flag_touched is True and flag_keep is False
    run FileSave("map-taken", confirm=False, page="qa")
    assert eval FileLoadable("map-taken", page="qa")
    advance until screen "istoriya_explore"
    assert eval len(_istoriya_reactions("rules", "door")) == 1
    click pos (960, 350)
    advance until eval (_last_say_what or "") == "Дверь открыта."
    assert eval flag_open is True and istoriya_inventory.get("token", 0) == 1
    advance until screen "choice"
    assert eval renpy.get_displayable("say", "what") is not None and renpy.get_displayable("say", "what").get_all_text() == "Пройти дальше за одну монету?"
    assert not "Скрытый вариант"
    run FileSave("map-choice", confirm=False, page="qa")
    click "Заплатить монетой"
    advance until eval (_last_say_what or "") == "win"
    assert eval istoriya_inventory["coin"] == 1 and flag_touched is False and flag_keep is False
    assert eval v_note == "Передано"
    run Rollback()
    assert screen "choice"
    assert eval istoriya_inventory["coin"] == 2 and flag_touched is True and flag_keep is False
    run FileLoad("map-taken", confirm=False, page="qa")
    assert eval (_last_say_what or "") == "Монеты взяты."
    assert eval flag_open is False and istoriya_inventory.get("token", 0) == 0

testcase map_condition_false_route:
    run Start("scene_check")
    advance until eval (_last_say_what or "") == "lose"
    assert eval istoriya_inventory.get("coin", 0) == 0 and flag_keep is True
`);
console.log(JSON.stringify({root:metadata.root,fixture,input,valid:true},null,2));
