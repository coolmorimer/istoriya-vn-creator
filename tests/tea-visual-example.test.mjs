import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createTeaVisualProject} from '../examples/tea-with-goblins/project.mjs';
import {validateProject} from '../src/domain/validator.js';
import {initialPreview,advancePreview} from '../src/domain/preview.js';
import {compilerInternals} from '../runtime/compiler.mjs';
test('visual example keeps props separate, valid emotions, animations and all choice paths',async()=>{
 const base=JSON.parse(await fs.readFile(new URL('../examples/tea-with-goblins/Чай вместо подвига.vnproject',import.meta.url),'utf8'));
 const ids=['forest-rain','forest-clear','cave-empty','table','tea-service','elira-neutral','elira-worried','elira-embarrassed','elira-happy','brog-neutral','brog-happy','tik-neutral','tik-happy','mystery','tea-theme','rain','fire','cup','twig','magic'];
 const p=createTeaVisualProject(base,ids.map(id=>{const audio=['mystery','tea-theme','rain','fire','cup','twig','magic'].includes(id);return {id,name:id,source:`${id}.${audio?'wav':'png'}`,category:audio?'sound':'prop',mime:audio?'audio/wav':'image/png'};}));
 assert.equal(validateProject(p).valid,true);assert.equal(p.scenes.tea_5.images.length,2);assert.equal(p.scenes.tea_5.background,null);assert.equal(p.scenes.tea_5.backgroundResourceId,'cave-empty');assert.equal(p.characters[0].sprites.length,4);
 assert.ok(Object.values(p.scenes).some(s=>s.actions.some(a=>a.type==='moveCharacter')));assert.ok(Object.values(p.scenes).some(s=>s.actions.some(a=>a.type==='characterAnimation')));
 for(const a of [0,1])for(const b of [0,1]){let state=initialPreview(p,'tea_1'),choices=0,steps=0;while(!state.ended&&steps++<250){const option=state.waiting?.type==='choice'?state.waiting.options[[a,b][choices++]].id:undefined;state=advancePreview(p,state,option);assert.equal(state.error,undefined);}assert.equal(state.ended,true);assert.equal(state.sceneId,'tea_9');assert.equal(choices,2);}
 const assets=new Map(ids.map(id=>[id,`${id}.png`])),sprites=new Map(p.characters.flatMap(c=>c.sprites.map(s=>[`${c.id}:${s.id}`,`${s.resourceId}.png`])));
 const script=compilerInternals.createScript(p,new Map([['tea_5','cave-empty.png']]),assets,sprites);
 assert.match(script,/table\.png.*zorder 50/);assert.match(script,/tea-service\.png.*zorder 60/);assert.match(script,/ease .* yoffset -[1-9]/);assert.doesNotMatch(script,/istoriya_bounce/);
});
