# Only copied into QA builds. No user input or exception suppression.
init python:
    def _qa_image_sources(tag):
        seen = set()
        names = set()
        def visit(displayable):
            if displayable is None or id(displayable) in seen:
                return
            seen.add(id(displayable))
            filename = getattr(displayable, "filename", None)
            if filename:
                names.add(str(filename))
            for child in displayable.visit():
                visit(child)
        visit(renpy.game.context().scene_lists.get_displayable_by_tag("master", tag))
        return sorted(names)

testsuite global:
    before testcase:
        $ _test.timeout = 20.0
        $ _test.transition_timeout = 0.05
        if not screen "main_menu":
            run MainMenu(confirm=False)
    teardown:
        exit
