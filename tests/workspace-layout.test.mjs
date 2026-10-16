import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_LAYOUT, LAYOUT_KEY, normalizeLayout, readLayout, saveLayout, layoutWidths, layoutPreset } from '../src/domain/workspaceLayout.js';
test('layout is bounded and ignores invalid persisted values', () => {
  assert.deepEqual(normalizeLayout(null), DEFAULT_LAYOUT);
  assert.equal(normalizeLayout({left:999,right:-8,ratio:0,showLeft:'false'}).left,420);
  assert.equal(normalizeLayout({right:-8}).right,260);
  assert.equal(normalizeLayout({ratio:0}).ratio,25);
  assert.equal(normalizeLayout({showLeft:'false'}).showLeft,true);
  assert.equal(normalizeLayout({right:'bad'}).right,320);
  assert.equal(normalizeLayout({inspectorSide:'left'}).inspectorSide,'left');
  assert.equal(normalizeLayout({inspectorSide:'floating'}).inspectorSide,'right');
});
test('layout persistence is separate and handles corruption and unavailable storage', () => {
  const data=new Map(), storage={getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value)};
  assert.deepEqual(readLayout(storage),DEFAULT_LAYOUT);
  const layout=layoutPreset('writing');assert.equal(saveLayout(storage,layout),true);
  assert.deepEqual(readLayout(storage),layout);assert.deepEqual([...data.keys()],[LAYOUT_KEY]);
  data.set(LAYOUT_KEY,'broken');assert.deepEqual(readLayout(storage),DEFAULT_LAYOUT);
  assert.equal(saveLayout({setItem(){throw Error('quota');}},layout),false);
});
test('small windows retain canvas space; hidden panels consume no columns', () => {
  for(const width of [760,1000,1440,1920]) {const sizes=layoutWidths(DEFAULT_LAYOUT,width);assert.ok(width-sizes.left-sizes.right-14>=359);}
  assert.deepEqual(layoutWidths(layoutPreset('canvas'),1000),{left:0,right:0});
  assert.equal(layoutWidths(DEFAULT_LAYOUT,1440,false).right,0);
});
