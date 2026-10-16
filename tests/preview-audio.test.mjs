import test from 'node:test';import assert from 'node:assert/strict';
import {createPreviewAudio} from '../src/domain/previewAudio.js';
import {createProject} from '../src/domain/projectFactory.js';
import {advancePreview,initialPreview} from '../src/domain/preview.js';
import {packPreview,unpackPreview} from '../src/domain/previewSession.js';
const resources=[{id:'tone',mime:'audio/wav',source:'tone.wav'}],prefs={music:1,sound:1,voice:1,ambience:1};
const flush=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};
function harness(play=()=>Promise.resolve()){
 let clock=0,serial=0;const tasks=new Map(),audios=[],voices=[],statuses=[];
 const player=createPreviewAudio({createAudio:source=>{const audio={src:source,volume:1,loop:false,paused:false,onended:null,onerror:null,play:()=>play(),pause(){this.paused=true;}};audios.push(audio);return audio;},now:()=>clock,schedule:fn=>{const id=++serial;tasks.set(id,fn);return id;},cancel:id=>tasks.delete(id),onVoiceActive:v=>voices.push(v),onStatus:v=>statuses.push(v)});
 return {player,audios,voices,statuses,tasks,step(ms){clock+=ms;const work=[...tasks.values()];tasks.clear();work.forEach(fn=>fn());}};
}
test('music fade starts on actual play, scales author volume by mixer and does not restart for preference changes',async()=>{
 let ready;const h=harness(()=>new Promise(resolve=>{ready=resolve;}));const tracks={music:{assetId:'tone',token:'one',volume:.8,fadeIn:2}};h.player.update(tracks,resources,{...prefs,music:.5});assert.equal(h.audios[0].volume,0);h.step(10000);assert.equal(h.tasks.size,0);ready();await flush();h.step(1000);assert.equal(h.audios[0].volume,.2);
 h.player.update(tracks,resources,{...prefs,music:0});assert.equal(h.audios[0].volume,0);h.player.update(tracks,resources,prefs);assert.equal(h.audios[0].volume,.4);h.step(1000);assert.equal(h.audios[0].volume,.8);assert.equal(h.audios.length,1);assert.equal(h.tasks.size,0);h.player.dispose();
});
test('stop fades from current gain, repeated renders do not restart it, other channels keep playing',async()=>{
 const h=harness(),music={assetId:'tone',token:'music',fadeIn:4},sound={assetId:'tone',token:'sfx',volume:.6};h.player.update({music,sound},resources,prefs);await flush();h.step(2000);assert.equal(h.audios[0].volume,.5);const stop={music:{token:'stop',fadeOut:2}};h.player.update({sound},resources,prefs,stop);h.step(1000);assert.equal(h.audios[0].volume,.25);assert.equal(h.audios[1].volume,.6);h.player.update({sound},resources,prefs,stop);h.step(1000);assert.equal(h.audios[0].paused,true);assert.equal(h.audios[1].paused,false);h.player.dispose();assert.equal(h.audios[1].paused,true);assert.equal(h.tasks.size,0);
});
test('replace, immediate voice stop, natural ending and StrictMode disposal remove callbacks and stale promises',async()=>{
 let reject;const h=harness(()=>new Promise((resolve,r)=>{reject=r;}));h.player.update({voice:{assetId:'tone',token:'voice'}},resources,prefs);assert.equal(h.voices.at(-1),true);h.player.update({},resources,prefs);assert.equal(h.voices.at(-1),false);assert.equal(h.audios[0].onended,null);reject(Object.assign(Error(),{name:'NotAllowedError'}));await flush();assert.deepEqual(h.statuses,[]);
 h.player.dispose();h.player.update({music:{assetId:'tone',token:'late'}},resources,prefs);assert.equal(h.audios.length,1);
 const other=harness(),natural={voice:{assetId:'tone',token:'natural'}};other.player.update(natural,resources,prefs);await flush();other.audios[0].onended();assert.equal(other.voices.at(-1),false);assert.equal(other.audios[0].paused,true);other.player.update(natural,resources,{...prefs,voice:.5});assert.equal(other.audios.length,1,'An unrelated render must not replay a completed recording');other.player.dispose();
});
test('failed play and late decode failure are visible, old decode callbacks cannot stop replacement',async()=>{
 const blocked=harness(()=>Promise.reject(Object.assign(Error(),{name:'NotAllowedError'})));blocked.player.update({voice:{assetId:'tone',token:'blocked'}},resources,prefs);await flush();assert.match(blocked.statuses.at(-1),/разрешил звук/);assert.equal(blocked.voices.at(-1),false);blocked.player.dispose();
 const h=harness();h.player.update({music:{assetId:'tone',token:'old'}},resources,prefs);const oldError=h.audios[0].onerror;h.player.update({music:{assetId:'tone',token:'new'}},resources,prefs);await flush();oldError();assert.equal(h.audios[1].paused,false);h.audios[1].onerror();assert.match(h.statuses.at(-1),/Проверьте аудиофайл/);h.player.dispose();
});
test('new track interrupts an outgoing fade and source replacement reloads the actual media',async()=>{
 const h=harness();h.player.update({music:{assetId:'tone',token:'old'}},resources,prefs);await flush();h.player.update({},resources,prefs,{music:{token:'stop',fadeOut:2}});h.step(500);h.player.update({music:{assetId:'tone',token:'new'}},resources,prefs);await flush();assert.equal(h.audios[0].paused,true);assert.equal(h.audios[1].volume,1);h.step(5000);assert.equal(h.audios[1].paused,false);
 h.player.update({music:{assetId:'tone',token:'new'}},[{...resources[0],source:'repaired.wav'}],prefs);assert.equal(h.audios[1].paused,true);assert.equal(h.audios[2].src,'repaired.wav');h.player.dispose();
});
test('preview stop commands retain fade but never persist transient deadlines or resurrect stopped tracks',()=>{
 const p=createProject(),s=Object.values(p.scenes)[0];p.resources=resources;s.actions=[{id:'music',type:'music',assetId:'tone',fadeIn:2},{id:'text',type:'narration',text:'До'},{id:'stop',type:'stopMusic',fadeOut:3},{id:'after',type:'narration',text:'После'}];let state=advancePreview(p,initialPreview(p,s.id));assert.equal(state.audio.music.fadeIn,2);state=advancePreview(p,state);assert.equal(state.audio.music,undefined);assert.equal(state.audioStops.music.fadeOut,3);const packed=packPreview(state);assert.equal(packed.audioStops,undefined);assert.deepEqual(unpackPreview(p,packed).audio,{});
 s.actions=[{id:'sound',type:'sound',assetId:'tone'},{id:'first',type:'narration',text:'1'},{id:'stop',type:'stopAudio',channel:'sound',fadeOut:1},{id:'second',type:'narration',text:'2'}];state=advancePreview(p,initialPreview(p,s.id));state=advancePreview(p,state);assert.equal(state.audioStops.sound.fadeOut,1);assert.equal(state.audio.sound,undefined);
});
