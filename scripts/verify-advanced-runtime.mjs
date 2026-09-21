import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileProject } from "../runtime/compiler.mjs";
import { defaultProject } from "../src/data/defaultProject.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sdkPath = path.resolve(root, "..", "renpy-8.5.3-sdk");
const project = structuredClone(defaultProject);
project.meta.buildQuality = "original";
project.resources.push(
  { id: "res_cg_test", name: "Тестовая CG", category: "cg", source: "/assets/demo-aurora.png", mime: "image/png", size: 1 },
  { id: "res_music_test", name: "Тестовая музыка", category: "music", source: path.join(sdkPath, "renpy", "common", "_silence.ogg"), mime: "audio/ogg", size: 1 },
  { id: "res_sound_test", name: "Тестовый звук", category: "sound", source: path.join(sdkPath, "renpy", "common", "_dl_silence.ogg"), mime: "audio/ogg", size: 1 },
);
project.characters[0].sprites = [{ id: "sprite_happy", name: "Радость", source: "/assets/demo-aurora.png" }];
project.gallery.sections[0].items = [{ id: "gallery_cg_test", resourceId: "res_cg_test", title: "Северное сияние", unlockMode: "seen" }];
project.scenes.scene_fire.actions = [
  { id: "show", type: "showCharacter", characterId: "char_alina", spriteId: "sprite_happy", position: "right", transition: "dissolve" },
  { id: "move", type: "moveCharacter", characterId: "char_alina", position: "center", duration: 0.4 },
  { id: "animate", type: "characterAnimation", characterId: "char_alina", spriteId: "sprite_happy", animation: "pulse", duration: 0.5, intensity: 1.2 },
  { id: "music", type: "music", assetId: "res_music_test", volume: 0.5, fadeIn: 0.2, loop: true },
  { id: "sound", type: "sound", assetId: "res_sound_test", volume: 0.8 },
  { id: "cg", type: "showCG", assetId: "res_cg_test", transition: "dissolve", unlockGallery: true },
  { id: "hide-cg", type: "hideCG", transition: "dissolve" },
  { id: "event", type: "event", text: "Событие открыто", duration: 0.5 },
  { id: "choice", type: "choice", prompt: "Куда дальше?", options: [
    { id: "option-a", text: "Вперёд", targetSceneId: "scene_truth", condition: { variableId: "var_trust", operator: "gte", value: 0 }, effects: [{ id: "effect-a", kind: "variable", variableId: "var_trust", operation: "add", value: 1 }] },
    { id: "option-b", text: "Назад", targetSceneId: "scene_road", effects: [{ id: "effect-b", kind: "flag", flagId: "flag_map", value: true }] },
  ] },
];

project.ui.textStyle = {font:'DejaVuSans-Bold.ttf',size:38,color:'#ffcc99',outline:2,outlineColor:'#000000',shadow:true,speed:50};
project.scenes.scene_fire.actions.unshift({id:'text-style-test',type:'narration',text:'Проверка шрифта, тени и обводки',textStyle:{italic:true,underline:true}});
project.scenes.scene_fire.actions.splice(1,0,{id:'pause-test',type:'pause',duration:.2});
const destination = path.join(root, ".artifacts", "advanced-runtime");
const result = await compileProject(project, destination, { sdkPath, assetsRoot: path.join(root, "public"), startSceneId: "scene_fire" });
console.log(JSON.stringify(result, null, 2));
