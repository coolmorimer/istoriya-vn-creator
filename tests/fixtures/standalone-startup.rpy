# QA-only: starts the packaged EXE normally, without the Ren'Py test command.
# No exception ignoring, screen replacement or user input.
init python:
    import time as _qa_time
    import os as _qa_os
    _qa_menu_seen = None

    def _qa_standalone_ready():
        global _qa_menu_seen
        if not renpy.get_screen("main_menu"):
            return
        if _qa_menu_seen is None:
            _qa_menu_seen = _qa_time.monotonic()
        elif _qa_time.monotonic() - _qa_menu_seen >= 0.5:
            renpy.screenshot(_qa_os.path.join(config.basedir, "qa-startup.png"))
            print("QA_STANDALONE_READY", flush=True)
            renpy.quit()

    config.periodic_callbacks.append(_qa_standalone_ready)
