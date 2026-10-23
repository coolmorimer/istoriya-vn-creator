import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {compileProject} from '../runtime/compiler.mjs';
import {validateGameGui} from '../runtime/gui-template.mjs';
import {createProject} from '../src/domain/projectFactory.js';

// Source-emitter contract only. These deliberately minimal GUI strings are not
// a claim of game acceptance; actual SDK/EXE checks are separate integration QA.
const preparedGui={gui:'# Rust-prepared GUI\ninit python:\n    pass\n',screens:'# Rust-prepared screens\n'};
const fixture=()=>createProject({title:'Генератор — контракт',resolution:{width:1280,height:720}});

test('source emitter accepts Rust-prepared GUI without a runnable SDK',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'istoriya-emitter-'));
  try {
    const project=fixture(),scene=Object.values(project.scenes)[0];
    scene.actions=[{id:'text',type:'narration',text:'Литерально: [не код] {и это текст}'},{id:'end',type:'end'}];
    const destination=path.join(root,'generated');
    await compileProject(project,destination,{sdkPath:path.join(root,'missing-sdk'),assetsRoot:path.resolve('public'),preparedGui});
    assert.equal(await fs.readFile(path.join(destination,'game/gui.rpy'),'utf8'),preparedGui.gui);
    assert.match(await fs.readFile(path.join(destination,'game/script.rpy'),'utf8'),/Литерально/);
    assert.doesNotMatch(await fs.readFile(path.join(destination,'game/guisupport.rpy'),'utf8'),/gui7/);
  } finally {await fs.rm(root,{recursive:true,force:true});}
});

test('precompiled GUI cannot silently fall back to a launcher-only template',()=>{
  for(const gui of [null,{}, {gui:'',screens:'screen say'}, {gui:'import gui7',screens:'screen say'}, {gui:'gui . scale (1)',screens:'screen say'}]){
    assert.throws(()=>validateGameGui(gui));
  }
  assert.equal(validateGameGui(preparedGui),preparedGui);
});

test('native emitter refuses legacy build/preview requests instead of silently orchestrating Node SDK jobs',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'istoriya-emitter-protocol-'));
  try {
    for(const operation of ['build','preview','unknown']){
      const request=path.join(root,operation+'.json'),response=path.join(root,operation+'-response.json');
      await fs.writeFile(request,JSON.stringify({operation,project:fixture(),options:{preparedGui}}));
      const child=spawnSync(process.execPath,['runtime/native-worker.mjs',request,response],{encoding:'utf8',timeout:10000,windowsHide:true});
      assert.equal(child.status,1);assert.match(JSON.parse(await fs.readFile(response,'utf8')).error,/только генерацию сценария/);
    }
  } finally {await fs.rm(root,{recursive:true,force:true});}
});

test('native emitter requires an explicit core document contract, not just prepared GUI',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'istoriya-emitter-unvalidated-'));
  try{
    for(const validatedDocument of [undefined,{source:'javascript',structureProtocol:1,schema:8},{source:'istoriya-core',structureProtocol:2,schema:8},{source:'istoriya-core',structureProtocol:1,schema:9},{source:'istoriya-core',structureProtocol:1,schema:8}]){
      const request=path.join(root,'request.json'),response=path.join(root,'response.json');await fs.writeFile(request,JSON.stringify({operation:'compile',project:fixture(),options:{preparedGui},validatedDocument}));
      const child=spawnSync(process.execPath,['runtime/native-worker.mjs',request,response],{encoding:'utf8',timeout:10000,windowsHide:true});assert.equal(child.status,1);assert.match(JSON.parse(await fs.readFile(response,'utf8')).error,/структурной проверки документа Rust/);
    }
  }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('native emitter verifies exact document bytes and does not read a project supplied in the envelope',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'istoriya-emitter-integrity-'));
  try{
    const project=fixture(),body=Buffer.from(JSON.stringify(project)),request=path.join(root,'request.json'),response=path.join(root,'response.json'),document=path.join(root,'document.json');
    const envelope={operation:'compile',project:{scenes:null},destination:path.join(root,'generated'),options:{preparedGui,sdkPath:path.join(root,'missing-sdk'),assetsRoot:path.resolve('public')},validatedDocument:{source:'istoriya-core',structureProtocol:1,schema:8,bytes:body.length,sha256:createHash('sha256').update(body).digest('hex')}};
    await fs.writeFile(request,JSON.stringify(envelope));await fs.writeFile(document,body);
    let child=spawnSync(process.execPath,['runtime/native-worker.mjs',request,response],{encoding:'utf8',timeout:10000,windowsHide:true});assert.equal(child.status,0,child.stderr);assert.ok(JSON.parse(await fs.readFile(response,'utf8')).result);
    await fs.writeFile(document,Buffer.concat([body,Buffer.from(' ')]));
    child=spawnSync(process.execPath,['runtime/native-worker.mjs',request,response],{encoding:'utf8',timeout:10000,windowsHide:true});assert.equal(child.status,1);assert.match(JSON.parse(await fs.readFile(response,'utf8')).error,/повреждён при передаче/);
    const sameSize=Buffer.from(body.toString().replace('"schemaVersion":8','"schemaVersion":7'));assert.equal(sameSize.length,body.length);assert.notDeepEqual(sameSize,body);await fs.writeFile(document,sameSize);
    child=spawnSync(process.execPath,['runtime/native-worker.mjs',request,response],{encoding:'utf8',timeout:10000,windowsHide:true});assert.equal(child.status,1);assert.match(JSON.parse(await fs.readFile(response,'utf8')).error,/повреждён при передаче/);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('public compiler ignores attempted structural-validation bypass flags',async()=>{
  const project=fixture();Object.values(project.scenes)[0].actions=[{id:'broken',type:null}];
  await assert.rejects(compileProject(project,'unused-output',{preparedGui,structuralValidation:'rust',validatedDocument:{source:'istoriya-core',structureProtocol:1,schema:8}}),/У действия не задан тип/);
});
