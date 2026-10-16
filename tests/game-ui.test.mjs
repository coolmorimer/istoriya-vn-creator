import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject} from '../src/domain/projectFactory.js';
import {defaultGameUi,gameUi,pixelRect,uiLayoutProblems,uiResourceIds,assertGameUiShape,uiResourceReferences,clearUiResource} from '../runtime/game-ui.mjs';
import {authorFont} from '../src/domain/fontAuthoring.js';
import {gameUiScript} from '../runtime/game-ui-script.mjs';
import {authorUi} from '../src/domain/uiAuthoring.js';
import {assertProjectShape} from '../runtime/project-format.mjs';
import {compilerInternals} from '../runtime/compiler.mjs';
const quote=JSON.stringify;
test('visual UI defaults fit landscape and portrait games; old projects retain standard screens',()=>{
 for(const resolution of [{width:1920,height:1080},{width:1080,height:1920}]){const p=createProject({resolution});assert.equal(p.schemaVersion,6);assert.deepEqual(uiLayoutProblems(p),[]);assert.equal(gameUi(p).menu.enabled,true);assert.deepEqual(pixelRect({x:10,y:20,w:30,h:40},resolution.width,resolution.height),{x:Math.round(resolution.width*.1),y:Math.round(resolution.height*.2),w:Math.round(resolution.width*.3),h:Math.round(resolution.height*.4)});}
 const old=createProject();delete old.ui.layout;old.schemaVersion=4;assertProjectShape(old);assert.equal(gameUi(old).menu.enabled,false);assert.doesNotMatch(gameUiScript(old,new Map(),{quote}),/screen main_menu|screen say|screen choice/);
});
test('UI import checks structure, cycles, impossible bounds, unknown actions and missing images/fonts',()=>{
 const p=createProject();p.ui.layout.dialogue.text.rect.x=NaN;assert.throws(()=>assertProjectShape(p),/область/);
 for(const invalid of [{version:1,menu:{buttons:[]}}, {version:1,dialogue:{window:null}}, {version:1,choice:{enabled:'false'}}])assert.throws(()=>assertGameUiShape(invalid));
 const cycle={version:1};cycle.self=cycle;assert.throws(()=>assertGameUiShape(cycle));
 const q=createProject();q.ui.layout.menu.buttons[0].rect.x=99;q.ui.layout.menu.buttons[0].font='missing';q.ui.layout.menu.buttons[0].idleResourceId='gone';assert.ok(uiLayoutProblems(q).length>=3);assert.throws(()=>gameUiScript(q,new Map(),{quote}));q.ui.layout.menu.buttons[0].id='exec';assert.throws(()=>assertGameUiShape(q.ui.layout),/список кнопок/);
});
test('UI image authoring is atomic, reuses media, guards stale projects and preserves other states',()=>{
 const p=createProject(),image={source:'data:image/png;base64,AQID',mime:'image/png',name:'Кнопка'};
 authorUi(p,{projectId:p.id,screen:'menu',target:'button:start',patch:{label:'Начать'},resource:image,imageKey:'idleResourceId'},'skin');
 authorUi(p,{projectId:p.id,screen:'menu',target:'button:start',patch:{},resource:image,imageKey:'hoverResourceId'},'duplicate');
 assert.equal(p.resources.length,1);assert.equal(p.ui.layout.menu.buttons[0].idleResourceId,'skin');assert.equal(p.ui.layout.menu.buttons[0].hoverResourceId,'skin');
 const before=JSON.stringify(p);assert.throws(()=>authorUi(p,{projectId:'another',screen:'menu',target:'button:start',patch:{}},'x'),/другой проект/);assert.equal(JSON.stringify(p),before);
 assert.ok(uiResourceIds(p).has('skin'));assert.ok(compilerInternals.usedResourceIds(p).has('skin'));
});
test('moving a dialogue window carries independent zones; disabling linkage preserves their coordinates',()=>{
 const p=createProject(),window=p.ui.layout.dialogue.window,before=p.ui.layout.dialogue.text.rect.y;
 authorUi(p,{projectId:p.id,screen:'dialogue',target:'window',patch:{rect:{...window.rect,y:60}}},'unused');assert.equal(p.ui.layout.dialogue.text.rect.y,before-12);
 authorUi(p,{projectId:p.id,screen:'dialogue',target:'window',patch:{moveWithZones:false}},'unused');const fixed=p.ui.layout.dialogue.text.rect.y;
 authorUi(p,{projectId:p.id,screen:'dialogue',target:'window',patch:{rect:{...window.rect,y:50}}},'unused');assert.equal(p.ui.layout.dialogue.text.rect.y,fixed);
});
test('UI compiler emits real screens/actions/states and literal geometry, never author code',()=>{
 const p=createProject();p.resources=[{id:'skin',mime:'image/png',source:'data:x'}];p.ui.layout.menu.buttons[0].idleResourceId='skin';p.ui.layout.menu.buttons[0].label='Начать [опасный_текст]';p.ui.layout.menu.buttons[1].visible=true;
 const script=gameUiScript(p,new Map([['skin','assets/skin.png']]),{quote});
 assert.match(script,/screen main_menu/);assert.match(script,/action Start\(\)/);assert.match(script,/action Function\(_istoriya_continue_game\)/);assert.match(script,/sensitive renpy.newest_slot\(\) is not None/);assert.match(script,/_istoriya_pressed == "start"/);assert.match(script,/substitute False/);assert.match(script,/screen say\(who, what\)/);assert.match(script,/id "what"/);assert.match(script,/action HideInterface\(\)/);assert.match(script,/screen choice\(items\)/);assert.match(script,/screen quick_menu/);assert.match(script,/action ShowMenu\("save"\)/);
 assert.match(script,/xanchor 0\n\s+yanchor 0/);assert.match(script,/Начать \[опасный_текст\]/);assert.equal(defaultGameUi(p).dialogue.enabled,false);
});
test('UI edits and imported skins survive Undo/Redo without changing scene history or losing resources',async()=>{
 globalThis.localStorage={getItem:()=>null,setItem(){},removeItem(){}};const {useProjectStore:store}=await import('../src/store/projectStore.js');const p=createProject();store.setState({project:p,past:[],future:[],saveState:'saved',activeSceneId:Object.keys(p.scenes)[0]});
 store.getState().editUi({projectId:p.id,screen:'menu',target:'button:start',patch:{label:'Играть'},resource:{source:'data:image/png;base64,AQID',mime:'image/png',name:'Кнопка'},imageKey:'idleResourceId'});
 assert.equal(store.getState().project.resources.length,1);store.getState().undo();assert.equal(store.getState().project.resources.length,0);assert.equal(store.getState().project.ui.layout.menu.buttons[0].label,'Новая игра');store.getState().redo();assert.equal(store.getState().project.ui.layout.menu.buttons[0].label,'Играть');assert.equal(Object.values(store.getState().project.scenes)[0].actions.length,0);
});
test('font import reuses media, guards stale targets and remains one Undo transaction',async()=>{
 const {useProjectStore:store}=await import('../src/store/projectStore.js');const p=createProject(),resource={name:'Шрифт',mime:'font/ttf',source:'data:font/ttf;base64,AQID'};store.setState({project:p,past:[],future:[],saveState:'saved'});
 store.getState().attachFont({projectId:p.id,target:{kind:'layout',screen:'menu',elementId:'button:start'},resource});const first=store.getState().project.resources[0].id;assert.equal(store.getState().project.ui.layout.menu.buttons[0].font,first);store.getState().undo();assert.equal(store.getState().project.resources.length,0);store.getState().redo();assert.equal(store.getState().project.resources[0].id,first);
 const current=structuredClone(store.getState().project);authorFont(current,{projectId:p.id,target:{kind:'default'},resource},'duplicate');assert.equal(current.resources.length,1);assert.equal(current.ui.textStyle.font,first);
 assert.throws(()=>authorFont(current,{projectId:'stale',resource},'x'),/другой проект/);assert.throws(()=>authorFont(current,{projectId:p.id,target:{kind:'action',sceneId:'missing',actionId:'missing'},resource},'x'),/удалена/);
});
test('UI resource references navigate to screens and deletion clears images and fonts',()=>{
 const p=createProject();p.ui.layout.menu.buttons[0].idleResourceId='skin';p.ui.layout.menu.buttons[0].hoverResourceId='skin';p.ui.layout.choice.button.font='font';p.ui.textStyle={font:'font'};Object.values(p.scenes)[0].actions.push({id:'line',type:'narration',text:'Текст',textStyle:{font:'font',size:40}});
 assert.equal(uiResourceReferences(p,'skin').length,2);assert.ok(uiResourceReferences(p,'font').some(r=>r.screen==='choice'&&r.target==='screen'));
 clearUiResource(p,'skin');clearUiResource(p,'font');assert.equal(p.ui.layout.menu.buttons[0].idleResourceId,null);assert.equal(p.ui.layout.choice.button.font,'DejaVuSans.ttf');assert.equal(p.ui.textStyle.font,'DejaVuSans.ttf');assert.deepEqual(Object.values(p.scenes)[0].actions[0].textStyle,{size:40});assert.deepEqual(uiResourceReferences(p,'font'),[]);
});
test('editing a partially imported screen materializes and enables the actual screen',()=>{
 const p=createProject();p.ui.layout={version:1,menu:{enabled:false,title:{visible:false}}};authorUi(p,{projectId:p.id,screen:'menu',target:'button:start',patch:{label:'Играть'}},'unused');assert.equal(p.ui.layout.menu.enabled,true);assert.equal(gameUi(p).menu.buttons[0].label,'Играть');assert.deepEqual(uiLayoutProblems(p),[]);
});
