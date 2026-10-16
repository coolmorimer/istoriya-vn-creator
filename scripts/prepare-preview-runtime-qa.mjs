import fs from 'node:fs/promises';
const p=JSON.parse(await fs.readFile('.artifacts/native-0215-preview/authored.vnproject','utf8')),s=p.scenes.room,key=s.images.find(l=>l.name==='Латунный ключ'),door=s.images.find(l=>l.name==='Дверь'),item=p.items[0].id,q=JSON.stringify;
const header=(await fs.readFile('tests/fixtures/character-animation-checks.rpy','utf8')).split('testcase ')[0];
const cases=`testcase exported_preview_fixture_inventory_and_both_branches:
    run Start("scene_room")
    advance until eval (_last_say_what or "") == "Перед осмотром"
    assert eval renpy.music.get_playing(channel="music") is not None
    assert eval renpy.music.get_playing(channel="ambience") is not None
    advance until screen "istoriya_explore"
    assert eval istoriya_inventory.get(${q(item)}, 0) == 0
    assert not eval _istoriya_allowed("room", ${q(door.id)}, ${q(door.interactions[0].id)})
    click pos (320, 414)
    pause 0.1
    assert screen "istoriya_explore"
    click pos (350, 414)
    advance until eval (_last_say_what or "") == "Ключ взят."
    assert eval istoriya_inventory.get(${q(item)}, 0) == 1
    assert not eval renpy.showing(${q(`image_${key.id}`)})
    assert eval (renpy.music.get_playing(channel="voice") or "").startswith("<volume 0.35>")
    assert eval renpy.music.get_playing(channel="sound") is not None
    run FileSave("taken", confirm=False, page="qa")
    assert eval FileLoadable("taken", page="qa")
    advance until screen "istoriya_explore"
    click pos (960, 350)
    advance until eval (_last_say_what or "") == "Дверь открыта."
    assert eval istoriya_inventory.get(${q(item)}, 0) == 0
    run FileLoad("taken", confirm=False, page="qa")
    assert eval (_last_say_what or "") == "Ключ взят."
    assert eval istoriya_inventory.get(${q(item)}, 0) == 1
    assert not eval renpy.showing(${q(`image_${key.id}`)})
    advance until screen "istoriya_explore"
    click pos (960, 350)
    advance until eval (_last_say_what or "") == "Дверь открыта."
    advance until screen "istoriya_explore"
    click "Продолжить"
    advance until eval (_last_say_what or "") == "Проход открыт"
    advance until screen "choice"
    run FileSave("choice", confirm=False, page="qa")
    assert eval FileLoadable("choice", page="qa")
    click "Налево"
    advance until eval (_last_say_what or "") == "Левая ветка"
    assert eval flag_route is True
    assert eval v_score == 1
    assert eval istoriya_inventory.get(${q(item)}, 0) == 0
    run FileLoad("choice", confirm=False, page="qa")
    pause 0.1 until screen "choice"
    assert screen "choice"
    click "Направо"
    advance until eval (_last_say_what or "") == "Правая ветка"
    assert eval flag_route is False
    assert eval v_score == 0
    run Rollback()
    assert screen "choice"
    assert eval flag_route is False
    assert eval v_score == 0
    click "Налево"
    advance until eval (_last_say_what or "") == "Левая ветка"
    assert eval flag_route is True
    assert eval v_score == 1
`;
await fs.writeFile('.artifacts/native-0215-preview/testcases.rpy',header+cases);console.log({cases:1,assertions:(cases.match(/^    assert /gm)??[]).length});
