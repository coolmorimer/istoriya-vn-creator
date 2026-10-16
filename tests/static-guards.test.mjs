import test from 'node:test';
import assert from 'node:assert/strict';
import {ESLint} from 'eslint';
import fs from 'node:fs/promises';
test('production lint rejects a deleted build helper and the actual App has no undefined plain identifiers',async()=>{
 const eslint=new ESLint();const [bad]=await eslint.lintText('function BuildModal(){ return projectResourceSize({resources:[]}); }',{filePath:'src/guard-fixture.jsx'});assert.ok(bad.messages.some(m=>m.ruleId==='no-undef'&&m.severity===2&&m.message.includes('projectResourceSize')));
 const results=await eslint.lintFiles(['src/App.jsx']);assert.equal(results.reduce((n,r)=>n+r.errorCount,0),0,results.flatMap(r=>r.messages).map(m=>m.message).join('\n'));
});

test('interactive preview images request anonymous CORS before their source for native alpha picking',async()=>{
 const source=await fs.readFile(new URL('../src/App.jsx',import.meta.url),'utf8');
 assert.match(source,/className="preview-interactive-prop"[^\n]*<img crossOrigin="anonymous" src=\{resource.source\}/,'native asset.localhost images must not taint the hit-test canvas');
});

test('canvas resize handles preserve a draggable center on a small zoomed prop',async()=>{
 const css=await fs.readFile(new URL('../src/workspace.css',import.meta.url),'utf8');
 const rule=css.match(/\.canvas-viewport \.sprite-resize-handle\s*\{([^}]+)\}/);assert.ok(rule,'canvas handles need their own bounded sizing');
 const values=rule[1].match(/width:\s*clamp\(([\d.]+)px,\s*([\d.]+)%,\s*([\d.]+)px\)/);assert.ok(values,'fixed corners must not cover small objects');
 const [,minimum,percent,maximum]=values.map(Number),width=25.6,handle=Math.max(minimum,Math.min(maximum,width*percent/100));
 assert.ok(handle>=4&&handle<=12);assert.ok(width-2*handle>=12,'the center of the native 10-percent fixture must remain draggable');
});

test('map destination and rule siblings never share the same React key',async()=>{
 for(const name of ['StoryMap','ChapterMap']){
  const source=await fs.readFile(new URL(`../src/components/${name}.jsx`,import.meta.url),'utf8');
  assert.match(source,/StoryDestinationField key=\{`destination:\$\{edge.id\}`\}/);assert.doesNotMatch(source,/StoryDestinationField key=\{edge.id\}/);
 }
});
test('prop filename suggestions commit before asynchronous decode and never rename on completion',async()=>{
 const source=await fs.readFile(new URL('../src/components/PropPicker.jsx',import.meta.url),'utf8');const load=source.match(/const load=async file=>\{([^\n]+)/)?.[1];assert.ok(load);assert.ok(load.indexOf('suggestName(')<load.indexOf('await readCharacterImage'));assert.ok(!load.slice(load.indexOf('await readCharacterImage')).includes('setName'));assert.match(source,/const suggestName=value=>\{if\(!nameEdited.current\)flushSync/);assert.match(source,/onFocus=\{\(\)=>\{nameEdited.current=true;/);
});
