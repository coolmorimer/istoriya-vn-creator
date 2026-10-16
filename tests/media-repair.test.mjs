import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject} from '../src/domain/projectFactory.js';
import {mediaGroups,resourceMediaTarget,folderMediaCandidates,indexMediaFolder} from '../src/domain/mediaReferences.js';
import {authorMediaRepairs,authorMediaImports,captureResourceRepair} from '../src/domain/mediaRepair.js';
import {useProjectStore as store} from '../src/store/projectStore.js';
import {previewRevision} from '../src/domain/previewSession.js';
const png={name:'New filename',source:'data:image/png;base64,YWJj',mime:'image/png',size:3,width:100,height:200,fileName:'new.png',category:'background'};
function fixture(){const p=createProject(),s=Object.values(p.scenes)[0];p.resources=[{id:'pic',name:'Мой фон',source:'file:///missing.png',mime:'image/png',fileName:'Исходник.png',category:'background',width:400,height:300}];p.characters=[{id:'hero',name:'Герой',portrait:'file:///missing.png',portraitResourceId:'pic',sprites:[{id:'main',name:'Радость',source:'file:///missing.png',resourceId:'pic'}],defaultSpriteId:'main'}];s.backgroundResourceId='pic';s.background='file:///missing.png';s.backgroundTransform={x:-20,scale:130};s.characters=[{id:'actor',characterId:'hero',x:140,y:-20}];s.images=[{id:'prop',name:'Стол',resourceId:'pic',interactions:[{id:'inspect',label:'Осмотреть',text:'Не меняется'}]}];s.actions=[{id:'text',type:'narration',text:'file:///missing.png'}];return {p,s};}
const request=p=>{const group=mediaGroups(p)[0];return {projectId:p.id,entries:[{source:group.source,signature:group.signature,resource:png}]};};
test('repair covers resources, legacy inline sprites, portrait and scene background, preserving story, names and transforms',()=>{
 const {p,s}=fixture(),old=structuredClone(p);assert.equal(authorMediaRepairs(p,request(p)),4);assert.equal(p.resources[0].name,'Мой фон');assert.equal(p.resources[0].id,'pic');assert.equal(p.characters[0].sprites[0].name,'Радость');assert.equal(p.characters[0].defaultSpriteId,'main');assert.equal(p.characters[0].portrait,png.source);assert.equal(s.background,png.source);assert.deepEqual(s.backgroundTransform,old.scenes[s.id].backgroundTransform);assert.deepEqual(s.images,old.scenes[s.id].images);assert.equal(s.actions[0].text,'file:///missing.png');assert.equal(p.meta.mediaRevision,1);assert.equal(p.resources[0].width,100);
 const group=mediaGroups(p)[0];assert.ok(group.usages.some(label=>label.includes('Стол')));assert.ok(group.usages.some(label=>label.includes('Герой')));
});
test('targeted replacement cannot steal aliases explicitly linked to another ID sharing the same file',()=>{
 const {p,s}=fixture();p.resources.push({...p.resources[0],id:'other',name:'Другая версия'});s.backgroundResourceId='other';const target=resourceMediaTarget(p,'pic');assert.equal(target.refs.length,3);const captured=captureResourceRepair(p,'pic');authorMediaRepairs(p,{projectId:p.id,entries:[{...captured,resource:png}]});assert.equal(p.resources[1].source,'file:///missing.png');assert.equal(s.background,'file:///missing.png');assert.equal(s.backgroundResourceId,'other');assert.equal(p.characters[0].portrait,png.source);
});
test('all entries validate before mutation, including stale groups, wrong media type and deleted sprite',()=>{
 for(const change of [r=>r.projectId='old',r=>r.entries[0].signature='stale',r=>r.entries[0].resource={...png,mime:'audio/wav',category:'voice',source:'data:audio/wav;base64,YWJj',duration:1},r=>r.entries.push({...r.entries[0]}),r=>r.entries[0].resource={...png,width:0}]){const {p}=fixture(),r=request(p);change(r);const before=structuredClone(p);assert.throws(()=>authorMediaRepairs(p,r));assert.deepEqual(p,before);}
 const {p}=fixture(),r=request(p);p.characters[0].sprites=[];const before=structuredClone(p);assert.throws(()=>authorMediaRepairs(p,r),/изменились/);assert.deepEqual(p,before);
});
test('folder matching preserves ambiguous paths, Unicode/case and does not read non-matching file bodies',()=>{
 const {p}=fixture(),group=mediaGroups(p)[0],files=[{name:'исходник.PNG',webkitRelativePath:'a/исходник.PNG'},{name:'ИСХОДНИК.png',webkitRelativePath:'b/ИСХОДНИК.png'},{name:'unrelated.png'}];assert.equal(folderMediaCandidates(group,files).length,2);assert.deepEqual(folderMediaCandidates(group,indexMediaFolder(files)),files.slice(0,2));
});
test('batch repair is one Undo, sprite reorder remains safe and media-only changes invalidate preview saves reversibly',()=>{
 const {p,s}=fixture(),beforeRevision=previewRevision(p),group=mediaGroups(p)[0];store.setState({project:p,activeSceneId:s.id,past:[],future:[]});store.getState().repairMedia({projectId:p.id,entries:[{source:group.source,signature:group.signature,resource:png}]});let state=store.getState();assert.equal(state.past.length,1);assert.notEqual(previewRevision(state.project),beforeRevision);state.undo();state=store.getState();assert.equal(previewRevision(state.project),beforeRevision);assert.equal(state.project.resources[0].source,'file:///missing.png');state.redo();assert.equal(store.getState().project.characters[0].sprites[0].source,png.source);
});
test('audio/font/inline UI repairs retain linkage and explicit project settings',()=>{
 const {p}=fixture();p.resources.push({id:'voice',name:'Ответ',mime:'audio/wav',source:'file:///voice.wav',category:'voice'},{id:'font',name:'Мой шрифт',mime:'font/ttf',source:'file:///font.ttf',category:'font'});p.ui.dialogueBackground='file:///missing.png';p.ui.textStyle={font:'font'};const groups=mediaGroups(p),r={projectId:p.id,entries:groups.map(g=>({source:g.source,signature:g.signature,resource:g.source.includes('voice.wav')?{...png,source:'data:audio/wav;base64,YWJj',mime:'audio/wav',duration:2,category:'voice'}:g.source.includes('font.ttf')?{...png,source:'data:font/ttf;base64,YWJj',mime:'font/ttf',category:'font'}:png}))};authorMediaRepairs(p,r);assert.equal(p.ui.dialogueBackground,png.source);assert.equal(p.ui.textStyle.font,'font');assert.equal(p.resources[1].name,'Ответ');assert.equal(p.resources[2].name,'Мой шрифт');
});

test('library imports validate the whole batch before mutation and refuse a late import into a different project',()=>{
 const {p}=fixture(),before=structuredClone(p);assert.throws(()=>authorMediaImports(p,{projectId:p.id,resources:[png,{...png,size:0}]},['one','two']));assert.deepEqual(p,before);assert.throws(()=>authorMediaImports(p,{projectId:'old',resources:[png]},['one']));assert.deepEqual(p,before);
 const ids=authorMediaImports(p,{projectId:p.id,resources:[png,png]},['one','two']);assert.deepEqual(ids,['one','one']);assert.equal(p.resources.length,2);
});
test('legacy duplicate sprite IDs use unambiguous indexed paths, without silently repairing only the first',()=>{
 const {p}=fixture();p.characters[0].sprites.push({...p.characters[0].sprites[0],name:'Другой старый спрайт'});authorMediaRepairs(p,request(p));assert.equal(p.characters[0].sprites[0].source,png.source);assert.equal(p.characters[0].sprites[1].source,png.source);
});
