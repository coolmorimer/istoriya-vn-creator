import test from 'node:test';
import assert from 'node:assert/strict';
import {renpyFloat,renpyActorTransform} from '../runtime/renpy-transform.mjs';
import {renpyBackground} from '../runtime/background-transform.mjs';
import {compilerInternals} from '../runtime/compiler.mjs';
import {createProject} from '../src/domain/projectFactory.js';
import {imageLayerStyle} from '../runtime/image-layers.mjs';

test('relative coordinates are emitted as floats, including integer percentages outside the frame',()=>{
 assert.equal(renpyFloat(0),'0.0');assert.equal(renpyFloat(1),'1.0');assert.equal(renpyFloat(-1),'-1.0');assert.equal(renpyFloat(2),'2.0');assert.equal(renpyFloat(.25),'0.25');
 assert.throws(()=>renpyFloat(NaN));
 assert.match(renpyActorTransform({x:100,y:200}),/xpos=1.0, ypos=2.0/);
 assert.match(renpyActorTransform({x:-100,y:0}),/xpos=-1.0, ypos=0.0/);
 assert.match(renpyBackground('bg.png',1920,1080,{x:100,y:0}),/xpos=1.0, ypos=0.0/);
});
test('rotation uses tight bounds and a bottom-centre pivot, not diagonal padding',()=>{
 assert.match(renpyActorTransform({rotation:0}),/rotate=0.*rotate_pad=False, transform_anchor=True/);
 assert.match(renpyActorTransform({rotation:37}),/rotate=37.*rotate_pad=False, transform_anchor=True/);
 assert.match(renpyBackground('bg.png',1920,1080,{}),/rotate_pad=False, transform_anchor=True/);
 assert.equal(imageLayerStyle({x:50,y:100,width:50,height:50,scale:100,opacity:100,rotation:37}).transformOrigin,'50% 100%');
});
test('initial heroes, show, movement and props all use the same stable transform',()=>{
 const p=createProject(),s=Object.values(p.scenes)[0];p.characters=[{id:'hero',name:'Hero',sprites:[]}];p.resources=[{id:'r',source:'prop.png'}];
 s.characters=[{id:'layer',characterId:'hero',x:100,y:100}];s.images=[{id:'prop',resourceId:'r',x:200,y:0}];
 s.actions=[{id:'show',type:'showCharacter',characterId:'hero',x:-100,y:200},{id:'move',type:'moveCharacter',characterId:'hero',x:100,y:100}];
 const script=compilerInternals.createScript(p,new Map(),new Map([['r','prop.png']]),new Map([['hero:default','hero.png']]));
 assert.match(script,/xpos=1.0, ypos=1.0/);assert.match(script,/xpos=2.0, ypos=0.0/);assert.match(script,/xpos=-1.0, ypos=2.0/);
 const renderedShows=script.split('\n').filter(line=>line.trim().startsWith('show expression')).join('\n');
 assert.equal((renderedShows.match(/rotate_pad=False/g)??[]).length,4);
});
