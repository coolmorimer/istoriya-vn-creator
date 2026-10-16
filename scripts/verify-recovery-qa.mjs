import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const json=async file=>JSON.parse((await fs.readFile(file,'utf8')).replace(/^\uFEFF/,'')),sha=bytes=>createHash('sha256').update(bytes).digest('hex'),phase=process.argv[2]??'unresolved';
const crash=await json('.artifacts/recovery-023-crash1.json'),root=await fs.realpath(crash.root),info=await json(path.join(root,'ui-profile.json')),profile=await fs.realpath(info.profile);assert.equal(path.dirname(profile),root);assert.equal(path.basename(profile),info.marker);assert.equal(await fs.readFile(path.join(profile,'qa-profile-marker'),'utf8'),info.marker);
const file=path.join(profile,'workspace/workspace.json'),bytes=await fs.readFile(file),ws=JSON.parse(bytes),p=JSON.parse(ws.values['istoriya-project-v2']),library=JSON.parse(ws.values['istoriya-project-library-v1']);assert.equal(p.id,'media_repair_qa');assert.equal(library.length,2);const neighbor=library.find(q=>q.id!==p.id);assert.equal(neighbor.meta.title,'Соседний проект — QA');assert.equal(neighbor.resources.length,0);
const hashes=[];for(const resource of p.resources){const media=await fs.realpath(fileURLToPath(resource.source)),relative=path.relative(profile,media);assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));hashes.push({id:resource.id,sha256:sha(await fs.readFile(media))});}assert.equal(hashes.length,5);
if(phase==='unresolved'){
 assert.equal(sha(bytes),crash.workspaceSha256);const draft=JSON.parse(ws.values['istoriya-project-recovery-v1']);assert.equal(draft.selection.activeActionId,crash.actionId);const fixture={root,profile,crash,neighbor,hashes,savedProject:p,draftProject:draft.project,actionId:crash.actionId,sceneId:draft.selection.activeSceneId};await fs.writeFile('.artifacts/recovery-023-data-fixture.json',JSON.stringify(fixture,null,2));
}else{
 const fixture=await json('.artifacts/recovery-023-data-fixture.json');assert.equal(ws.values['istoriya-project-recovery-v1'],undefined);assert.deepEqual(neighbor,fixture.neighbor);assert.deepEqual(hashes,fixture.hashes);const strip=value=>{const p=structuredClone(value);delete p.meta.modifiedAt;return p;};assert.deepEqual(strip(p),strip(fixture.draftProject));assert.deepEqual(p,library.find(q=>q.id===p.id));assert.equal(p.scenes[fixture.sceneId].actions.find(a=>a.id===fixture.actionId).voiceAssetId,'resource_873ce4e5');
}
const result={passed:true,phase,root,profile,workspaceSha256:sha(bytes),resources:5,hashes,neighborPreserved:true,bothVersionsRetained:phase==='unresolved',draftRemoved:phase!=='unresolved'};await fs.writeFile(`.artifacts/recovery-023-${phase}-data.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
