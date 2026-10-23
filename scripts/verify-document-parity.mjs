// Executable JS/Rust comparison of the shared document corpus. A core contract
// test is not a claim that a game, UI interaction or standalone player passed.
import fs from 'node:fs/promises';import path from 'node:path';import {spawnSync} from 'node:child_process';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {documentCorpus,documentMutationCorpus} from '../tests/fixtures/document-corpus.mjs';import {assertProjectShape} from '../runtime/project-format.mjs';
const root=path.resolve(process.env.ISTORIYA_QA_ROOT??'output/document-parity');await fs.mkdir(root,{recursive:true});
const target=process.argv.includes('--use-native-target')?path.resolve('src-tauri/target'):path.join(root,'core-target'),cargo=process.platform==='win32'?path.join(process.env.USERPROFILE,'.cargo/bin/cargo.exe'):'cargo';
const build=spawnSync(cargo,['build','--release','--locked','--manifest-path','crates/istoriya-core/Cargo.toml','--target-dir',target,'--bin','document-contract'],{encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024});
await fs.writeFile(path.join(root,'core-contract-build.log'),(build.stdout??'')+(build.stderr??''));assert.equal(build.status,0,build.stderr);
const executable=path.join(target,'release',process.platform==='win32'?'document-contract.exe':'document-contract'),cases=[...documentCorpus(),...documentMutationCorpus()];
const run=spawnSync(executable,[],{input:JSON.stringify(cases),encoding:'utf8',windowsHide:true,maxBuffer:32*1024*1024,timeout:30000});assert.equal(run.status,0,run.stderr);
const answers=JSON.parse(run.stdout);assert.equal(answers.length,cases.length);let accepted=0,rejected=0,pointers=0;
for(let i=0;i<cases.length;i++){
  const c=cases[i],r=answers[i];assert.equal(r.name,c.name);let jsOk=true;try{assertProjectShape(c.project);}catch{jsOk=false;}
  if(c.ok!==undefined)assert.equal(jsOk,c.ok,c.name+' baseline');assert.equal(r.ok,jsOk,c.name+' Rust parity');
  if(r.ok){accepted++;assert.equal(r.borrowed,true,c.name);assert.deepEqual(JSON.parse(r.roundTrip),c.project,c.name+' lossless round trip');}
  else{rejected++;assert.equal(typeof r.diagnostic.message,'string');assert.equal(typeof r.diagnostic.pointer,'string');assert.ok(r.diagnostic.message.length>0);if(c.pointer){assert.equal(r.diagnostic.pointer,c.pointer,c.name+' diagnostic path');pointers++;}}
}
const result={passed:true,cases:cases.length,accepted,rejected,exactPointers:pointers,losslessAcceptedDocuments:accepted,coreExecutableSha256:createHash('sha256').update(await fs.readFile(executable)).digest('hex'),scope:'Project-format structural parity including UI/keyframes; semantic references, migrations and story IR remain separate',results:answers.map(({roundTrip,...r})=>r)};
await fs.writeFile(path.join(root,'document-parity-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({passed:true,path:path.join(root,'document-parity-result.json'),cases:cases.length,accepted,rejected,exactPointers:pointers}));
