# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Product direction selected by the user

- The source of truth for the editor UI is `design/reference-main-ui.png`.
- Preserve the near-black graphite theme, violet primary actions, plum selection state, single full-width left project sidebar, large 16:9 scene canvas, right object inspector, and multitrack visual timeline shown in that reference.
- The product is a Russian-first, no-code desktop visual novel builder. Technical Ren'Py concepts must stay hidden from authors.
- The story map must fill the available workspace, with a fullscreen option. Scene and connection editing must work directly on the map; variables and flags belong on a separate tab. Action pickers must never be clipped by editor panels.
- Provide separate chapter/scene maps, cursor-anchored wheel zoom, chapter entry points and cross-chapter scene links. Parallel narrative lines must be configurable and converge through real runtime transitions. Text appearance needs project defaults plus per-line overrides and font import. Timeline blocks must support reorder and supported duration resizing, without pretending player-driven dialogue has a fixed duration.
- The timeline must behave like a montage editor: seconds ruler, draggable playhead, compact multitrack clips, time-based movement, trimming both ends, zoom and snapping. Player click waits explicitly pause the story clock. Add characters through a visible canvas button and right-click menus. Never describe unsupported effects, keyframes or unverified native workflows as completed.
- Character sprites must have editable, clearly labelled names and an explicit main sprite selector. Character setup must offer direct placement on the current scene; uploading an image alone must not be mistaken for placing a scene layer.
- Characters must support direct canvas dragging without jumping to the cursor, proportional corner resizing, and persisted transforms for timeline character clips as well as scene layers.
