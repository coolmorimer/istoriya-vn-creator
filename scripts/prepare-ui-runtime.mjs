import fs from 'node:fs/promises';
import path from 'node:path';
import {gameUi,pixelRect} from '../runtime/game-ui.mjs';
const metadata=JSON.parse(await fs.readFile('.artifacts/ui-authoring-location.json','utf8'));
const input=process.argv[2]??metadata.project,p=JSON.parse(await fs.readFile(input,'utf8')),ui=gameUi(p),w=p.meta.resolution.width,h=p.meta.resolution.height;
const start=ui.menu.buttons.find(b=>b.id==='start'),startRect=pixelRect(start.rect,w,h),window=pixelRect(ui.dialogue.window.rect,w,h),text=pixelRect(ui.dialogue.text.rect,w,h),choices=pixelRect(ui.choice.rect,w,h);
const fixture=path.join(metadata.root,'testcases.rpy');
await fs.writeFile(fixture,`# QA copy only: no input-desktop switching or OS input.
init python:
    import renpy.pygame as pygame
    def _qa_ui_down(x, y):
        pygame.event.post(pygame.event.Event(pygame.MOUSEBUTTONDOWN, button=1, pos=(x, y), test=True))
    def _qa_ui_xy(screen, widget):
        displayable = renpy.get_displayable(screen, widget)
        print("QA_UI_PLACEMENT", screen, widget, type(displayable).__name__, displayable.get_placement() if displayable is not None else None)
        return tuple(displayable.get_placement()[:2]) if displayable else None
    def _qa_ui_size(screen, widget):
        displayable = renpy.get_displayable(screen, widget)
        return renpy.render(displayable, config.screen_width, config.screen_height, 0.0, 0.0).get_size() if displayable else None
    def _qa_ui_sources(displayable):
        seen, names = set(), set()
        def visit(d):
            if d is None or id(d) in seen:
                return
            seen.add(id(d))
            if getattr(d, "filename", None):
                names.add(str(d.filename))
            for child in d.visit():
                visit(child)
        visit(displayable)
        return sorted(names)
    def _qa_ui_state_sources(screen, widget, prefix):
        style = renpy.get_displayable(screen, widget).style
        previous = style.prefix
        try:
            style.set_prefix(prefix)
            return _qa_ui_sources(style.background)
        finally:
            style.set_prefix(previous)

testsuite global:
    before testcase:
        $ _test.timeout = 20.0
        $ _test.transition_timeout = 0.05
        if not screen "main_menu":
            run MainMenu(confirm=False)
    teardown:
        exit

testcase visual_ui_actions_geometry_and_save:
    assert screen "main_menu"
    assert eval _qa_ui_xy("main_menu", "istoriya_menu_start") == (${startRect.x}, ${startRect.y})
    assert eval _qa_ui_size("main_menu", "istoriya_menu_start") == (${startRect.w}, ${startRect.h})
    assert eval not renpy.get_displayable("main_menu", "istoriya_menu_continue").is_sensitive()
    assert eval any("skin" in s for s in _qa_ui_sources(renpy.get_displayable("main_menu", "istoriya_menu_start").style.background))
    assert eval any("hover" in s for s in _qa_ui_state_sources("main_menu", "istoriya_menu_start", "hover_"))
    move ${JSON.stringify(start.label)}
    $ _qa_ui_down(${startRect.x+Math.floor(startRect.w/2)}, ${startRect.y+Math.floor(startRect.h/2)})
    pause 0.05
    assert eval renpy.get_screen("main_menu").scope.get("_istoriya_pressed") == "start"
    assert eval any("pressed" in s for s in _qa_ui_sources(renpy.get_displayable("main_menu", "istoriya_menu_start").style.background))
    assert eval any("disabled" in s for s in _qa_ui_state_sources("main_menu", "istoriya_menu_start", "insensitive_"))
    screenshot "ui-menu.png"
    click ${JSON.stringify(start.label)}
    advance until eval (_last_say_what or "") == "ui-first"
    assert eval renpy.get_displayable("say", "what").get_all_text() == "ui-first"
    assert eval renpy.get_displayable("say", "who").get_all_text() == "Героиня"
    assert eval _qa_ui_xy("say", "window") == (${window.x}, ${window.y})
    assert eval _qa_ui_size("say", "window") == (${window.w}, ${window.h})
    assert eval _qa_ui_xy("say", "istoriya_text_zone") == (${text.x}, ${text.y})
    assert eval renpy.get_displayable("say", "istoriya_portrait") is not None
    screenshot "ui-dialogue.png"
    click "Сохранить"
    assert screen "save"
    click "Назад"
    assert not screen "save"
    run FileSave("ui-first", confirm=False, page="qa")
    assert eval FileLoadable("ui-first", page="qa")
    advance until eval (_last_say_what or "") == "ui-second"
    run MainMenu(confirm=False)
    assert eval renpy.get_displayable("main_menu", "istoriya_menu_continue").is_sensitive()
    click "Продолжить"
    advance until eval (_last_say_what or "") == "ui-first"
    assert eval renpy.get_displayable("say", "who").get_all_text() == "Героиня"
    advance until screen "choice"
    assert eval _qa_ui_xy("choice", "istoriya_choices") == (${choices.x}, ${choices.y})
    assert eval renpy.get_displayable("say", "what").get_all_text() == "Выберите путь"
    screenshot "ui-choice.png"
    click "Открыть дверь"
    advance until eval (_last_say_what or "") == "ui-end"
    assert eval (_last_say_what or "") == "ui-end"
    run Rollback()
    assert screen "choice"
    run FileLoad("ui-first", confirm=False, page="qa")
    assert eval (_last_say_what or "") == "ui-first"
`);
console.log(JSON.stringify({root:metadata.root,fixture,input},null,2));
