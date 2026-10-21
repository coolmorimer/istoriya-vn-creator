import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject} from '../src/domain/projectFactory.js';
import {gameUi,uiElements,uiObject,uiLayoutProblems,assertGameUiShape,uiResourceReferences} from '../runtime/game-ui.mjs';
import {SYSTEM_SCREENS} from '../runtime/system-ui.mjs';
import {authorUi} from '../src/domain/uiAuthoring.js';
import {gameUiScript} from '../runtime/game-ui-script.mjs';
import {assertProjectShape} from '../runtime/project-format.mjs';
test('all eleven screens are editable; old schema5 visual screens keep standard auxiliary menus',()=>{
 const p=createProject();assert.equal(p.schemaVersion,8);assertProjectShape(p);assert.equal(Object.values(gameUi(p)).filter(v=>v?.enabled).length,11);assert.deepEqual(uiLayoutProblems(p),[]);
 const old=structuredClone(p);old.schemaVersion=5;delete old.rpg;old.ui.layout.version=1;for(const [id]of SYSTEM_SCREENS)delete old.ui.layout[id];assertProjectShape(old);for(const [id]of SYSTEM_SCREENS)assert.equal(gameUi(old)[id].enabled,false);assert.equal(gameUi(old).menu.enabled,true);assert.doesNotMatch(gameUiScript(old,new Map(),{quote:JSON.stringify}),/screen save\(|screen preferences\(|screen notify\(/);
});
test('system geometry, styling, resources and typed settings edit actual export data',()=>{
 const p=createProject();authorUi(p,{projectId:p.id,screen:'save',target:'content',patch:{columns:2,rows:3}},'unused');assert.equal(p.ui.layout.save.content.columns,2);
 authorUi(p,{projectId:p.id,screen:'pause',target:'button:save',patch:{label:'Записать прогресс',rect:{x:22,y:20,w:40,h:7}}},'unused');assert.equal(uiObject(p.ui.layout,'pause','button:save').rect.x,22);assert.ok(uiElements(p,'pause').some(e=>e.label==='Записать прогресс'));
 authorUi(p,{projectId:p.id,screen:'gallery',target:'button',patch:{},resource:{name:'Замок',mime:'image/png',source:'data:image/png;base64,AQID'},imageKey:'lockedResourceId'},'lock');assert.ok(uiResourceReferences(p,'lock').some(r=>r.screen==='gallery'&&r.target==='content'));assert.deepEqual(uiLayoutProblems(p),[]);
});
test('bad grids, hidden exit, malformed settings and unknown pause actions fail closed',()=>{
 const p=createProject();p.ui.layout.save.content.columns=0;p.ui.layout.load.content.rows=1.5;p.ui.layout.gallery.content.cardHeight=0;p.ui.layout.preferences.options.music='true';p.ui.layout.history.back.visible=false;p.ui.layout.notify.duration=-1;assert.ok(uiLayoutProblems(p).length>=6);
 p.ui.layout.pause.buttons[0].id='exec';assert.throws(()=>assertGameUiShape(p.ui.layout),/паузы/);assert.throws(()=>gameUiScript(p,new Map(),{quote:JSON.stringify}));
 const q=createProject();q.schemaVersion=5;delete q.rpg;assert.throws(()=>assertProjectShape(q),/формат проекта 6/);
});
test('system screens emit real file actions, preferences, history, gallery unlocks and timed notification',()=>{
 const p=createProject();p.ui.layout.preferences.options.skipAll=false;p.ui.layout.preferences.options.resolution=false;const script=gameUiScript(p,new Map(),{quote:JSON.stringify});
 for(const pattern of [/screen save\(\)/,/screen load\(\)/,/action FileAction\(slot\)/,/FileScreenshot\(slot\)/,/FileJson\(slot, "_game_runtime"/,/FilePage\("auto"\)/,/Preference\("music volume"\)/,/Preference\("skip", "seen"\)/,/for entry in _history_list/,/persistent.istoriya_gallery_unlocked/,/screen notify\(message, duration=None\)/,/action Hide\("notify"\)/,/define _game_menu_screen = "istoriya_pause"/])assert.match(script,pattern);
 assert.doesNotMatch(script,/Preference\("skip", "all"\)/);assert.doesNotMatch(script,/Function\(renpy.set_physical_size/);
 assert.match(script,/text _istoriya_ui_literal\(message\)/);assert.match(script,/vscrollbar_unscrollable "hide"/);
});
