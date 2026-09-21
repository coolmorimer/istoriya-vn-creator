import test from 'node:test';
import assert from 'node:assert/strict';
import { canvasTransform } from '../src/domain/canvasTransform.js';
import { timelineFrame } from '../src/domain/timeline.js';
import { createProject } from '../src/domain/projectFactory.js';
import { compilerInternals } from '../runtime/compiler.mjs';
test('Перетаскивание сохраняет точку захвата и учитывает размер холста',()=>{
  const g={mode:'move',x:50,y:100,scale:100,clientX:400,clientY:300,width:800,height:400};
  assert.deepEqual(canvasTransform(g,400,300),{x:50,y:100,scale:100});
  assert.deepEqual(canvasTransform(g,480,260),{x:60,y:90,scale:100});
});
test('Размер меняется пропорционально, оставаясь в безопасных пределах',()=>{
  const g={mode:'resize',x:50,y:100,scale:100,anchorX:0,anchorY:0,distance:100};
  assert.equal(canvasTransform(g,0,150).scale,150);
  assert.equal(canvasTransform(g,0,0).scale,10);
});
test('Трансформация клипа одинакова на холсте и в RenPy',()=>{
  const p=createProject({title:'Transform'}),s=Object.values(p.scenes)[0];
  p.characters=[{id:'hero',name:'Hero',color:'#ffffff'}];
  s.actions=[{id:'show',type:'showCharacter',characterId:'hero',x:30,y:80,scale:140,timeline:{start:0,duration:5}}];
  const layer=timelineFrame(p,s,2).layers[0];
  assert.equal(layer.x,30);assert.equal(layer.y,80);assert.equal(layer.scale,140);assert.equal(layer.sourceActionId,'show');
  const script=compilerInternals.createScript(p,new Map(),new Map(),new Map([['hero:default','hero.png']]));
  assert.match(script,/xpos=0.3, ypos=0.8, xanchor=0.5, yanchor=1.0, zoom=1.4/);
});
