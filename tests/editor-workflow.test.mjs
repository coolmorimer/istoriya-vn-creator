import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createProject } from "../src/domain/projectFactory.js";
import { createDiskStorage, portableProject, writeFolderProject, readFolderProject } from "../electron/project-storage.mjs";
import { initialPreview, advancePreview } from "../src/domain/preview.js";
import { compilerInternals } from "../runtime/compiler.mjs";

const memory = new Map();
globalThis.localStorage = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: (key) => memory.delete(key) };
const { useProjectStore: store } = await import("../src/store/projectStore.js");

test("Новый проект и все обычные шаблоны не содержат демонстрационный контент", () => {
  for (const template of [undefined, "empty", "classic", "minimal", "romance", "horror", "cinematic", "vertical"]) {
    const p = createProject({ template });
    assert.equal(Object.keys(p.scenes).length, 1);
    assert.equal(p.chapters.length, 1);
    for (const key of ["resources", "characters", "variables", "flags"]) assert.deepEqual(p[key], []);
    assert.equal(p.ui.mainMenuBackground, null);
    const scene = Object.values(p.scenes)[0];
    assert.equal(scene.background, null);
    assert.deepEqual(scene.actions, []);
    assert.deepEqual(scene.characters, []);
  }
  assert.ok(Object.keys(createProject("tutorial").scenes).length > 1);
});

test("Создание, редактирование, смена проекта, Undo/Redo и открытие не теряют данные", async () => {
  const p = await store.getState().newProject({title:"Проверка"});
  const first = store.getState().activeSceneId;
  assert.equal(store.getState().projects[0].id, p.id);
  store.getState().addAction("narration");
  const actionId = store.getState().activeActionId;
  store.getState().updateAction(first, actionId, {text:"Сохранённый текст"});
  store.getState().addScene();
  const second = store.getState().activeSceneId;
  assert.equal(store.getState().project.scenes[second].background, null);
  store.getState().undo();
  assert.ok(store.getState().project.scenes[store.getState().activeSceneId]);
  store.getState().redo();
  assert.ok(store.getState().project.scenes[second]);
  await store.getState().newProject();
  assert.ok(await store.getState().openProject(p.id));
  assert.equal(store.getState().project.scenes[first].actions[0].text, "Сохранённый текст");
  await store.getState().saveNow();
});

test("Дисковое хранилище сохраняет крупные ресурсы отдельно и экспортирует переносимый проект", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "istoriya-storage-"));
  try {
    const disk = createDiskStorage(dir);
    const source = `data:image/png;base64,${Buffer.alloc(6 * 1024 * 1024, 42).toString("base64")}`;
    const p = createProject(); p.resources.push({id:"r",source});
    disk.setItem("istoriya-project-v2", JSON.stringify(p));
    const loaded = JSON.parse(disk.getItem("istoriya-project-v2"));
    assert.match(loaded.resources[0].source, /^file:/);
    assert.equal(portableProject(loaded, dir).resources[0].source, source);
    const metadataBytes=Buffer.byteLength(JSON.stringify({...p,resources:[]},null,2));
    assert.ok(fs.statSync(path.join(dir,"istoriya-project-v2.json")).size < metadataBytes+2048);
    assert.doesNotMatch(fs.readFileSync(path.join(dir,"istoriya-project-v2.json"),'utf8'),/data:image\/png;base64/);
  } finally { fs.rmSync(dir, {recursive:true, force:true}); }
});

test("Слой персонажа и пустая сцена одинаково представлены в редакторе и runtime", () => {
  const p = createProject(); const scene = Object.values(p.scenes)[0];
  p.characters.push({id:"hero",name:"Герой",color:"#fff",sprites:[]});
  scene.characters.push({id:"layer",characterId:"hero",x:25,y:90,scale:80,rotation:12,opacity:60,flip:true,visible:true});
  const script = compilerInternals.createScript(p,new Map(),new Map(),new Map([["hero:default","images/hero.png"]]));
  assert.match(script, /xpos=0.25, ypos=0.9/);
  assert.match(script, /zoom=0.8, rotate=12, alpha=0.6, xzoom=-1/);
  assert.doesNotMatch(script, /istoriya_narrator "Начало"/);
});

test("Выбор меняет переменную и флаг, условие переводит в нужную сцену", () => {
  const p=createProject(); const id=Object.keys(p.scenes)[0];
  p.variables=[{id:"v",type:"number",initial:0}]; p.flags=[{id:"f",initial:false}];
  p.scenes[id].actions=[{id:"choose",type:"choice",options:[{id:"yes",text:"Да",targetSceneId:"branch",effects:[{variableId:"v",operation:"add",value:2},{kind:"flag",flagId:"f",value:true}]}]}];
  p.scenes.branch={id:"branch",characters:[],actions:[{id:"if",type:"condition",variableId:"v",operator:"gte",value:2,trueSceneId:"win",falseSceneId:"lose"}]};
  p.scenes.win={id:"win",characters:[],actions:[{id:"result",type:"narration",text:"Победа"}]};
  p.scenes.lose={id:"lose",characters:[],actions:[{id:"end",type:"end"}]};
  const state=advancePreview(p,advancePreview(p,initialPreview(p,id)),"yes");
  assert.equal(state.sceneId,"win"); assert.equal(state.waiting.text,"Победа");
  assert.equal(state.variables.v,2); assert.equal(state.flags.f,true);
  assert.equal(p.variables[0].initial,0);
});

test("Папка проекта переносится вместе с ресурсами без абсолютных путей", () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"istoriya-portable-"));
  try {
    const p=createProject(); const source="data:image/png;base64,AQID";
    p.resources.push({id:"r",source});
    const file=path.join(dir,"first","project.vnproject");
    writeFolderProject(p,file,dir);
    const saved=JSON.parse(fs.readFileSync(file,"utf8")); assert.match(saved.resources[0].source,/^\.\/assets\//);
    fs.renameSync(path.join(dir,"first"),path.join(dir,"moved"));
    const loaded=readFolderProject(path.join(dir,"moved","project.vnproject"));
    assert.equal(portableProject(loaded,dir).resources[0].source,source);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});

test("Отключение кнопок меню применяется к runtime, галерея независима от настроек", () => {
  const p=createProject();p.ui.mainMenuButtons.preferences=false;
  const result=compilerInternals.customizeScreens(p,'        textbutton _("Preferences") action ShowMenu("preferences")\n');
  assert.doesNotMatch(result,/textbutton.*preferences/);
  assert.match(result,/istoriya_gallery/);
});
