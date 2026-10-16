import test from 'node:test';import assert from 'node:assert/strict';
import {canvasScale,fitCanvasView,zoomCanvasView,resizeCanvasView,panCanvasView,pointerPanView,focusCanvasView,canvasLayerBounds} from '../src/domain/canvasViewport.js';
const resolution={width:1920,height:1080},bounds={width:800,height:450},close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('fit uses the actual frame and a constant screen margin at narrow, portrait and 4K sizes',()=>{
 for(const viewport of [bounds,{width:374,height:190},{width:800,height:900},{width:3840,height:2160}])for(const size of [resolution,{width:1080,height:1920},{width:7680,height:4320}]){const v=fitCanvasView(viewport,size);assert.ok(size.width*v.scale<=viewport.width-47);assert.ok(size.height*v.scale<=viewport.height-47);close(v.x*2+size.width*v.scale,viewport.width);close(v.y*2+size.height*v.scale,viewport.height);assert.equal(v.mode,'fit');}
 assert.equal(canvasScale(100),8);assert.equal(canvasScale(-1),.01);assert.equal(canvasScale(NaN),1);
});
test('cursor-anchored zoom is invariant, 100 percent is native pixel scale, and both limits keep the anchor',()=>{
 const initial=fitCanvasView(bounds,resolution),anchor={x:123,y:318},world={x:(anchor.x-initial.x)/initial.scale,y:(anchor.y-initial.y)/initial.scale};
 for(const scale of [.01,1,2,8,100]){const next=zoomCanvasView(initial,scale,anchor);close(next.x+world.x*next.scale,anchor.x);close(next.y+world.y*next.scale,anchor.y);assert.equal(next.mode,'manual');}assert.equal(zoomCanvasView(initial,1,anchor).scale,1);
});
test('fit adapts to panel resize while manual view keeps the same world center and scale',()=>{
 const initial=fitCanvasView(bounds,resolution),nextBounds={width:400,height:700};assert.deepEqual(resizeCanvasView(initial,bounds,nextBounds,resolution),fitCanvasView(nextBounds,resolution));
 const manual=panCanvasView(zoomCanvasView(initial,1,{x:200,y:100}),-100,300),next=resizeCanvasView(manual,bounds,nextBounds,resolution);assert.equal(next.scale,1);close((bounds.width/2-manual.x)/manual.scale,(nextBounds.width/2-next.x)/next.scale);close((bounds.height/2-manual.y)/manual.scale,(nextBounds.height/2-next.y)/next.scale);
});
test('pan has no document-boundary clamp and never switches to a second pointer',()=>{
 const view=fitCanvasView(bounds,resolution),gesture={view,pointerId:4,clientX:100,clientY:200};assert.equal(pointerPanView(gesture,{pointerId:5,clientX:800,clientY:700}),null);assert.equal(pointerPanView(null,{pointerId:4}),null);
 assert.deepEqual(pointerPanView(gesture,{pointerId:4,clientX:-2000,clientY:3000}),panCanvasView(view,-2100,2800));assert.deepEqual(view,fitCanvasView(bounds,resolution));
});
test('focus finds a rotated negative/outside prop, respects bottom and center pivots and does not mutate the layer',()=>{
 const layer={kind:'image',x:-160,y:220,width:20,height:35,scale:130,rotation:30},copy=structuredClone(layer),rect=canvasLayerBounds(layer,resolution),view=focusCanvasView(zoomCanvasView(fitCanvasView(bounds,resolution),1,{x:0,y:0}),rect,bounds);
 close(view.x+(rect.left+rect.right)/2*view.scale,bounds.width/2);close(view.y+(rect.top+rect.bottom)/2*view.scale,bounds.height/2);assert.ok((rect.right-rect.left)*view.scale<=bounds.width-64+1e-8);assert.ok((rect.bottom-rect.top)*view.scale<=bounds.height-64+1e-8);assert.deepEqual(layer,copy);
 assert.deepEqual(canvasLayerBounds({kind:'background',x:50,y:50,width:100,height:100,scale:100},resolution),{left:0,top:0,right:1920,bottom:1080});
 const hero=canvasLayerBounds({x:50,y:100,scale:100},resolution);close(hero.bottom,1080);close(hero.right-hero.left,1920*.34);
 assert.equal(canvasLayerBounds(null,resolution),null);assert.equal(focusCanvasView(view,{left:NaN},bounds),view);
});
