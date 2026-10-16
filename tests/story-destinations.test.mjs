import test from 'node:test';
import assert from 'node:assert/strict';
import {destinationValue,destinationPatch,destinationKey,destinationLabel,storyDestinations,filterDestinations,destinationCursor,resolveAuthorDestination} from '../src/domain/storyDestinations.js';
import {createProject} from '../src/domain/projectFactory.js';
import {useProjectStore as store} from '../src/store/projectStore.js';
import {initialPreview,advancePreview} from '../src/domain/preview.js';
import {connectScenes,sceneExits,updateExit} from '../src/domain/storyGraph.js';
import {compilerInternals} from '../runtime/compiler.mjs';
function fixture(){const p=createProject();p.scenes={three:{id:'three',number:'2.2',title:'Финал',description:'Чай у огня',characters:[],actions:[{id:'three_text',type:'narration',text:'THREE'},{id:'three_end',type:'end'}]},two:{id:'two',number:'2.1',title:'Второй вход',characters:[],actions:[{id:'two_text',type:'narration',text:'TWO'},{id:'two_end',type:'end'}]},one:{id:'one',number:'1.1',title:'Первый вход',characters:[],actions:[{id:'one_text',type:'narration',text:'ONE'},{id:'one_end',type:'end'}]}};p.chapters=[{id:'a',title:'Берёзовая роща',scenes:['one']},{id:'b',title:'Зимний город',scenes:['two','three'],entrySceneId:'two'},{id:'empty',title:'Пустая глава',scenes:[]}];return p;}

test('destinations follow chapter/scene order rather than object insertion, keep distinct kinds and append orphans',()=>{
 const p=fixture();p.scenes.orphan={id:'orphan',title:'Вне глав'};p.chapters[1].scenes.push('one','missing');const before=structuredClone(p),entries=storyDestinations(p);
 assert.deepEqual(entries.map(e=>e.chapterId||e.sceneId),['a','one','b','two','three','empty','orphan']);assert.equal(entries[5].disabled,true);assert.equal(entries.at(-1).detail,'Вне глав');assert.deepEqual(p,before);
 assert.notEqual(destinationKey({sceneId:'chapter:a'}),destinationKey({chapterId:'a'}));
});
test('search matches case, ё/е, scene number, chapter and description without requiring an exact title',()=>{
 const entries=storyDestinations(fixture());assert.equal(filterDestinations(entries,'БЕРЕЗОВАЯ 1.1').find(e=>e.sceneId)?.sceneId,'one');assert.equal(filterDestinations(entries,'город ФИНАЛ 2.2')[0].sceneId,'three');assert.equal(filterDestinations(entries,'чай огня')[0].sceneId,'three');assert.deepEqual(filterDestinations(entries,'not found'),[]);
});
test('entry/source selection is confined to its chapter and does not offer chapter targets or unrelated orphan scenes',()=>{
 const p=fixture();assert.deepEqual(storyDestinations(p,{allowChapters:false,withinChapterId:'b'}).map(e=>e.sceneId),['two','three']);assert.deepEqual(storyDestinations(p,{withinChapterId:'missing'}),[]);assert.deepEqual(storyDestinations(p,{allowChapters:false}).map(e=>e.sceneId),['one','two','three']);
});

test('a complete chapter-name phrase ranks ahead of accidental word matches in other scene numbers',()=>{
 const p=fixture();p.chapters=[{id:'first',title:'Глава 1',scenes:['one']},{id:'tenth',title:'Глава 10',scenes:['two','three']}];p.scenes.one.number='1.10';
 const results=filterDestinations(storyDestinations(p),' ГЛАВА   10 ');assert.equal(results[0].chapterId,'tenth');assert.deepEqual(results.slice(1,3).map(e=>e.sceneId),['two','three']);assert.equal(results.at(-1).sceneId,'one');
});

test('inherited object properties do not masquerade as valid scenes or chapter entries',()=>{
 const p=fixture();assert.equal(destinationLabel(p,{sceneId:'constructor'}).missing,true);assert.throws(()=>resolveAuthorDestination(p,{sceneId:'constructor'}),/не найдена/);p.chapters.push({id:'broken',title:'Ошибка',scenes:['constructor']});assert.equal(storyDestinations(p).find(e=>e.chapterId==='broken').disabled,true);
 p.scenes.constructor={id:'constructor',title:'Настоящая сцена'};assert.equal(destinationLabel(p,{sceneId:'constructor'}).missing,false);assert.equal(resolveAuthorDestination(p,{sceneId:'constructor'}).sceneId,'constructor');
});
test('missing/current empty destinations are described without silently choosing or modifying another target',()=>{
 const p=fixture();assert.equal(destinationLabel(p,{chapterId:'b'}).text,'Глава · Зимний город');assert.equal(destinationLabel(p,{chapterId:'empty'}).missing,true);assert.equal(destinationLabel(p,{sceneId:'missing'}).missing,true);assert.equal(destinationLabel(p,{chapterId:'missing',sceneId:'one'}).missing,true);assert.equal(destinationLabel(p,{},'Остаться').text,'Остаться');
 assert.throws(()=>resolveAuthorDestination(p,{chapterId:'empty'}),/входную/);assert.throws(()=>resolveAuthorDestination(p,{sceneId:'missing'}),/не найдена/);
});
test('keyboard cursor skips disabled chapters and reaches the final result across a large list',()=>{
 const entries=Array.from({length:5001},(_,i)=>({disabled:i===0||i===2500}));assert.equal(destinationCursor(entries,0,'ArrowDown'),1);assert.equal(destinationCursor(entries,1,'ArrowUp'),1);assert.equal(destinationCursor(entries,2499,'ArrowDown'),2501);assert.equal(destinationCursor(entries,1,'End'),5000);assert.equal(destinationCursor(entries,5000,'Home'),1);assert.equal(destinationCursor(entries,1,'PageDown'),9);assert.equal(destinationCursor(entries,5000,'ArrowDown'),5000);assert.equal(destinationCursor([{disabled:true}],0,'End'),-1);assert.equal(destinationCursor([],0,'Home'),-1);
});
test('inspector destination changes clear stale chapter overrides for jump and both condition branches with real Undo/Redo',()=>{
 const p=fixture();p.flags=[{id:'gate',name:'Доступ',initial:false}];p.scenes.one.actions=[{id:'jump',type:'jump',targetChapterId:'b',targetSceneId:'two'}];
 store.setState({project:p,activeSceneId:'one',activeActionId:'jump',past:[],future:[],recovery:null});store.getState().updateAction('one','jump',destinationPatch({sceneId:'three'}));
 let current=store.getState().project;assert.equal(current.scenes.one.actions[0].targetChapterId,null);assert.equal(advancePreview(current,initialPreview(current,'one')).waiting.text,'THREE');store.getState().undo();current=store.getState().project;assert.equal(advancePreview(current,initialPreview(current,'one')).waiting.text,'TWO');store.getState().redo();current=store.getState().project;assert.equal(advancePreview(current,initialPreview(current,'one')).waiting.text,'THREE');
 const condition={type:'condition',condition:{flagId:'gate',value:true},trueChapterId:'b',trueSceneId:'two',falseChapterId:'b',falseSceneId:'two'};
 const edited={...condition,...destinationPatch({sceneId:'three'},'falseSceneId')};assert.equal(edited.trueChapterId,'b');assert.equal(edited.falseChapterId,null);assert.deepEqual(destinationValue(edited,'falseSceneId'),{sceneId:'three',chapterId:null});
 const scenario=fixture();scenario.flags=p.flags;scenario.scenes.one.actions=[{id:'check',...edited}];assert.equal(advancePreview(scenario,initialPreview(scenario,'one')).waiting.text,'THREE');assert.match(compilerInternals.createScript(scenario,new Map(),new Map()),/jump scene_three/);
});
test('typed map destinations distinguish a scene whose ID begins chapter: and preserve legacy chapter tokens',()=>{
 const p=fixture();p.scenes['chapter:a']={id:'chapter:a',title:'Literal scene',characters:[],actions:[]};p.chapters[0].scenes.push('chapter:a');connectScenes(p,'one',{sceneId:'chapter:a'});assert.equal(p.scenes.one.actions[1].targetSceneId,'chapter:a');
 let edge=sceneExits(p,'one')[0];updateExit(p,edge,{to:{chapterId:'b'}});assert.equal(p.scenes.one.actions[1].targetChapterId,'b');edge=sceneExits(p,'one')[0];updateExit(p,edge,{to:{sceneId:'chapter:a'}});assert.equal(p.scenes.one.actions[1].targetChapterId,undefined);assert.equal(p.scenes.one.actions[1].targetSceneId,'chapter:a');assert.equal(resolveAuthorDestination(p,'chapter:b').sceneId,'two');
 const before=structuredClone(p);assert.throws(()=>updateExit(p,sceneExits(p,'one')[0],{to:{chapterId:'empty'}}),/входную/);assert.deepEqual(p,before);
});
test('chapter choices retain chapter identity, and moving its entry changes preview, map and exported target together',()=>{
 const p=fixture();p.scenes.one.actions=[{id:'jump',type:'jump',...destinationPatch({chapterId:'b'})}];assert.deepEqual(destinationValue(p.scenes.one.actions[0]),{sceneId:null,chapterId:'b'});p.chapters[1].entrySceneId='three';assert.equal(advancePreview(p,initialPreview(p,'one')).waiting.text,'THREE');assert.equal(sceneExits(p,'one')[0].to,'three');assert.match(compilerInternals.createScript(p,new Map(),new Map()).split('label scene_one:\n')[1].split('\nlabel ')[0],/jump scene_three/);
});
