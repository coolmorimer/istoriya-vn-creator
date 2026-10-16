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
const p=JSON.parse(workspace.values['istoriya-project-v2']),library=JSON.parse(workspace.values['istoriya-project-library-v1']);
assert.equal(library.length,2);assert.equal(p.schemaVersion,4);assert.equal(p.meta.title,'Карта ветвей — QA');
const created=library.find(p=>p.meta.title==='Создание ветвей 0.2.11 QA');assert.ok(created);
assert.equal(Object.keys(created.scenes).length,3);assert.equal(created.resources.length,0);
const branch=Object.values(created.scenes).find(s=>s.title==='Первый узел').actions[0];
assert.equal(branch.type,'choice');assert.equal(branch.prompt,'Куда дальше?');assert.equal(branch.options.length,2);assert.equal(branch.options[0].text,'Пойти налево');
assert.equal(p.scenes.rules.description,'Нативная карта 0.2.11: последняя правка.');
const door=p.scenes.rules.images.find(l=>l.id==='door').interactions[0];assert.equal(door.label,'Войти в зал');assert.equal(door.targetChapterId,'hall');assert.equal(door.text,'Дверь открыта.');
assert.equal(p.scenes.payment.actions[0].options[1].effects.length,4);assert.equal(p.scenes.payment.actions[0].options[1].effects[2].value,false);
assert.equal(p.scenes.check.actions[0].condition.conditions[2].value,false);
assert.equal(workspace.values['istoriya-project-recovery-v1'],undefined);
let media=0;
async function embed(value,key=''){
 if(Array.isArray(value))return Promise.all(value.map(v=>embed(v)));
 if(value&&typeof value==='object')return Object.fromEntries(await Promise.all(Object.entries(value).map(async([k,v])=>[k,await embed(v,k)])));
 if(ASSET_FIELDS.has(key)&&typeof value==='string'&&value.startsWith('file:')){
  const file=await fs.realpath(fileURLToPath(value)),relative=path.relative(base,file);assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));assert.equal(path.extname(file).toLowerCase(),'.png');media++;
  return `data:image/png;base64,${(await fs.readFile(file)).toString('base64')}`;
 }
 return value;
}
const output=path.resolve('.artifacts/native-0211-map');await fs.mkdir(output,{recursive:true});
await fs.writeFile(path.join(output,'authored.vnproject'),JSON.stringify(await embed(p)));assert.equal(media,2);
const result={passed:true,mapCreatedFromEmpty:true,propRemovalUndo:true,preservedResults:4,nativePreviewWin:true,reopened:true,closeSavedLastEdit:true,metadata,processResult,media,projectPath:path.join(output,'authored.vnproject')};
await fs.writeFile(path.join(output,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
