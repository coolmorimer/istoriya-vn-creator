import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeMedia,windowsFilePath,auditNativeMedia} from '../src/platform/nativeMedia.js';
import {createNativeStorage} from '../src/platform/nativeStorage.js';
import {recoveryProject} from '../src/platform/recoveryExport.js';
import fs from 'node:fs';
import {ASSET_FIELDS} from '../runtime/asset-fields.mjs';
import {previewRevision} from '../src/domain/previewSession.js';
import {createProject} from '../src/domain/projectFactory.js';
const file='file:///C:/%D0%98%D0%B3%D1%80%D0%B0%20%23%25/assets/voice%20one.wav';
test('malformed draft is exposed for explicit recovery without blocking the saved native library',async()=>{
 const p=createProject(),media=createNativeMedia(source=>`asset://localhost/${source}`),storage=await createNativeStorage(async operation=>{assert.equal(operation,'load');return {'istoriya-project-v2':JSON.stringify(p),'istoriya-project-library-v1':JSON.stringify([p]),'istoriya-project-recovery-v1':'{broken'};},media);assert.equal(storage.getItem('istoriya-project-recovery-v1'),'{broken');assert.equal(JSON.parse(storage.getItem('istoriya-project-v2')).id,p.id);
});
const bridge=()=>createNativeMedia(path=>'http://asset.localhost/'+encodeURIComponent(path));
test('availability replies preserve original row identity for both raw and renderer file references',async()=>{
 const media=bridge(),rendered=media.toRenderer({source:file}).source,rows=[{source:file},{source:rendered}];
 const result=await auditNativeMedia(async(op,payload)=>{assert.equal(op,'audit-media');assert.deepEqual(payload,[{source:file},{source:file}]);return payload.map(row=>({...row,status:'unavailable'}));},media,rows);assert.deepEqual(result.map(r=>r.source),rows.map(r=>r.source));
 await assert.rejects(auditNativeMedia(async()=>[],media,rows),/не совпадает/);
});
test('native media bridge decodes Windows/UNC paths and round trips only media fields',()=>{
 assert.equal(windowsFilePath(file),'C:\\Игра #%\\assets\\voice one.wav');
 assert.equal(windowsFilePath('file://server/share/a%23.png'),'\\\\server\\share\\a#.png');
 assert.equal(windowsFilePath('file://localhost/C:/a.png'),'C:\\a.png');
 const media=bridge(),project={resources:[{source:file}],characters:[{sprites:[{source:file}]}],ui:{dialogueBackground:file},scenes:{a:{actions:[{text:file}]}}};
 const converted=media.toRenderer(project);assert.match(converted.resources[0].source,/^http:\/\/asset\.localhost/);assert.equal(converted.characters[0].sprites[0].source,converted.resources[0].source);assert.equal(converted.scenes.a.actions[0].text,file);assert.deepEqual(media.toNative(converted),project);assert.equal(project.resources[0].source,file);
 const unknown='http://asset.localhost/C%3A%5Csecret.png';assert.equal(media.toNative({source:unknown}).source,unknown,'never decode unregistered transport URLs');
 assert.equal(media.toRenderer({source:'file:///C:/broken%ZZ.png'}).source,'file:///C:/broken%ZZ.png');
});
test('native storage loads compact links, flushes durable references, clears pending without losing late edits',async()=>{
 const calls=[],media=bridge();let release;const call=async(op,batch)=>{if(op==='load')return {project:JSON.stringify({source:file,text:file})};calls.push(batch);if(calls.length===1)await new Promise(resolve=>release=resolve);};
 const storage=await createNativeStorage(call,media),first=JSON.parse(storage.getItem('project'));assert.match(first.source,/asset\.localhost/);assert.equal(first.text,file);
 storage.setItem('project',JSON.stringify({...first,n:1}));const saving=storage.flush();await new Promise(setImmediate);storage.setItem('project',JSON.stringify({...first,n:2}));release();await saving;await storage.flush();await storage.flush();
 assert.equal(calls.length,2);assert.equal(JSON.parse(calls[0].project).source,file);assert.equal(JSON.parse(calls[1].project).n,2);assert.equal(JSON.parse(storage.getItem('project')).n,2);
 storage.removeItem('project');await storage.flush();assert.equal(calls.at(-1).project,null);assert.equal(storage.getItem('project'),null);
});
test('native flush rejection retains pending for retry, and failed startup blocks writes',async()=>{
 let fail=true,attempts=0;const storage=await createNativeStorage(async op=>{if(op==='load')return {};attempts++;if(fail)throw 'Диск недоступен';},bridge());
 storage.setItem('project','{"text":"unsaved"}');await assert.rejects(storage.flush(),/Диск недоступен/);fail=false;await storage.flush();await storage.flush();assert.equal(attempts,2);
 const blocked=await createNativeStorage(async()=>{throw 'Библиотека повреждена';},bridge());assert.throws(()=>blocked.getItem('project'),/повреждена/);assert.throws(()=>blocked.setItem('project','{}'),/повреждена/);await assert.rejects(blocked.flush(),/повреждена/);
});
test('recovery materializes only the selected project and explicit fallback restores references',async()=>{
 const media=bridge(),project=media.toRenderer({source:file,text:'http://asset.localhost/literal'}),native=media.toNative(project);let requests=0;
 const desktop={portableProject:async value=>{requests++;assert.deepEqual(value,project);return {...native,source:'data:audio/wav;base64,YWJj'};},projectFileReferences:media.toNative};
 assert.match((await recoveryProject(project,desktop)).source,/^data:/);assert.equal(requests,1);assert.deepEqual(await recoveryProject(project,desktop,{referencesOnly:true}),native);assert.equal(requests,1);
 desktop.portableProject=async()=>{throw Error('Ресурс не найден');};await assert.rejects(recoveryProject(project,desktop),/не найден/);assert.deepEqual(await recoveryProject(project,desktop,{referencesOnly:true}),native);
 await assert.rejects(recoveryProject({source:'http://asset.localhost/unknown'},desktop,{referencesOnly:true}),/восстановить ссылку/);assert.equal((await recoveryProject({text:'http://asset.localhost/text'},null)).text,'http://asset.localhost/text');
});
test('production CSP allows only bounded native asset endpoints and native scope starts empty',()=>{
 const vite=fs.readFileSync('vite.config.mjs','utf8');for(const type of ['img','font','media','connect']){const directive=vite.match(new RegExp(`${type}-src ([^;]+)`))?.[1];assert.ok(directive?.includes('http://asset.localhost'));assert.ok(directive.includes('asset:'));assert.ok(!directive.includes('*'));}
 const config=JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json','utf8'));assert.deepEqual(config.app.security.assetProtocol,{enable:true,scope:[]});assert.match(fs.readFileSync('src-tauri/Cargo.toml','utf8'),/"protocol-asset"/);
});
test('Rust media fields agree with renderer fields, including legacy inline sprites and backgrounds',()=>{
 const rust=fs.readFileSync('src-tauri/src/storage.rs','utf8'),fields=JSON.parse(rust.match(/const MEDIA:[^=]+=([^;]+);/)[1]);assert.deepEqual([...fields].sort(),[...ASSET_FIELDS].sort());
});
test('file/renderer transport changes do not invalidate existing editor test saves',()=>{
 const p=createProject();p.resources=[{id:'voice',source:file,mime:'audio/wav',category:'voice'}];p.characters=[{id:'hero',portrait:file,sprites:[{id:'sprite',source:file}]}];assert.equal(previewRevision(bridge().toRenderer(p)),previewRevision(p));
});
test('native release commands serialize resource copying and remain parseable by Windows PowerShell 5',()=>{
 const bytes=fs.readFileSync('scripts/native.ps1'),source=bytes.toString('utf8');assert.ok(bytes.subarray(0,3).equals(Buffer.from([239,187,191]))||bytes.every(byte=>byte<128),'PowerShell5 needs a BOM for non-ASCII UTF8 source');assert.match(source,/\[Threading\.Mutex\]::new/);assert.match(source,/WaitOne\(1000\)/);assert.match(source,/finally \{[\s\S]*ReleaseMutex\(\)/);assert.ok(source.indexOf('sync-native-runtime.mjs')<source.lastIndexOf('ReleaseMutex()'));
});
