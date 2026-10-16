import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject} from '../src/domain/projectFactory.js';
import {sceneCharacterLayers,scenePaintOrder,layerZOrder} from '../runtime/visual-order.mjs';
import {sceneImages} from '../runtime/image-layers.mjs';
import {storyboardFrames} from '../src/domain/storyboard.js';
import {timelineFrame} from '../src/domain/timeline.js';
import {initialPreview,advancePreview} from '../src/domain/preview.js';
import {compilerInternals} from '../runtime/compiler.mjs';

function fixture() {
 const p=createProject(),s=Object.values(p.scenes)[0];
 p.resources=[{id:'cg',category:'cg',source:'cg.png'},{id:'bg',category:'background',source:'bg.png'}];
 p.characters=['a','b'].map(id=>({id,name:id}));
 s.characters=[{id:'a-layer',characterId:'a'},{id:'b-layer',characterId:'b',zOrder:-50}];
 s.images=[{id:'behind',zOrder:-150},{id:'equal',zOrder:10},{id:'front',zOrder:1e15}];
 return {p,s};
}
test('integer layer order and compact CSS ranks agree above and below the background',()=>{
 const {s}=fixture(),layers=sceneCharacterLayers(s),images=sceneImages(s),order=scenePaintOrder(s,layers,images);
 assert.equal(layers[0].zOrder,10);assert.equal(layers[1].zOrder,-50);
 assert.equal(order.images.get('behind'),1);assert.equal(order.background,2);
 assert.equal(order.characters.get('b'),3);assert.equal(order.characters.get('a'),4);
 assert.equal(order.images.get('equal'),5);assert.equal(order.images.get('front'),6);
 assert.equal(layerZOrder('2.6'),3);assert.equal(layerZOrder(null,11),11);assert.equal(layerZOrder(Infinity),10);
 assert.equal(s.characters[0].zOrder,undefined,'render defaults never mutate the project');
});
test('show, repeat, changed zorder and hide/re-show preserve native tie ordering in all snapshots',()=>{
 const {p,s}=fixture();s.characters=[];
 s.actions=[{id:'show',type:'showCharacter',characterId:'a',zOrder:10},{id:'one',type:'narration',text:'one'},
  {id:'again',type:'showCharacter',characterId:'a',zOrder:10},{id:'two',type:'narration',text:'two'},
  {id:'hide',type:'hideCharacter',characterId:'a'},{id:'show2',type:'showCharacter',characterId:'a',zOrder:-50},{id:'three',type:'narration',text:'three'}];
 const frames=storyboardFrames(p,s);let preview=initialPreview(p,s.id);
 for(const [i,text] of [[1,'one'],[3,'two'],[6,'three']]) {
  preview=advancePreview(p,preview);assert.equal(preview.waiting.text,text);
  assert.equal(preview.layers[0].zOrder,frames[i].frame.layers[0].zOrder);
  assert.equal(preview.layers[0]._stackOrder,frames[i].frame.layers[0]._stackOrder);
 }
 assert.equal(frames[1].frame.layers[0]._stackOrder,frames[3].frame.layers[0]._stackOrder);
 const order=scenePaintOrder(s,frames[1].frame.layers,sceneImages(s));
 assert.ok(order.characters.get('a')>order.images.get('equal'),'new show is above older equal-z props');
 s.timelineEnabled=true;s.actions[0].timeline={start:0,duration:5};
 assert.equal(timelineFrame(p,s,.5).layers[0].zOrder,10);
});
test('CG has a fitted dedicated layer, clears at scene entry and legacy background clear only',()=>{
 const {p,s}=fixture();s.characters=[];s.images=[];
 s.actions=[{id:'cg',type:'showCG',assetId:'cg',transition:'none'},
  {id:'text1',type:'narration',text:'cg'},{id:'keep',type:'background',assetId:'bg',preserveCharacters:true},
  {id:'text2',type:'narration',text:'kept'},{id:'clear',type:'background',assetId:'bg'},
  {id:'text3',type:'narration',text:'cleared'},{id:'hide',type:'hideCG'}];
 const frames=storyboardFrames(p,s);assert.equal(frames[3].frame.cg,'cg.png');assert.equal(frames[5].frame.cg,null);
 let preview=advancePreview(p,initialPreview(p,s.id));assert.equal(preview.cg,'cg.png');
 preview=advancePreview(p,preview);assert.equal(preview.cg,'cg.png');preview=advancePreview(p,preview);assert.equal(preview.cg,null);
 const script=compilerInternals.createScript(p,new Map(),new Map([['cg','cg.png'],['bg','bg.png']]));
 assert.match(script,/renpy.add_layer\("istoriya_cg_layer", above="master"\)/);
 assert.match(script,/Transform\("cg.png", xysize=\(1920, 1080\), fit="contain"\).*onlayer istoriya_cg_layer/);
 assert.equal((script.match(/scene onlayer istoriya_cg_layer/g)??[]).length,2);
 assert.match(script,/hide istoriya_cg onlayer istoriya_cg_layer/);
});
