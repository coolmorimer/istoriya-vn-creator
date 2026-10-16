import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const json=async file=>JSON.parse((await fs.readFile(file,'utf8')).replace(/^\uFEFF/,''));
const fixture=await json('.artifacts/media-load-fixture.json'),metadata=await json('.artifacts/native-ui-qa-location.json'),processResult=await json(path.join(metadata.run,'process-result.json'));
assert.equal(processResult.ExitCode,0);assert.equal(processResult.TimedOut,false);
const root=await fs.realpath(metadata.root),{profile,marker}=await json(path.join(root,'ui-profile.json')),base=await fs.realpath(profile);assert.equal(path.dirname(base),root);assert.equal(path.basename(base),marker);assert.ok(marker.startsWith('ui-profile-'));
const workspace=await json(path.join(base,'workspace/workspace.json')),active=JSON.parse(workspace.values['istoriya-project-v2']),library=JSON.parse(workspace.values['istoriya-project-library-v1']);
assert.equal(active.id,'media-qa-0');assert.equal(active.scenes['scene-0-0'].actions[0].text,'Ценная правка при ошибке диска.');assert.equal(library.length,3);assert.equal(workspace.values['istoriya-project-recovery-v1'],undefined);
const empty=library.find(p=>p.meta.title==='Пустой проект при пропавшем ресурсе — QA');assert.ok(empty);assert.equal(empty.resources.length,0);assert.equal(empty.characters.length,0);assert.equal(empty.items.length,0);assert.equal(Object.keys(empty.scenes).length,1);assert.equal(Object.values(empty.scenes)[0].actions.length,0);
for(const original of fixture.hashes){const project=library.find(p=>p.resources.some(r=>r.id===original.id)),resource=project.resources.find(r=>r.id===original.id),file=await fs.realpath(fileURLToPath(resource.source)),relative=path.relative(base,file);assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));assert.equal(createHash('sha256').update(await fs.readFile(file)).digest('hex'),original.sha256);}
assert.ok(active.resources.find(r=>r.id==='image-0-1').source.endsWith('.bin'));assert.equal(await fs.stat(path.join(fixture.workspace,'assets/фон # % 0-0.png.qa-hold')).catch(()=>null),null);
const before=await json('.artifacts/media-load-baseline.json'),after=await json('.artifacts/media-load-shipped.json');assert.equal(before.results.length,3);assert.equal(after.results.length,3);assert.ok(after.results.every(r=>r.inlineMedia===0&&r.fileMedia===34&&r.payloadBytes<150000));assert.equal(after.hubResponses.length,2);assert.equal(after.mediaChecks.legacyBinDecoded,true);
const result={passed:true,metadata,processResult,benchmark:{before:before.results,after:after.results,scope:'Warm native load IPC for two projects, 64 scenes, 64 MiB padded PNG plus voice/font. Not whole-app startup or RAM.'},all64ImageHashesRetained:true,emptyProjectDespiteMissingMedia:true,readOnlyAndMissingMediaRestored:true,libraryProjects:library.length,sourceTransportAbsentOnDisk:!JSON.stringify(workspace).includes('http://asset.localhost/'),legacyBin:true};assert.equal(result.sourceTransportAbsentOnDisk,true);
await fs.writeFile('.artifacts/native-media-shipped-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
