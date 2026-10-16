import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {ASSET_FIELDS} from '../runtime/asset-fields.mjs';
import {validateProject} from '../src/domain/validator.js';
const metadata=JSON.parse(await fs.readFile('.artifacts/native-ui-qa-location.json','utf8'));
const processResult=JSON.parse((await fs.readFile(path.join(metadata.run,'process-result.json'),'utf8')).replace(/^\uFEFF/,''));
assert.equal(processResult.ExitCode,0);assert.equal(processResult.TimedOut,false);
const {profile,marker}=JSON.parse(await fs.readFile(path.join(metadata.root,'ui-profile.json'),'utf8'));
const base=await fs.realpath(profile),root=await fs.realpath(metadata.root);assert.equal(path.dirname(base),root);assert.equal(path.basename(base),marker);assert.ok(marker.startsWith('ui-profile-'));
const workspace=JSON.parse(await fs.readFile(path.join(base,'workspace/workspace.json'),'utf8')),p=JSON.parse(workspace.values['istoriya-project-v2']),library=JSON.parse(workspace.values['istoriya-project-library-v1']);
assert.equal(library.length,3);assert.equal(p.schemaVersion,5);assert.equal(p.meta.title,'Интерфейс — QA');assert.equal(p.ui.layout.dialogue.next.label,'Продолжить историю');assert.equal(p.scenes.first.actions.length,3);assert.equal(p.scenes.first.actions[0].text,'ui-first');assert.equal(p.scenes.first.actions[0].speakerId,'hero');
assert.equal(p.ui.layout.dialogue.window.rect.y,60);assert.equal(p.ui.layout.dialogue.portrait.rect.y,25);assert.equal(p.ui.layout.menu.buttons[0].label,'Играть в историю');assert.equal(p.ui.layout.menu.buttons[0].rect.x,55);assert.equal(p.resources.length,6);
const empty=library.find(p=>p.meta.title==='Пустой проект 0.2.12 QA');assert.ok(empty);for(const key of ['resources','characters','items'])assert.equal(empty[key].length,0);assert.equal(Object.keys(empty.scenes).length,1);assert.equal(Object.values(empty.scenes)[0].actions.length,0);
const props=library.find(p=>p.meta.title==='Ключ и дверь — QA');assert.ok(props);assert.equal(props.scenes.props.images[0].interactions[1].voiceVolume,.35);assert.equal(props.scenes.props.images[0].interactions[1].soundVolume,.6);assert.equal(props.scenes.audio.actions.length,10);assert.equal(workspace.values['istoriya-project-recovery-v1'],undefined);
const output=path.resolve('.artifacts/native-0212-ui');await fs.mkdir(output,{recursive:true});
let media=0;
async function embed(value,key=''){
 if(Array.isArray(value))return Promise.all(value.map(v=>embed(v)));
 if(value&&typeof value==='object')return Object.fromEntries(await Promise.all(Object.entries(value).map(async([k,v])=>[k,await embed(v,k)])));
 if(ASSET_FIELDS.has(key)&&typeof value==='string'&&value.startsWith('file:')){const file=await fs.realpath(fileURLToPath(value)),relative=path.relative(base,file);assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));const mime=({'.png':'image/png','.wav':'audio/wav','.ttf':'font/ttf','.otf':'font/otf'})[path.extname(file).toLowerCase()];assert.ok(mime);media++;return `data:${mime};base64,${(await fs.readFile(file)).toString('base64')}`;}return value;
}
const authored=await embed(p),audio=await embed(props);assert.equal(media,12);assert.equal(validateProject(authored).valid,true);assert.equal(validateProject(audio).valid,true);assert.ok(authored.resources.find(r=>r.category==='font').source.length>900000);
await fs.writeFile(path.join(output,'authored.vnproject'),JSON.stringify(authored));await fs.writeFile(path.join(output,'props.vnproject'),JSON.stringify(audio));
const result={passed:true,emptyProject:true,uiUndoRedo:true,interfaceDeleteGuard:true,nativeAudioVolumeUndo:true,nativeAudioPlayAt35Percent:true,nativeStopActionConfigured:true,reopened:true,closeSavedLastEdit:true,metadata,processResult,media,projectPath:path.join(output,'authored.vnproject'),propsPath:path.join(output,'props.vnproject')};
await fs.writeFile(path.join(output,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
