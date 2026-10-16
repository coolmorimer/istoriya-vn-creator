import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject} from '../src/domain/projectFactory.js';
import {sceneExits,connectScenes,updateExit,removeExit,exitObject} from '../src/domain/storyGraph.js';
import {initialPreview,advancePreview,interactPreview} from '../src/domain/preview.js';
import {timelineClips} from '../runtime/timeline-model.mjs';
import {validateProject} from '../src/domain/validator.js';
function fixture(){const p=createProject(),s=Object.values(p.scenes)[0];s.id='a';p.scenes={a:s,b:{id:'b',title:'Ветка',characters:[],actions:[{id:'b-text',type:'narration',text:'b'}]},c:{id:'c',title:'Финал',characters:[],actions:[{id:'c-text',type:'narration',text:'c'}]}};p.chapters=[{id:'first',title:'Начало',scenes:['a']},{id:'second',title:'Финал',scenes:['b','c'],entrySceneId:'b'}];p.flags=[{id:'key',name:'Ключ',initial:false}];p.items=[{id:'coin',name:'Монета'}];return p;}
test('map edits conditions and all ID-less choice results on the actual option',()=>{
 const p=fixture();connectScenes(p,'a','b');connectScenes(p,'a','c');const edge=sceneExits(p,'a')[0];
 updateExit(p,edge,{condition:{flagId:'key',value:false},effects:[{kind:'flag',flagId:'key',value:true},{kind:'inventory',itemId:'coin',operation:'add',quantity:2}],prompt:'Куда?',label:'Открыть',to:'chapter:second'});
 const option=exitObject(p,edge);assert.equal(option.targetChapterId,'second');assert.equal(option.effects.length,2);assert.equal(p.scenes.a.actions[0].prompt,'Куда?');
 const selected=advancePreview(p,advancePreview(p,initialPreview(p,'a')),option.id);assert.equal(selected.sceneId,'b');assert.equal(selected.flags.key,true);assert.equal(selected.inventory.coin,2);
 p.chapters[1].entrySceneId='c';assert.equal(sceneExits(p,'a')[0].to,'c');
 updateExit(p,edge,{to:'b'});assert.equal(option.targetChapterId,undefined);assert.equal(option.targetSceneId,'b');
});
test('prop exits are visible, editable and removable without destroying the reaction',()=>{
 const p=fixture(),s=p.scenes.a;s.images=[{id:'door',name:'Дверь',interactions:[{id:'open',label:'Войти',text:'Ответ',once:true,targetChapterId:'second'}]}];s.actions=[{id:'explore',type:'explore'},{id:'end',type:'end'}];
 const edge=sceneExits(p,'a')[0];assert.equal(edge.kind,'prop');assert.equal(edge.to,'b');
 updateExit(p,edge,{label:'Через дверь',condition:{flagId:'key',value:false},effects:[{kind:'flag',flagId:'key',value:true}],to:'c'});
 let state=advancePreview(p,initialPreview(p,'a'));state=interactPreview(p,state,'door','open');assert.equal(state.flags.key,true);
 state=advancePreview(p,state);assert.equal(state.sceneId,'c');
 removeExit(p,sceneExits(p,'a')[0]);const reaction=s.images[0].interactions[0];assert.equal(reaction.text,'Ответ');assert.equal(reaction.once,true);assert.equal(reaction.effects.length,1);assert.equal(reaction.targetSceneId,undefined);assert.equal(reaction.targetChapterId,undefined);assert.deepEqual(sceneExits(p,'a'),[]);
});
test('map appends timed transitions after enabled clips and retains timing when deleting',()=>{
 const p=fixture(),s=p.scenes.a;s.timelineEnabled=true;s.actions=[{id:'later',type:'narration',text:'Сначала текст',timeline:{start:20,duration:4,enabled:true}},{id:'disabled',type:'narration',text:'нет',timeline:{start:300,duration:9,enabled:false}}];
 connectScenes(p,'a','c');assert.equal(s.actions.at(-1).timeline.start,24);assert.equal(timelineClips(s).at(-1).enabled,true);
 const timing={...s.actions.at(-1).timeline};removeExit(p,sceneExits(p,'a')[0]);assert.equal(s.actions.at(-1).type,'end');assert.deepEqual(s.actions.at(-1).timeline,timing);
 const q=fixture();q.scenes.a.timelineEnabled=true;q.scenes.a.actions=[{id:'text',type:'narration',text:'Текст',timeline:{start:5,duration:3}}];removeExit(q,sceneExits(q,'a').find(e=>e.kind==='implicit'));assert.equal(q.scenes.a.actions.at(-1).timeline.start,8);
});
test('stale map edges cannot overwrite a different terminal and branch removal is fail-closed',()=>{
 const p=fixture();connectScenes(p,'a','b');const old=sceneExits(p,'a')[0];p.scenes.a.actions[0]={id:'replacement',type:'jump',targetSceneId:'c'};
 assert.throws(()=>updateExit(p,old,{to:'b'}),/уже изменён/);removeExit(p,old);assert.equal(p.scenes.a.actions[0].targetSceneId,'c');
 p.scenes.a.actions=[{id:'condition',type:'condition',flagId:'key',value:false,trueSceneId:'b',falseSceneId:'c'}];const edge=sceneExits(p,'a')[0];updateExit(p,edge,{condition:null});assert.deepEqual(p.scenes.a.actions[0].condition,{kind:'all',conditions:[]});assert.equal(validateProject(p).valid,false);
});
