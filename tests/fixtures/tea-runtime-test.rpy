# QA-only fixture, copied to an isolated build. Not included in the shipped game.
define config.save_directory = "istoriya-tea-isolated-qa"

testsuite global:
    before testcase:
        $ _test.timeout = 20.0
        $ _test.transition_timeout = 0.05
        if not screen "main_menu":
            run MainMenu(confirm=False)
    teardown:
        exit

testcase light_truth:
    run Start()
    advance until screen "choice"
    click "Прикрыться светом амулета"
    advance until screen "choice"
    screenshot "tea-table.png"
    $ print("QA image bounds", [(tag, renpy.get_image_bounds(tag)) for tag in ["image_tea_5_table", "image_tea_5_service", "actor_elira", "actor_brog"]])
    assert eval renpy.showing("image_tea_5_table")
    assert eval renpy.showing("image_tea_5_service")
    assert eval renpy.showing("actor_elira")
    assert eval abs(renpy.get_image_bounds("image_tea_5_table")[3] - 1134) < 1
    assert eval abs(sum(renpy.get_image_bounds("image_tea_5_table")[1::2]) - 1360.8) < 1
    click "Признаться в своих подозрениях"
    advance until screen "main_menu"

testcase light_recipe:
    run Start()
    advance until screen "choice"
    click "Прикрыться светом амулета"
    advance until screen "choice"
    click "Похвалить пирог и попросить рецепт"
    advance until screen "main_menu"

testcase question_truth:
    run Start()
    advance until screen "choice"
    click "Спросить, что в котле"
    advance until screen "choice"
    click "Признаться в своих подозрениях"
    advance until screen "main_menu"

testcase question_recipe:
    run Start()
    advance until screen "choice"
    click "Спросить, что в котле"
    advance until screen "choice"
    click "Похвалить пирог и попросить рецепт"
    advance until screen "main_menu"

testcase save_load_rollback:
    run Start("scene_tea_5")
    advance until eval (_last_say_what or "").startswith("Через несколько минут")
    assert eval _last_say_what.startswith("Через несколько минут")
    pause 0.1
    keysym "dismiss"
    pause 0.1
    assert eval _last_say_what.startswith("Через несколько минут")
    screenshot "tea-dialogue.png"
    run FileSave("qa", confirm=False, page="qa")
    assert eval FileLoadable("qa", page="qa")
    advance
    assert eval _last_say_what.startswith("Перед ней появилась чашка")
    run Rollback()
    assert eval _last_say_what.startswith("Через несколько минут")
    advance
    run FileLoad("qa", confirm=False, page="qa")
    assert eval _last_say_what.startswith("Через несколько минут")
    assert eval renpy.showing("image_tea_5_table") and renpy.showing("image_tea_5_service")
    run ShowMenu("history")
    assert screen "history"
    keysym "game_menu"
    assert not screen "history"
    advance until screen "choice"
    click "Признаться в своих подозрениях"
    advance until screen "main_menu"
