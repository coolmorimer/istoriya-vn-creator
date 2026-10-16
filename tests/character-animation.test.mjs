import test from 'node:test';
import assert from 'node:assert/strict';
import {CHARACTER_ANIMATIONS,animationSettings,animationPlan,animationEnd,animationSample,animationKeyframes,renpyAnimationLines} from '../runtime/character-animation.mjs';
import {createProject} from '../src/domain/projectFactory.js';
import {storyboardFrames} from '../src/domain/storyboard.js';
import {initialPreview,advancePreview} from '../src/domain/preview.js';
import {timelineFrame} from '../src/domain/timeline.js';
import {visualLayerEdits} from '../src/domain/visualLayers.js';
import {compilerInternals} from '../runtime/compiler.mjs';
const base={id:'hero-layer',characterId:'hero',spriteId:'worried',x:-20,y:120,scale:145,rotation:17,opacity:65,flip:true,visible:true};
function fixture(name='pulse'){
 const p=createProject(),s=Object.values(p.scenes)[0];p.characters=[{id:'hero',name:'Герой',sprites:[]}];s.characters=[{...base}];
 s.actions=[{id:'before',type:'narration',text:'Before'},{id:'animate',type:'characterAnimation',characterId:'hero',animation:name,duration:.6,intensity:1.2},{id:'after',type:'narration',text:'After'},{id:'move',type:'moveCharacter',characterId:'hero',x:80,y:110},{id:'last',type:'narration',text:'Last'}];return {p,s};
}
test('all eight presets preserve actor state and use the authored zoom, never the screen transition',()=>{
 for(const name of CHARACTER_ANIMATIONS){
  const {p,s}=fixture(name),action=s.actions[1],end=animationEnd(base,action),lines=renpyAnimationLines(base,action).join('\n');
  for(const key of ['x','y','rotation','opacity','flip','spriteId'])assert.equal(end[key],base[key],name+':'+key);
  assert.match(lines,/xpos -0.2 ypos 1.2/);assert.match(lines,/rotate 17 alpha 0.65 xzoom -1/);assert.match(lines,/rotate_pad False transform_anchor True/);
  const script=compilerInternals.createScript(p,new Map(),new Map(),new Map([['hero:worried','worried.png'],['hero:default','neutral.png']]));
  assert.doesNotMatch(script,/hpunch|vpunch|neutral.png/);assert.match(script,/pause 0.6/);assert.match(script,/zoom=1.45/);
  assert.equal(animationPlan(action).at(-1).dx,0);assert.equal(animationPlan(action).at(-1).dy,0);
  assert.equal(animationKeyframes(base,action).length,121);
 }
});
test('storyboard, sequential preview and timed seek agree on permanent animation scale and emotion',()=>{
 for(const name of CHARACTER_ANIMATIONS){
  const {p,s}=fixture(name),end=animationEnd(base,s.actions[1]);
  const frame=storyboardFrames(p,s)[2].frame;assert.equal(frame.layers[0].scale,end.scale);
  let state=advancePreview(p,initialPreview(p,s.id));state=advancePreview(p,state);
  assert.equal(state.waiting.type,'pause');assert.equal(state.displayText.text,'Before');assert.equal(state.animations.hero.base.scale,145);
  state=advancePreview(p,state);assert.equal(state.waiting.text,'After');assert.equal(state.layers[0].scale,end.scale);assert.equal(state.layers[0].spriteId,'worried');
  state=advancePreview(p,state);assert.equal(state.layers[0].x,80);assert.equal(state.layers[0].scale,end.scale);assert.equal(state.animations.hero,undefined);
  s.actions=[{...s.actions[1],timeline:{start:0,duration:.6}}];assert.ok(Math.abs(timelineFrame(p,s,1).layers[0].scale-end.scale)<1e-6);
 }
});
test('editing the post-animation scale compensates inherited multipliers; hidden actors stay hidden',()=>{
 const {p,s}=fixture('stepForward');const layer=storyboardFrames(p,s)[2].frame.layers[0];
 assert.ok(Math.abs(visualLayerEdits(layer,{scale:200})[0].patch.scale*layer.animationScaleMultiplier-200)<1e-6);
 const edit=visualLayerEdits(layer,{scale:200})[0];Object.assign(s.characters[0],edit.patch);assert.ok(Math.abs(storyboardFrames(p,s)[2].frame.layers[0].scale-200)<1e-6);
 s.characters[0].visible=false;let state=advancePreview(p,initialPreview(p,s.id));state=advancePreview(p,state);assert.equal(state.waiting.text,'After');assert.equal(state.animations.hero,undefined);
});
test('preset boundaries and cosine sampling are finite and settle at the planned endpoint',()=>{
 assert.deepEqual(animationSettings({duration:-3,intensity:99,animation:'invalid'}),{name:'shake',duration:.1,intensity:3});
 assert.equal(animationSettings({duration:Infinity,intensity:NaN}).duration,.5);
 assert.equal(animationSample({animation:'jump'},.5).dy,-90);
 assert.equal(animationSample({animation:'pulse'},1).zoom,1);
 assert.equal(animationSample({animation:'stepForward'},1).zoom,1.12);
});
