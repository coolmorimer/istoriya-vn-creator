import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject} from '../src/domain/projectFactory.js';
import {addPropReaction,changePropReaction} from '../src/domain/propAuthoring.js';
import {authorAudioAttachment} from '../src/domain/audioAuthoring.js';
import {initialPreview,advancePreview,interactPreview} from '../src/domain/preview.js';
import {availableReactions,propKey} from '../runtime/interactions.mjs';
import {compilerInternals} from '../runtime/compiler.mjs';
import {validateProject} from '../src/domain/validator.js';
import {storyboardFrames} from '../src/domain/storyboard.js';
import {propImagePoint,opaquePropHit} from '../src/domain/propHitTest.js';
import {audioPlaybackMessage,AUDIO_BLOCKED,AUDIO_UNREADABLE} from '../src/domain/audioPlayback.js';
import {audioVolume,audioFade,voiceFilename} from '../runtime/audio-model.mjs';
import {trackFor} from '../runtime/timeline-model.mjs';
import {useProjectStore as store} from '../src/store/projectStore.js';
function fixture() {
 const p=createProject(),s=Object.values(p.scenes)[0];p.resources=[{id:'key-image',name:'Ключ',category:'prop',mime:'image/png',source:'key.png'},{id:'click',category:'sound',mime:'audio/wav',source:'click.wav'},{id:'voice',category:'voice',mime:'audio/wav',source:'voice.wav'}];
 s.images=[{id:'key',name:'Ключ',resourceId:'key-image',x:50,y:80,width:30,height:30}];
 addPropReaction(p,s.id,'key','take');changePropReaction(p,s.id,'key','take',{label:'Взять',text:'Ключ у меня.',once:true,hideAfter:true,inventory:{operation:'add',itemId:null,quantity:1},soundAssetId:'click',voiceAssetId:'voice'},'key-item');
 s.actions=[{id:'explore',type:'explore',prompt:'Найдите ключ',requiredItemId:'key-item'},{id:'after',type:'narration',text:'Дальше.'},{id:'end',type:'end'}];
 return {p,s};
}
test('click, sound, voice, inventory, one-shot and hidden state are player-only and gate continuation',()=>{
 const {p,s}=fixture(),original=structuredClone(p);let state=advancePreview(p,initialPreview(p,s.id));
 assert.equal(state.waiting.type,'explore');assert.equal(storyboardFrames(p,s)[0].frame.text,null);
 assert.equal(advancePreview(p,state).index,0,'cannot skip an incomplete exploration');
 state=interactPreview(p,state,'key','take');assert.equal(state.waiting.text,'Ключ у меня.');assert.equal(state.inventory['key-item'],1);
 assert.equal(state.audio.sound.assetId,'click');assert.equal(state.audio.voice.assetId,'voice');assert.ok(state.hiddenProps.includes(propKey(s.id,'key')));
 assert.equal(interactPreview(p,state,'key','take').inventory['key-item'],1,'no double activation during reply');
 state=advancePreview(p,state);assert.equal(state.waiting.type,'explore');assert.equal(availableReactions(s.id,s.images[0],state).length,0);
 state=advancePreview(p,state);assert.equal(state.waiting.text,'Дальше.');assert.deepEqual(p,original);
});

test('voice-only prop reply waits before its destination and stops on explicit continuation',()=>{
 const {p,s}=fixture(),reaction=s.images[0].interactions[0];reaction.text='';reaction.targetSceneId='after-voice';
 p.scenes['after-voice']={id:'after-voice',title:'После ответа',characters:[],images:[],actions:[{id:'last',type:'narration',text:'Ответ прослушан.'},{id:'end2',type:'end'}]};p.chapters[0].scenes.push('after-voice');
 let state=interactPreview(p,advancePreview(p,initialPreview(p,s.id)),'key','take');
 assert.equal(state.sceneId,s.id);assert.equal(state.waiting.text,'');assert.equal(state.waiting.returnToExplore.type,'explore');assert.equal(state.audio.voice.assetId,'voice');
 state=advancePreview(p,state);assert.equal(state.sceneId,'after-voice');assert.equal(state.waiting.text,'Ответ прослушан.');assert.equal(state.audio.voice,undefined);
 const script=compilerInternals.createScript(p,new Map(),new Map(p.resources.map(r=>[r.id,r.source])));
 assert.match(script,/voice "voice.wav"\s+istoriya_narrator ""[^\n]*\n\s+jump scene_after_voice/);
});
test('inventory creation is atomic with reaction history and audio references reuse assets',()=>{
 const p=createProject(),s=Object.values(p.scenes)[0];s.images=[{id:'key',name:'Ключ',resourceId:'key-image'}];
 store.setState({project:p,activeSceneId:s.id,activeActionId:null,past:[],future:[]});
 const id=store.getState().addPropReaction(s.id,'key');store.getState().updatePropReaction(s.id,'key',id,{inventory:{operation:'add',itemId:null,quantity:1}});
 assert.equal(store.getState().project.items.length,1);store.getState().undo();assert.equal(store.getState().project.items.length,0);store.getState().redo();assert.equal(store.getState().project.items.length,1);
 const current=structuredClone(store.getState().project),request={projectId:current.id,kind:'reaction',sceneId:s.id,layerId:'key',reactionId:id,field:'soundAssetId',resource:{name:'Щелчок',mime:'audio/wav',source:'data:audio/wav;base64,YWJj'}};
 assert.equal(authorAudioAttachment(current,request,'sound1'),'sound1');assert.equal(authorAudioAttachment(current,request,'sound2'),'sound1');assert.equal(current.resources.length,1);
 assert.throws(()=>authorAudioAttachment(current,{...request,projectId:'old'},'no'),/другой проект/);
 assert.throws(()=>authorAudioAttachment(current,{...request,reactionId:'deleted'},'no'),/не существует/);assert.equal(current.resources.length,1);
});
test('reaction conditions, item use, images and scene transitions survive preview execution',()=>{
 const {p,s}=fixture();p.flags=[{id:'open',name:'Открыто',initial:false}];
 const other={id:'other',title:'За дверью',characters:[],images:[],actions:[{id:'line',type:'narration',text:'Открыто.'}]};p.scenes.other=other;p.chapters[0].scenes.push('other');
 const door={id:'door',name:'Дверь',resourceId:'key-image',interactions:[{id:'unlock',label:'Открыть',requiredItemId:'key-item',inventory:{operation:'remove',itemId:'key-item',quantity:1},effects:[{kind:'flag',flagId:'open',value:true}],resultResourceId:'key-image',targetSceneId:'other'}]};s.images.push(door);
 let state=advancePreview(p,initialPreview(p,s.id));assert.equal(availableReactions(s.id,door,state).length,0);
 state=advancePreview(p,interactPreview(p,state,'key','take'));state=interactPreview(p,state,'door','unlock');
 assert.equal(state.sceneId,'other');assert.equal(state.inventory['key-item'],0);assert.equal(state.flags.open,true);assert.equal(state.propImages[propKey(s.id,'door')],'key-image');assert.equal(state.waiting.text,'Открыто.');
});
test('compiler includes nested audio/items and real master-layer interactive screens; validator rejects broken links',()=>{
 const {p,s}=fixture();const script=compilerInternals.createScript(p,new Map(),new Map(p.resources.map(r=>[r.id,r.source])));
 assert.match(script,/call screen istoriya_explore/);assert.match(script,/focus_mask True/);assert.match(script,/_layer="master"/);assert.match(script,/voice "voice.wav"/);assert.match(script,/play sound "click.wav"/);
 for(const id of ['key-image','click','voice'])assert.ok(compilerInternals.usedResourceIds(p).has(id));assert.equal(validateProject(p).valid,true);
 s.images[0].interactions[0].targetSceneId='missing';assert.equal(validateProject(p).valid,false);delete s.images[0].interactions[0].targetSceneId;
 s.timelineEnabled=true;assert.ok(validateProject(p).issues.some(i=>i.code==='timed-exploration'));
});
test('prop alpha hit coordinates follow contain, rotation, flip and out-of-frame transforms',()=>{
 const frame={left:0,top:0,width:1000,height:1000},layer={x:50,y:50,width:20,height:20,scale:100,rotation:0};
 assert.deepEqual(propImagePoint(layer,frame,100,100,500,400),{x:50,y:50});assert.equal(propImagePoint(layer,frame,100,100,700,400),null);
 assert.deepEqual(propImagePoint({...layer,flip:true},frame,100,100,450,400),{x:75,y:50});
 assert.deepEqual(propImagePoint({...layer,rotation:90},frame,100,100,600,500),{x:50,y:50});
 assert.equal(propImagePoint(layer,frame,200,100,500,310),null,'contain letterbox is not clickable');
});

test('prop alpha masks distinguish opaque pixels from transparency and rebuild after a source change',()=>{
 const oldDocument=globalThis.document;let draws=0,alpha=255,tainted=false;
 globalThis.document={createElement:()=>({getContext:()=>({drawImage:()=>{draws++;},getImageData:()=>{if(tainted)throw Object.assign(Error('tainted'),{name:'SecurityError'});return {data:[0,0,0,alpha]};}})})};
 try{
  const image={naturalWidth:100,naturalHeight:100,src:'asset://own/one.png'},layer={x:50,y:50,width:20,height:20},frame={left:0,top:0,width:1000,height:1000},event={clientX:500,clientY:400};
  assert.equal(opaquePropHit(image,layer,event,frame),true);alpha=0;assert.equal(opaquePropHit(image,layer,event,frame),false);assert.equal(draws,1);
  image.src='asset://own/two.png';alpha=255;assert.equal(opaquePropHit(image,layer,event,frame),true);assert.equal(draws,2);
  tainted=true;assert.equal(opaquePropHit(image,layer,event,frame),false,'security failures must not make transparent hit areas clickable');
 }finally{if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;}
});
test('referenced reaction speakers, flags, variables and scenes cannot be deleted; malformed IDs and covered exploration fail validation',()=>{
 const {p,s}=fixture();p.flags=[{id:'open',name:'Открыто',initial:false}];p.variables=[{id:'count',name:'Счёт',type:'number',initial:0}];p.characters=[{id:'hero',name:'Герой',sprites:[]}];
 p.scenes.next={id:'next',title:'Дальше',actions:[],characters:[]};p.chapters[0].scenes.push('next');
 Object.assign(s.images[0].interactions[0],{speakerId:'hero',condition:{variableId:'count',operator:'eq',value:0},effects:[{kind:'flag',flagId:'open',value:true}],targetSceneId:'next'});
 store.setState({project:p,past:[],future:[]});
 assert.equal(store.getState().removeCharacter('hero'),false);assert.equal(store.getState().removeVariable('count'),false);assert.equal(store.getState().removeFlag('open'),false);assert.equal(store.getState().removeScene('next'),false);
 s.images[0].interactions.push({...s.images[0].interactions[0]});assert.equal(validateProject(p).valid,false);s.images[0].interactions.pop();
 s.actions.unshift({id:'cg',type:'showCG',assetId:'key-image'});assert.ok(validateProject(p).issues.some(i=>i.code==='exploration-covered'));
});
test('selecting a canvas prop keeps the current exploration frame instead of rewinding the storyboard',()=>{
 const {p,s}=fixture();store.setState({project:p,activeSceneId:s.id,activeActionId:'explore',activeLayerId:null,past:[],future:[]});
 store.getState().setActiveLayer('key');assert.equal(store.getState().activeActionId,'explore');assert.equal(store.getState().activeLayerId,'key');
 store.getState().setActiveAction('after');assert.equal(store.getState().activeLayerId,null);assert.equal(store.getState().activeActionId,'after');
});
test('stopping/replacing playback is not an autoplay or corrupt-file error',()=>{
 assert.equal(audioPlaybackMessage({name:'AbortError'}),null);assert.equal(audioPlaybackMessage({name:'NotAllowedError'}),AUDIO_BLOCKED);assert.equal(audioPlaybackMessage({name:'NotSupportedError'}),AUDIO_UNREADABLE);
});
test('author volume is shared by reaction and dialogue playback and does not leak past a reply',()=>{
 const {p,s}=fixture();Object.assign(s.images[0].interactions[0],{voiceVolume:.35,soundVolume:.6});
 let state=advancePreview(p,initialPreview(p,s.id));state=interactPreview(p,state,'key','take');assert.equal(state.audio.voice.volume,.35);assert.equal(state.audio.sound.volume,.6);
 const script=compilerInternals.createScript(p,new Map(),new Map(p.resources.map(r=>[r.id,r.source])));assert.match(script,/voice "<volume 0.35>voice.wav"/);assert.match(script,/play sound "click.wav" volume 0.6/);
 state=advancePreview(p,state);assert.equal(state.audio.voice,undefined);assert.equal(state.audio.sound.volume,.6,'reply stop does not stop independent SFX');
 s.actions=[{id:'line',type:'narration',text:'Запись',voiceAssetId:'voice',voiceVolume:0},{id:'next',type:'narration',text:'Без записи'}];state=advancePreview(p,initialPreview(p,s.id));assert.equal(state.audio.voice.volume,0);state=advancePreview(p,state);assert.equal(state.audio.voice,undefined);
 assert.equal(audioVolume(undefined),1);assert.equal(audioVolume(NaN),1);assert.equal(audioVolume(0),0);assert.equal(audioFade(Infinity),0);assert.equal(voiceFilename('voice.wav',0),'<volume 0>voice.wav');
});
test('channel stops preserve other sounds; looping and repeated audio have matching export semantics',()=>{
 const {p,s}=fixture();s.actions=[{id:'music',type:'music',assetId:'click',loop:true},{id:'ambience',type:'ambience',assetId:'click'},{id:'sfx',type:'sound',assetId:'click',loop:true,volume:.4},{id:'before',type:'narration',text:'До остановки'},{id:'stop',type:'stopAudio',channel:'sound',fadeOut:.2},{id:'after',type:'narration',text:'После остановки'}];
 let state=advancePreview(p,initialPreview(p,s.id));const token=state.audio.sound.token;assert.equal(state.audio.ambience.loop,true);assert.equal(state.audio.sound.loop,true);
 state=advancePreview(p,state);assert.equal(state.audio.sound,undefined);assert.ok(state.audio.music);assert.ok(state.audio.ambience);
 const script=compilerInternals.createScript(p,new Map(),new Map(p.resources.map(r=>[r.id,r.source])));assert.match(script,/stop sound fadeout 0.2/);assert.match(script,/play sound "click.wav" volume 0.4 loop/);assert.equal(trackFor(s.actions[4]),'audio:sound');
 assert.match(script,/play music "click.wav" volume 1 loop/,'legacy missing volume is not silently muted');
 s.actions=s.actions.slice(0,4);state=advancePreview(p,initialPreview(p,s.id));assert.notEqual(state.audio.sound.token,token,'a new run actually replays audio');
 s.actions[0]={id:'bad',type:'stopAudio',channel:'sound; malicious'};assert.throws(()=>compilerInternals.createScript(p,new Map(),new Map()),/остановить/);
 s.actions=[{id:'voice',type:'voice',assetId:'voice'},{id:'stop',type:'stopAudio',channel:'voice',fadeOut:0},{id:'line',type:'narration',text:'Без голоса'}];assert.match(compilerInternals.createScript(p,new Map(),new Map(p.resources.map(r=>[r.id,r.source]))),/voice "voice.wav"\n    voice ""\n    stop voice/);
});
test('invalid audio types, volume and fades are author-facing validation errors',()=>{
 const {p,s}=fixture();s.images[0].interactions[0].voiceVolume=2;s.actions.push({id:'bad',type:'stopAudio',channel:'missing',fadeOut:-1},{id:'wrong-audio',type:'narration',text:'test',voiceAssetId:'key-image'});
 const issues=validateProject(p).issues;assert.ok(issues.some(i=>i.code==='invalid-reaction-audio-settings'));assert.ok(issues.some(i=>i.code==='invalid-action-audio-settings'));assert.ok(issues.some(i=>i.code==='invalid-action-audio'));
});

test('pre-build validation accepts the same legacy recordings as authoring, while explicit wrong MIME and empty sources remain errors',()=>{
 const {p,s}=fixture();for(const resource of p.resources.filter(r=>['voice','sound'].includes(r.category)))delete resource.mime;
 s.actions.push({id:'legacy-line',type:'narration',text:'Ответ',voiceAssetId:'voice',soundAssetId:'click'});
 assert.equal(validateProject(p).valid,true,'legacy audio categories are supported by both picker and Build');
 const voice=p.resources.find(r=>r.id==='voice');voice.mime='image/png';
 assert.ok(validateProject(p).issues.some(i=>i.code==='invalid-action-audio'));
 assert.ok(validateProject(p).issues.some(i=>i.code==='invalid-reaction-audio'));
 delete voice.mime;voice.source='';
 assert.equal(validateProject(p).valid,false,'category alone does not repair a missing file');
});
