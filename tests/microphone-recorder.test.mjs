import test from 'node:test';import assert from 'node:assert/strict';
import {createMicrophoneRecorder,pcmMonoWav,microphoneError} from '../src/domain/microphoneRecorder.js';
const buffer=()=>({length:4,sampleRate:48000,numberOfChannels:2,getChannelData:i=>new Float32Array(i?[1,-1,1,NaN]:[1,-1,0,1])});
function harness({getStream,decode,maxBytes,maxSeconds}={}){
 let recorder,interval,closed=0,stops=0,clock=0;const states=[],failures=[],ticks=[],track={stop:()=>stops++},stream={getTracks:()=>[track]};
 class Recorder{static isTypeSupported=type=>type.startsWith('audio/webm');constructor(s,o){assert.equal(s,stream);recorder=this;this.mimeType=o.mimeType;this.state='inactive';}start(){this.state='recording';}stop(){this.state='inactive';queueMicrotask(()=>{this.ondataavailable?.({data:new Blob(['encoded audio'])});this.onstop?.();});}}
 class Context{async decodeAudioData(bytes){assert.ok(bytes.byteLength);return decode?decode(bytes):buffer();}async close(){closed++;}}
 const result=createMicrophoneRecorder({mediaDevices:{getUserMedia:getStream??(async options=>{assert.deepEqual(options,{audio:true,video:false});return stream;})},MediaRecorderClass:Recorder,AudioContextClass:Context,interval:fn=>{interval=fn;return 1;},clear:()=>{interval=null;},now:()=>clock,maxBytes,maxSeconds,onState:state=>states.push(state),onElapsed:seconds=>ticks.push(seconds),onFailure:message=>failures.push(message),onLimit:()=>{void result.finish();}});
 return {result,states,failures,ticks,stream,get recorder(){return recorder;},get stops(){return stops;},get closed(){return closed;},step(seconds){clock+=seconds*1000;interval?.();}};
}
test('PCM converter produces real mono 16-bit WAV, mixes channels and clamps invalid samples',async()=>{
 const blob=pcmMonoWav(buffer()),bytes=await blob.arrayBuffer(),view=new DataView(bytes),ascii=new TextDecoder().decode(bytes);assert.equal(blob.type,'audio/wav');assert.equal(ascii.slice(0,4),'RIFF');assert.equal(ascii.slice(8,12),'WAVE');assert.equal(view.getUint16(22,true),1);assert.equal(view.getUint32(24,true),48000);assert.equal(view.getUint32(40,true),8);assert.deepEqual(Array.from({length:4},(_,i)=>view.getInt16(44+i*2,true)),[32767,-32768,16384,16384]);assert.throws(()=>pcmMonoWav({...buffer(),length:0}),/пустая/);assert.throws(()=>pcmMonoWav({...buffer(),sampleRate:1}),/формат/);
});
test('microphone is requested only on start, final dataavailable is included, stream/context close and finish is idempotent',async()=>{
 const h=harness();assert.deepEqual(h.states,[]);assert.equal(h.recorder,undefined);await h.result.start();assert.deepEqual(h.states,['requesting','recording']);const one=h.result.finish(),two=h.result.finish();assert.equal(one,two);const file=await one;assert.match(file.name,/^Голос-\d+\.wav$/);assert.equal(file.type,'audio/wav');assert.equal(file.size,52);assert.equal(h.closed,1);assert.equal(h.stops,1);h.result.cancel();assert.equal(h.recorder.ondataavailable,null);
});
test('cancel during pending permission releases late stream and never starts a recorder',async()=>{
 let allow;const h=harness({getStream:()=>new Promise(resolve=>{allow=resolve;})});const started=h.result.start();h.result.cancel();allow(h.stream);await assert.rejects(started,{name:'AbortError'});assert.equal(h.stops,1);assert.equal(h.recorder,undefined);assert.deepEqual(h.states,['requesting']);
});
test('permission denial is actionable and cancellation while recording leaves no output',async()=>{
 const h=harness({getStream:()=>Promise.reject(Object.assign(Error('Denied'),{name:'NotAllowedError'}))});await assert.rejects(h.result.start(),{name:'NotAllowedError'});assert.match(microphoneError(Object.assign(Error(),{name:'NotAllowedError'})),/Нет доступа/);assert.match(microphoneError(Object.assign(Error(),{name:'NotFoundError'})),/не найден/);
 const canceled=harness();await canceled.result.start();canceled.result.cancel();await assert.rejects(canceled.result.finish(),{name:'AbortError'});assert.equal(canceled.closed,0);assert.equal(canceled.stops,1);
});
test('limits stop recording and decode errors still release stream and audio context',async()=>{
 const h=harness({maxSeconds:2});await h.result.start();h.step(3);const file=await h.result.finish();assert.equal(file.size,52);assert.deepEqual(h.ticks,[2]);assert.equal(h.stops,1);
 const broken=harness({decode:()=>Promise.reject(Error('bad codec'))});await broken.result.start();await assert.rejects(broken.result.finish(),/bad codec/);assert.equal(broken.closed,1);assert.equal(broken.stops,1);assert.match(microphoneError(Error('bad codec')),/Не удалось записать/);
 const large=harness({maxBytes:2});await large.result.start();await assert.rejects(large.result.finish(),/слишком большая/);assert.match(large.failures[0],/слишком большая/);assert.ok(large.stops>0);
});
