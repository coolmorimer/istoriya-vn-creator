import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/domain/projectFactory.js';
import { connectScenes,sceneExits } from '../src/domain/storyGraph.js';
import { resolveStoryProject } from '../runtime/story-routing.mjs';
import { compilerInternals } from '../runtime/compiler.mjs';
import { initialPreview,advancePreview } from '../src/domain/preview.js';
import { timelineLayout,waitsForPlayer } from '../src/domain/timeline.js';

test('Переход в главу следует новой входной сцене в карте, предпросмотре и RenPy',()=>{
 const p=createProject({title:'Тест'}),first=Object.keys(p.scenes)[0];
 p.chapters.push({id:'other',title:'Другая линия',scenes:['b','c'],entrySceneId:'b'});
 for(const id of ['b','c'])p.scenes[id]={id,title:id,characters:[],actions:[{id:'say'+id,type:'narration',text:id}]};
 connectScenes(p,first,'chapter:other');
 p.chapters[1].entrySceneId='c';
 assert.equal(sceneExits(p,first)[0].to,'c');
 assert.equal(resolveStoryProject(p).scenes[first].actions[0].targetSceneId,'c');
 const state=advancePreview(p,initialPreview(p,first));
 assert.equal(state.waiting.text,'c');
 assert.match(compilerInternals.createScript(p,new Map()),/jump scene_c/);
});
test('Шрифт, обводка, тень и скорость текста попадают в RenPy',()=>{
 const p=createProject({title:'Текст'}),id=Object.keys(p.scenes)[0];
 p.ui.textStyle={font:'font1',size:40,color:'#ff9900',outline:2,outlineColor:'#000000',speed:60};
 p.characters=[{id:'hero',name:'Герой',color:'#ffffff',sprites:[]}];
 p.scenes[id].actions=[{id:'say',type:'dialogue',speakerId:'hero',text:'Проверка',textStyle:{bold:true,italic:true,shadow:true}},{id:'wait',type:'pause',duration:2.3}];
 assert.ok(compilerInternals.usedResourceIds(p).has('font1'));
 const script=compilerInternals.createScript(p,new Map(),new Map([['font1','images/font.ttf']]));
 for(const value of ['what_font="images/font.ttf"','what_size=40','what_bold=True','what_italic=True','what_slow_cps=60','pause 2.3'])assert.ok(script.includes(value),value);
});
test('Шкала различает ожидание игрока и длительность анимации',()=>{
 const rows=timelineLayout([{id:'a',type:'narration'},{id:'b',type:'moveCharacter',duration:3},{id:'c',type:'music',fadeIn:2}]);
 assert.equal(rows[0].duration,3);assert.equal(waitsForPlayer(rows[0].action),true);
 assert.equal(rows[1].duration,3);assert.equal(rows[2].duration,5);assert.ok(rows[2].left>rows[1].left);
});
