import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {ASSET_FIELDS} from '../runtime/asset-fields.mjs';
const metadata=JSON.parse(await fs.readFile('.artifacts/native-ui-qa-location.json','utf8'));
const processResult=JSON.parse((await fs.readFile(path.join(metadata.run,'process-result.json'),'utf8')).replace(/^\uFEFF/,''));
assert.equal(processResult.ExitCode,0);assert.equal(processResult.TimedOut,false);
const {profile}=JSON.parse(await fs.readFile(path.join(metadata.root,'ui-profile.json'),'utf8'));
const base=await fs.realpath(profile),root=await fs.realpath(metadata.root);
assert.equal(path.dirname(base),root);assert.ok(path.basename(base).startsWith('ui-profile-'));
const workspace=JSON.parse(await fs.readFile(path.join(base,'workspace/workspace.json'),'utf8'));
const project=JSON.parse(workspace.values['istoriya-project-v2']),library=JSON.parse(workspace.values['istoriya-project-library-v1']);
assert.equal(project.schemaVersion,3);assert.equal(project.meta.title,'Ключ и дверь — QA');assert.equal(library.length,2);
const empty=library.find(p=>p.meta.title==='Пустой проект 0.2.9 QA');assert.ok(empty);
assert.equal(empty.resources.length,0);assert.equal(empty.characters.length,0);assert.equal(empty.items.length,0);assert.equal(Object.values(empty.scenes)[0].actions.length,0);
const reaction=project.scenes.props.images[0].interactions[0];assert.equal(reaction.label,'Осмотреть ключ');assert.equal(reaction.text,'Латунный ключ. Нативная правка 0.2.9.');assert.equal(reaction.soundAssetId,'click');
assert.equal(workspace.values['istoriya-project-recovery-v1'],undefined);
let media=0;
async function embed(value,key='') {
 if(Array.isArray(value))return Promise.all(value.map(v=>embed(v)));
 if(value&&typeof value==='object')return Object.fromEntries(await Promise.all(Object.entries(value).map(async([k,v])=>[k,await embed(v,k)])));
 if(ASSET_FIELDS.has(key)&&typeof value==='string'&&value.startsWith('file:')) {
  const file=await fs.realpath(fileURLToPath(value)),relative=path.relative(base,file);assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));
  const mime=({'.png':'image/png','.wav':'audio/wav','.mp3':'audio/mpeg','.ogg':'audio/ogg'})[path.extname(file).toLowerCase()];assert.ok(mime);media++;return `data:${mime};base64,${(await fs.readFile(file)).toString('base64')}`;
 }
 return value;
}
const output=path.resolve('.artifacts/native-029-props');await fs.mkdir(output,{recursive:true});
const portable=await embed(project);assert.equal(media,6);
await fs.writeFile(path.join(output,'authored.vnproject'),JSON.stringify(portable));
const fixtureLocation=JSON.parse(await fs.readFile('.artifacts/prop-runtime-location.json','utf8'));
const fixture=(await fs.readFile(path.join(fixtureLocation.root,'testcases.rpy'),'utf8')).replaceAll('"Осмотреть"','"Осмотреть ключ"').replaceAll('"Латунный ключ."','"Латунный ключ. Нативная правка 0.2.9."');
await fs.writeFile(path.join(output,'testcases.rpy'),fixture);
const result={passed:true,emptyProject:true,nativeReactionAudio:true,nativePreview:true,reopened:true,closeSavedLastEdit:true,metadata,processResult,media,projectPath:path.join(output,'authored.vnproject')};
await fs.writeFile(path.join(output,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
