import test from 'node:test';import assert from 'node:assert/strict';
import {documentCorpus} from './fixtures/document-corpus.mjs';import {assertProjectShape} from '../runtime/project-format.mjs';
test('shared document corpus records the unchanged JS structural contract and preserves inputs',()=>{
  for(const c of documentCorpus()){const before=JSON.stringify(c.project);let ok=true;try{assertProjectShape(c.project);}catch{ok=false;}assert.equal(ok,c.ok,c.name);assert.equal(JSON.stringify(c.project),before,c.name);}
});
test('public fallback guard still rejects malformed UI and keyframes',()=>{
  assert.throws(()=>assertProjectShape({scenes:{s:{actions:[]}},ui:{layout:{version:2,dialogue:{visible:'yes'}}}}),/Некорректное включение/);
  assert.throws(()=>assertProjectShape({scenes:{s:{actions:[{type:'keyframes'}]}}}),/Выберите объект движения/);
});
