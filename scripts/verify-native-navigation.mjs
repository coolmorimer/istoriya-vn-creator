import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {ASSET_FIELDS} from '../runtime/asset-fields.mjs';
import {validateProject} from '../src/domain/validator.js';
const json=async file=>JSON.parse((await fs.readFile(file,'utf8')).replace(/^\uFEFF/,''));
const metadata=await json('.artifacts/native-ui-qa-location.json'),processResult=await json(path.join(metadata.run,'process-result.json'));assert.equal(processResult.ExitCode,0);assert.equal(processResult.TimedOut,false);
const root=await fs.realpath(metadata.root),profile=await json(path.join(root,'ui-profile.json')),base=await fs.realpath(profile.profile);assert.equal(path.dirname(base),root);assert.equal(path.basename(base),profile.marker);assert.ok(profile.marker.startsWith('ui-profile-'));
const workspace=await json(path.join(base,'workspace/workspace.json')),library=JSON.parse(workspace.values['istoriya-project-library-v1']),active=JSON.parse(workspace.values['istoriya-project-v2']);assert.deepEqual(active,library.find(p=>p.id===active.id));assert.equal(library.length,2);assert.equal(workspace.values['istoriya-project-recovery-v1'],undefined);
const navigation=library.find(p=>p.id==='navigation_qa');assert.equal(Object.keys(navigation.scenes).length,500);assert.equal(navigation.scenes.s0.actions[1].text,'ПОТЕРЯННАЯ РЕПЛИКА');assert.equal(navigation.scenes.s0.images[0].interactions[1].id,'open');assert.equal(navigation.scenes.s1.actions[0].timeline.start,17);assert.equal(navigation.scenes.s1.actions[1].timeline.start,21);assert.equal(navigation.gallery.sections[1].items[1].id,'last-cg');
const built=await json(path.join(root,'ui-build-result.json'));assert.equal(built.projectId,'destinations_qa');assert.equal(built.isolatedQa,true);await fs.access(built.build.packagePath);
const p=library.find(p=>p.id===built.projectId),media=[];async function embed(value,field=''){
 if(Array.isArray(value))return Promise.all(value.map(v=>embed(v)));
 if(value&&typeof value==='object')return Object.fromEntries(await Promise.all(Object.entries(value).map(async([k,v])=>[k,await embed(v,k)])));
 if(ASSET_FIELDS.has(field)&&typeof value==='string'&&value.startsWith('file:')){const file=await fs.realpath(fileURLToPath(value)),relative=path.relative(base,file);assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));const bytes=await fs.readFile(file);media.push({sha256:createHash('sha256').update(bytes).digest('hex'),file});return `data:image/png;base64,${bytes.toString('base64')}`;}return value;
}
const portable=await embed(p);assert.equal(media.length,1);assert.equal(validateProject(portable).valid,true);const original=await json('.artifacts/native-0225-destinations/authored.vnproject');assert.equal(p.id,original.id);assert.deepEqual(portable.scenes,original.scenes);assert.deepEqual(portable.chapters,original.chapters);assert.equal(portable.resources[0].source,original.resources[0].source);
const output=path.resolve('.artifacts/native-0226-navigation');await fs.mkdir(output,{recursive:true});const projectPath=path.join(output,'authored.vnproject'),fixturePath=path.join(output,'testcases.rpy');await fs.writeFile(projectPath,JSON.stringify(portable));await fs.copyFile('.artifacts/native-0225-destinations/testcases.rpy',fixturePath);
const result={passed:true,version:'0.2.26',metadata,processResult,built,projects:library.length,nativeScenes:500,activeCheckpointId:active.id,verifiedProjectId:p.id,mediaHashes:media,projectPath,fixturePath};await fs.writeFile(path.join(output,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
