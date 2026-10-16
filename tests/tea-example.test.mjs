import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {validateProject} from '../src/domain/validator.js';
import {initialPreview,advancePreview} from '../src/domain/preview.js';
test('text example validates and all four choice combinations reach the finale',async()=>{
 const project=JSON.parse(await fs.readFile(new URL('../examples/tea-with-goblins/Чай вместо подвига.vnproject',import.meta.url),'utf8'));
 assert.equal(validateProject(project).valid,true);assert.equal(project.resources.length,0);
 for(const first of [0,1]) for(const second of [0,1]) {
  let state=initialPreview(project,'tea_1'),choices=0,steps=0;const selected=[first,second],visited=new Set();
  while(!state.ended&&steps++<200) {visited.add(state.sceneId);const option=state.waiting?.type==='choice'?state.waiting.options[selected[choices++]].id:undefined;state=advancePreview(project,state,option);assert.equal(state.error,undefined);}
  assert.equal(state.ended,true);assert.equal(choices,2);assert.equal(state.sceneId,'tea_8');assert.equal(visited.size,6);
 }
});
