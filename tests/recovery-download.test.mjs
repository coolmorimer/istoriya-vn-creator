import test from 'node:test';
import assert from 'node:assert/strict';
import {saveRecoveryCopy,saveRawRecovery} from '../src/platform/recoveryDownload.js';
test('native recovery saves the supplied draft, forwards reference-only explicitly and never fakes a browser download',async()=>{
 const draft={id:'draft'},calls=[],desktop={saveRecoveryProject:async(project,options)=>{calls.push({project,options});return {canceled:true};},portableProject(){throw Error('Must not hydrate twice');}};
 const result=await saveRecoveryCopy(draft,desktop,{referencesOnly:true},()=>{throw Error('Native fallback is not a file save');});assert.equal(result.canceled,true);assert.deepEqual(calls,[{project:draft,options:{referencesOnly:true}}]);
});
test('native write failure remains an error and browser recovery downloads only the selected portable project',async()=>{
 await assert.rejects(saveRecoveryCopy({id:'draft'},{saveRecoveryProject:async()=>{throw Error('Disk full');}},undefined,()=>{throw Error('Must not pretend success');}),/Disk full/);
 const p={id:'one'},portable={id:'one',source:'data:example'},downloads=[];const result=await saveRecoveryCopy(p,{portableProject:async project=>{assert.strictEqual(project,p);return portable;}},undefined,value=>downloads.push(value));assert.equal(result.browser,true);assert.deepEqual(downloads,[portable]);
});
test('raw recovery preserves malformed text through native save or explicit browser JSON download',async()=>{
 const raw='{broken',calls=[];assert.equal((await saveRawRecovery(raw,{saveRecoveryRaw:async value=>{assert.equal(value,raw);return {canceled:false,filePath:'owned.json'};}})).filePath,'owned.json');await saveRawRecovery(raw,null,(...args)=>calls.push(args));assert.deepEqual(calls,[[raw,'istoriya-draft-original.json']]);
});
