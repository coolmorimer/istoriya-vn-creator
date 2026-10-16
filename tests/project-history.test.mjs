import test from 'node:test';
import assert from 'node:assert/strict';
import {editProject,replayProject,cloneDraft} from '../src/domain/projectHistory.js';
import {createProject} from '../src/domain/projectFactory.js';

test('small edits share untouched media and scenes; history contains only changed paths',()=>{
 const p=createProject(),s=Object.values(p.scenes)[0];
 p.resources.push({id:'media',source:'data:image/png;base64,'+'x'.repeat(1024*1024)});
 s.actions=[{id:'line',type:'narration',text:'Original'}];
 const next=editProject(p,draft=>{draft.scenes[s.id].actions[0].text='Edited';});
 assert.strictEqual(next.project.resources,p.resources);
 assert.strictEqual(next.project.chapters,p.chapters);
 assert.equal(p.scenes[s.id].actions[0].text,'Original');
 assert.ok(JSON.stringify(next.entry).length<500);
 assert.deepEqual(replayProject(next.project,next.entry,'undo'),p);
 assert.deepEqual(replayProject(p,next.entry,'redo'),next.project);
});

test('no-op creates no history entry and failed edits are atomic',()=>{
 const p=createProject();
 assert.equal(editProject(p,()=>{}),null);
 assert.throws(()=>editProject(p,d=>{d.meta.title='Broken';throw Error('abort');}),/abort/);
 assert.notEqual(p.meta.title,'Broken');
});

test('array reorder, scene removal and resource replacement replay without losing unrelated state',()=>{
 const p=createProject(),s=Object.values(p.scenes)[0];
 s.actions=[{id:'a',type:'narration',text:'A'},{id:'b',type:'narration',text:'B'}];p.resources=[{id:'r',source:'old.png'}];
 const edits=[],original=structuredClone(p);let current=p;
 for(const recipe of [d=>{d.scenes[s.id].actions.reverse();},d=>{d.resources[0].source='new.png';},d=>{delete d.scenes[s.id];}]){
  const next=editProject(current,recipe);edits.push(next.entry);current=next.project;
 }
 const final=current;
 for(const entry of [...edits].reverse())current=replayProject(current,entry,'undo');
 assert.deepEqual(current,original);
 for(const entry of edits)current=replayProject(current,entry,'redo');
 assert.deepEqual(current,final);
});

test('draft cloning is safe for legacy timeline split/conversion',()=>{
 const p=createProject(),s=Object.values(p.scenes)[0];s.actions=[{id:'a',type:'pause',duration:2}];
 const next=editProject(p,d=>{d.scenes[s.id].savedTimeline=cloneDraft(d.scenes[s.id].actions);});
 assert.deepEqual(next.project.scenes[s.id].savedTimeline,s.actions);
});
