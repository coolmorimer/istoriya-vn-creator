# QA-only test input. Never shipped in an authored game.
testsuite global:
    before testcase:
        $ _test.timeout = 20.0
        $ _test.transition_timeout = 0.05
        if not screen "main_menu":
            run MainMenu(confirm=False)
    teardown:
        exit

testcase authored_system_screens_and_player_state:
    run Start("scene_first")
    advance until eval (_last_say_what or "") == "system-first"
    keysym "K_ESCAPE"
    assert screen "istoriya_pause"
    assert eval _game_menu_screen == "istoriya_pause"
    screenshot "system-pause.png"
    click "Сохранить"
    assert screen "save"
    assert eval renpy.get_displayable("save", "istoriya_system_title").get_all_text() == "Мои сохранения"
    assert eval renpy.get_displayable("save", "istoriya_slot_4") is not None
    assert eval renpy.get_displayable("save", "istoriya_slot_5") is None
    run FilePage("1")
    click id "istoriya_slot_1"
    assert eval FileLoadable(1)
    assert eval FileJson(1, "_game_runtime") is not None
    assert eval renpy.get_displayable("save", "istoriya_slot_playtime_1") is not None
    screenshot "system-save.png"
    click "Назад"
    assert not screen "save"
    pause 0.1
    assert eval (_last_say_what or "") == "system-first"
    advance until eval (_last_say_what or "") == "system-second"
    run ShowMenu("load")
    assert screen "load"
    click id "istoriya_slot_1"
    assert screen "confirm"
    click "Да"
    advance until eval (_last_say_what or "") == "system-first"
    assert eval (_last_say_what or "") == "system-first"
    run ShowMenu("history")
    assert screen "history"
    assert eval any(entry.what == "system-first" for entry in _history_list)
    screenshot "system-history.png"
    click "Назад"
    run ShowMenu("preferences")
    assert screen "preferences"
    assert eval renpy.get_displayable("preferences", "istoriya_preference_music") is not None
    assert eval renpy.get_displayable("preferences", "istoriya_preference_skip_all") is None
    assert eval renpy.get_displayable("preferences", "istoriya_preference_size_1280") is None
    drag id "istoriya_preference_music" pos (0.9, 0.5) to id "istoriya_preference_music" pos (0.3, 0.5)
    assert eval _preferences.get_volume("music") < 0.7
    screenshot "system-preferences.png"
    click "Назад"
    run ShowMenu("istoriya_gallery")
    assert screen "istoriya_gallery"
    assert eval renpy.get_displayable("istoriya_gallery", "istoriya_gallery_section_0").get_all_text() == "Глава [1] {{пример}"
    assert eval renpy.get_displayable("istoriya_gallery", "istoriya_gallery_open").is_sensitive()
    assert not eval renpy.get_displayable("istoriya_gallery", "istoriya_gallery_closed").is_sensitive()
    screenshot "system-gallery-locked.png"
    click id "istoriya_gallery_open"
    assert screen "istoriya_gallery_viewer"
    click "Закрыть"
    assert not screen "istoriya_gallery_viewer"
    click "Назад"
    # Wait for the game interaction after leaving the menu context. Do not
    # enqueue advance events against the outgoing menu frame.
    pause 0.1
    assert eval (_last_say_what or "") == "system-first"
    $ print("QA_SYSTEM_RETURN", _last_say_what, getattr(config, "skipping", None), renpy.get_screen("istoriya_gallery"), renpy.get_screen("main_menu"))
    screenshot "system-after-gallery.png"
    advance until eval (_last_say_what or "") == "system-unlocked"
    assert eval "closed" in persistent.istoriya_gallery_unlocked
    run ShowMenu("istoriya_gallery")
    assert eval renpy.get_displayable("istoriya_gallery", "istoriya_gallery_closed").is_sensitive()
    click "Назад"
    run Function(renpy.notify, "Предмет [x] {не код}")
    assert screen "notify"
    assert eval renpy.get_displayable("notify", "istoriya_notification_text") is not None
    assert eval renpy.get_displayable("notify", "istoriya_notification_text").get_all_text() == "Предмет [x] {{не код}"
    screenshot "system-notify.png"
    pause 0.7
    assert not screen "notify"
    run ShowMenu("istoriya_pause")
    click "Продолжить"
    assert not screen "istoriya_pause"
    assert eval (_last_say_what or "") == "system-unlocked"
