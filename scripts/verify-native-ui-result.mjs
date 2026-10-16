// Checks real Rust files after the isolated native window's close event.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {ASSET_FIELDS} from '../runtime/asset-fields.mjs';
const metadata=JSON.parse(await fs.readFile('.artifacts/native-ui-qa-location.json','utf8'));
const processResult=JSON.parse((await fs.readFile(path.join(metadata.run,'process-result.json'),'utf8')).replace(/^\uFEFF/,''));
assert.equal(processResult.ExitCode,0);assert.equal(processResult.TimedOut,false);
const {profile}=JSON.parse(await fs.readFile(path.join(metadata.root,'ui-profile.json'),'utf8'));
const workspace=JSON.parse(await fs.readFile(path.join(profile,'workspace/workspace.json'),'utf8'));
const project=JSON.parse(workspace.values['istoriya-project-v2']),library=JSON.parse(workspace.values['istoriya-project-library-v1']);
assert.equal(project.meta.title,'Нативная проверка 0.2.8');assert.equal(library.length,1);
assert.equal(project.resources.length,2);assert.equal(project.characters.length,1);
const scene=Object.values(project.scenes)[0];
assert.deepEqual(scene.actions.map(a=>a.type),['showCharacter','narration']);
assert.equal(scene.actions[1].text,'Последняя правка перед закрытием окна 0.2.8.');
assert.equal(workspace.values['istoriya-project-recovery-v1'],undefined);
const base=await fs.realpath(profile);let media=0;
async function embed(value,key='') {
 if(Array.isArray(value))return Promise.all(value.map(v=>embed(v)));
 if(value&&typeof value==='object')return Object.fromEntries(await Promise.all(Object.entries(value).map(async([key,v])=>[key,await embed(v,key)])));
 if(ASSET_FIELDS.has(key)&&typeof value==='string'&&value.startsWith('file:')) {
  const file=await fs.realpath(fileURLToPath(value)),relative=path.relative(base,file);
  assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative),'QA media must stay in its test profile');
  const mime=({'.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg'})[path.extname(file).toLowerCase()];assert.ok(mime);
  media++;return `data:${mime};base64,${(await fs.readFile(file)).toString('base64')}`;
 }
 return value;
}
const portable=await embed(project),output=path.resolve('.artifacts/native-028-ui');
await fs.mkdir(output,{recursive:true});
await fs.writeFile(path.join(output,'authored.vnproject'),JSON.stringify(portable));
const result={passed:true,nativeWindowClose:true,dirtyCloseSaved:true,processResult,metadata,profile,projectId:project.id,title:project.meta.title,resources:project.resources.length,heroes:project.characters.length,actions:scene.actions.map(a=>a.type),text:scene.actions[1].text,portableMedia:media,projectPath:path.join(output,'authored.vnproject')};
await fs.writeFile(path.join(output,'result.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
