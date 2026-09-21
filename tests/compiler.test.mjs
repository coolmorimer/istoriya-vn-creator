import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { compileProject, compilerInternals } from "../runtime/compiler.mjs";
import { BUILD_TARGETS } from "../runtime/builder.mjs";
import { validateProject } from "../src/domain/validator.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("идентификаторы Ren'Py стабильны и безопасны", () => {
  assert.equal(compilerInternals.asciiId("scene-01", "scene"), "scene_scene_01");
  assert.equal(compilerInternals.asciiId("Первая встреча", "scene"), "scene_pervaya_vstrecha");
});

test("платформы имеют отдельные пакеты Ren'Py", () => {
  assert.deepEqual(Object.keys(BUILD_TARGETS).sort(), ["android", "linux", "macos", "windows"]);
  assert.equal(BUILD_TARGETS.windows.fileSuffix, "-win.zip");
  assert.equal(BUILD_TARGETS.linux.fileSuffix, "-linux.tar.bz2");
  assert.equal(BUILD_TARGETS.macos.fileSuffix, "-mac.zip");
  assert.deepEqual(BUILD_TARGETS.android.extensions, [".apk", ".aab"]);
});

test("настройки Android компилируются в android.json", async () => {
  const module = await import("../src/data/defaultProject.js");
  const config = compilerInternals.createAndroidConfig(structuredClone(module.defaultProject));
  assert.equal(config.package, "com.istoriya.severnyy_svet");
  assert.equal(config.numeric_version, 1);
  assert.equal(config.orientation, "sensorLandscape");
  assert.ok(config.permissions.includes("INTERNET"));
});

test("настройки папки сохранений и курсора попадают в runtime", async () => {
  const module = await import("../src/data/defaultProject.js");
  const project = structuredClone(module.defaultProject);
  project.meta.saveDirectory = "my-story-saves";
  project.meta.cursorHotspot = { x: 12, y: 7 };
  const options = compilerInternals.createOptions(project, "gui/icon.png", "gui/cursor.png");
  assert.match(options, /define config\.save_directory = "my-story-saves"/);
  assert.match(options, /\("gui\/cursor\.png", 12, 7\)/);
  assert.match(options, /define build\.icon = "gui\/icon\.png"/);
});

test("проект компилируется в запускаемую структуру Ren'Py", async () => {
  const module = await import("../src/data/defaultProject.js");
  const destination = await fs.mkdtemp(path.join(os.tmpdir(), "istoriya-compile-"));
  const result = await compileProject(structuredClone(module.defaultProject), destination, {
    sdkPath: path.resolve(root, "..", "renpy-8.5.3-sdk"),
    assetsRoot: path.join(root, "public"),
  });
  assert.equal(result.sceneCount, Object.keys(module.defaultProject.scenes).length);
  const script = await fs.readFile(path.join(destination, "game", "script.rpy"), "utf8");
  const options = await fs.readFile(path.join(destination, "game", "options.rpy"), "utf8");
  assert.match(script, /label start:/);
  assert.match(script, /menu:/);
  assert.match(script, /Ты тоже любишь такие вечера/);
  assert.match(script, /jump scene_scene_road/);
  assert.match(options, /define config\.name/);
  assert.match(options, /define build\.name = "severnyy_svet"/);
  assert.ok((await fs.stat(path.join(destination, "game", "screens.rpy"))).size > 1000);
  assert.ok((await fs.stat(path.join(destination, "game", "guisupport.rpy"))).size > 100);
  assert.match(await fs.readFile(path.join(destination, "game", "gui.rpy"), "utf8"), /gui\.init\(1920, 1080\)/);
  const androidConfig = JSON.parse(await fs.readFile(path.join(destination, "android.json"), "utf8"));
  assert.equal(androidConfig.package, "com.istoriya.severnyy_svet");
});

test("проверка проекта находит битые связи и позволяет корректную сборку", async () => {
  const module = await import("../src/data/defaultProject.js");
  const valid = validateProject(structuredClone(module.defaultProject));
  assert.equal(valid.valid, true);
  const broken = structuredClone(module.defaultProject);
  broken.scenes.scene_fire.actions.push({ id: "broken", type: "jump", targetSceneId: "missing_scene" });
  broken.scenes.scene_fire.characters[0].characterId = "missing_character";
  const result = validateProject(broken);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((item) => item.code === "broken-scene-link"));
  assert.ok(result.issues.some((item) => item.code === "broken-layer-character"));
});

test("визуальные действия компилируются в команды Ren'Py", async () => {
  const module = await import("../src/data/defaultProject.js");
  const project = structuredClone(module.defaultProject);
  project.characters[0].sprites = [{ id: "happy", name: "Радость", source: "/assets/demo-aurora.png" }];
  project.scenes.scene_fire.actions = [
    { id: "show", type: "showCharacter", characterId: "char_alina", spriteId: "happy", position: "right", transition: "dissolve" },
    { id: "say", type: "dialogue", speakerId: "char_alina", text: "Проверка", voiceAssetId: null },
    { id: "effect", type: "effect", effect: "shake" },
    { id: "variable", type: "variable", variableId: "var_trust", operation: "add", value: 2 },
    { id: "condition", type: "condition", variableId: "var_trust", operator: "gte", value: 2, trueSceneId: "scene_truth", falseSceneId: "scene_road" },
  ];
  const script = compilerInternals.createScript(project, new Map([["scene_fire", "images/bg.png"]]), new Map(), new Map([["char_alina:happy", "images/alina.png"]]));
  assert.match(script, /show expression Transform\("images\/alina\.png".*\) as actor_char_alina at Transform\(xpos=0.75/);
  assert.match(script, /with hpunch/);
  assert.match(script, /\$ v_var_trust \+= 2/);
  assert.match(script, /if v_var_trust >= 2:/);
});
