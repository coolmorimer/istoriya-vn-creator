// Read only the explicitly isolated QA profile; never use the owner's workspace.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {ASSET_FIELDS} from '../runtime/asset-fields.mjs';
const metadata=JSON.parse(await fs.readFile('.artifacts/native-ui-qa-location.json','utf8'));
const processResult=JSON.parse((await fs.readFile(path.join(metadata.run,'process-result.json'),'utf8')).replace(/^\uFEFF/,''));
assert.equal(processResult.ExitCode,0);assert.equal(processResult.TimedOut,false);
const {profile,marker}=JSON.parse(await fs.readFile(path.join(metadata.root,'ui-profile.json'),'utf8'));
const base=await fs.realpath(profile),root=await fs.realpath(metadata.root);
assert.equal(path.dirname(base),root);assert.equal(path.basename(base),marker);assert.ok(marker.startsWith('ui-profile-'));
const workspace=JSON.parse(await fs.readFile(path.join(base,'workspace/workspace.json'),'utf8'));
const project=JSON.parse(workspace.values['istoriya-project-v2']),library=JSON.parse(workspace.values['istoriya-project-library-v1']);
assert.equal(project.schemaVersion,4);assert.equal(project.meta.title,'Правила игры — QA');assert.equal(library.length,2);
const empty=library.find(p=>p.meta.title==='Нативный пустой 0.2.10');assert.ok(empty);
assert.equal(empty.schemaVersion,4);assert.equal(Object.keys(empty.scenes).length,1);
for(const key of ['resources','characters','items'])assert.equal(empty[key].length,0);
assert.equal(Object.values(empty.scenes)[0].actions.length,0);assert.ok(!Object.values(empty.scenes)[0].background);
assert.equal(project.items.length,2);assert.equal(project.items[0].name,'Серебряная монета');
assert.equal(project.items[0].description,'Последняя правка перед закрытием 0.2.10.');
const reaction=project.scenes.rules.images[0].interactions[0];
assert.equal(reaction.condition.kind,'all');assert.equal(reaction.condition.conditions.length,3);
assert.equal(reaction.effects.length,6);assert.equal(reaction.effects[4].flagId,'keep');assert.equal(reaction.effects[4].value,false);
assert.equal(workspace.values['istoriya-project-recovery-v1'],undefined);
let media=0;
async function embed(value,key='') {
 if(Array.isArray(value))return Promise.all(value.map(v=>embed(v)));
 if(value&&typeof value==='object')return Object.fromEntries(await Promise.all(Object.entries(value).map(async([k,v])=>[k,await embed(v,k)])));
 if(ASSET_FIELDS.has(key)&&typeof value==='string'&&value.startsWith('file:')) {
  const file=await fs.realpath(fileURLToPath(value)),relative=path.relative(base,file);
  assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));assert.equal(path.extname(file).toLowerCase(),'.png');
  media++;return `data:image/png;base64,${(await fs.readFile(file)).toString('base64')}`;
 }
 return value;
}
const output=path.resolve('.artifacts/native-0210-logic');await fs.mkdir(output,{recursive:true});
const portable=await embed(project);assert.equal(media,2);
await fs.writeFile(path.join(output,'authored.vnproject'),JSON.stringify(portable));
const fixtureLocation=JSON.parse(await fs.readFile('.artifacts/game-logic-location.json','utf8'));
await fs.copyFile(fixtureLocation.fixture,path.join(output,'testcases.rpy'));
const result={passed:true,emptyProject:true,schema:4,preservedResults:6,nativePreview:true,reopened:true,closeSavedLastEdit:true,metadata,processResult,media,projectPath:path.join(output,'authored.vnproject')};
await fs.writeFile(path.join(output,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
