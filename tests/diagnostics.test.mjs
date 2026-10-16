import test from 'node:test';
import assert from 'node:assert/strict';
import {createDiagnostics,rendererErrorDetails,installDiagnosticListeners} from '../src/platform/diagnostics.js';
import {visibleDialogControl,holdDialogActionFocus} from '../src/domain/dialogFocus.js';
test('async dialog actions hold focus while a button is disabled and restore only their own focus',()=>{
 const document={},button={isConnected:true,disabled:false,focus(){document.activeElement=this;}},root={isConnected:true,ownerDocument:document,contains:el=>el===button,focus(){document.activeElement=this;}};document.activeElement=button;const restore=holdDialogActionFocus(root);assert.equal(document.activeElement,root);button.disabled=true;restore();assert.equal(document.activeElement,root);button.disabled=false;restore();assert.equal(document.activeElement,button);document.activeElement=button;const next=holdDialogActionFocus(root);const other={};document.activeElement=other;next();assert.equal(document.activeElement,other);root.isConnected=false;document.activeElement=root;next();assert.equal(document.activeElement,root);
});
test('dialog focus excludes closed details descendants even when Chromium retains their layout rectangles',()=>{
 const summary={},closed={querySelector:()=>summary};const field={getClientRects:()=>[{}],closest:()=>closed,checkVisibility:()=>false};assert.equal(visibleDialogControl(field),false);Object.assign(summary,{getClientRects:()=>[{}],closest:()=>closed,checkVisibility:()=>true});assert.equal(visibleDialogControl(summary),true);assert.equal(visibleDialogControl({...field,closest:()=>null,checkVisibility:()=>true}),true);assert.equal(visibleDialogControl({...field,getClientRects:()=>[]}),false);
});
test('renderer diagnostics fingerprint failures without content, paths, filenames or arbitrary fields',async()=>{
 const error=new TypeError('SECRET STORY C:/Users/owner file://private data:audio/wav;base64,AAA token=123');error.stack='TypeError: SECRET\n at app (http://tauri.localhost/assets/App-PRIVATE.js:18:9)\n at C:/Users/private/file.js:32:2';
 const details=await rendererErrorDetails('render',error);assert.equal(details.errorType,'TypeError');assert.equal(details.kind,'render');assert.match(details.fingerprint,/^[0-9a-f]{64}$/);assert.deepEqual(details.frames,[{line:18,column:9},{line:32,column:2}]);for(const text of ['SECRET','owner','private','PRIVATE','data:','token'])assert.ok(!JSON.stringify(details).includes(text));
 assert.equal((await rendererErrorDetails('secret',{name:'secret',message:'',stack:''})).errorType,'Error');assert.equal((await rendererErrorDetails('secret',null)).kind,'window-error');
 const hostile={get name(){throw Error('secret');}};assert.equal((await rendererErrorDetails('render',hostile)).errorType,'Error');
});
test('native error queue is bounded, flushed before report, and never serializes projects',async()=>{
 let release;const gate=new Promise(resolve=>{release=resolve;}),calls=[];
 const api=createDiagnostics({call:async(op,payload)=>{calls.push({op,payload});if(op==='renderer-error')await gate;if(op==='diagnostics')return {report:'safe',version:'test'};},now:()=>1});
 const jobs=Array.from({length:200},()=>api.record('window-error',Error('SECRET')));release();await Promise.all(jobs);const snapshot=await api.snapshot();assert.equal(snapshot.backend,'rust');assert.equal(calls.filter(c=>c.op==='renderer-error').length,16);assert.equal(calls.at(-1).op,'diagnostics');assert.ok(!JSON.stringify(calls).includes('SECRET'));assert.ok(!JSON.stringify(calls).includes('project'));
});
test('browser and unavailable native diagnostics state limitations without claiming disk persistence',async()=>{
 const browser=createDiagnostics({version:'test',now:()=>7});for(let n=0;n<70;n++)await browser.record('unhandled-rejection','PRIVATE');const snapshot=await browser.snapshot(),report=JSON.parse(snapshot.report);assert.equal(snapshot.backend,'browser');assert.equal(snapshot.journalAvailable,false);assert.equal(report.events.length,64);assert.equal(report.collectedAt,7);assert.ok(!snapshot.report.includes('PRIVATE'));await assert.rejects(browser.openLogs(),/только в памяти/);
 const failing=createDiagnostics({call:async()=>{throw Error('PRIVATE NATIVE ERROR');},version:'test'});await failing.record('bootstrap',Error('SECRET'));const fallback=await failing.snapshot();assert.equal(fallback.backend,'unavailable');assert.equal(JSON.parse(fallback.report).journal.droppedEvents,1);assert.ok(!fallback.report.includes('PRIVATE'));assert.ok(!fallback.report.includes('SECRET'));
});
test('copy and log actions require explicit native acknowledgement and preserve failures',async()=>{
 const calls=[],api=createDiagnostics({call:async(op,payload)=>{calls.push([op,payload]);return op==='copy-diagnostics'?{copied:true}:{opened:true};}});
 assert.equal((await api.copy()).copied,true);assert.equal((await api.openLogs()).opened,true);assert.deepEqual(calls,[['copy-diagnostics',undefined],['open-logs',undefined]]);
 const noop=createDiagnostics({call:async()=>({})});await assert.rejects(noop.copy(),/не подтверждено/);await assert.rejects(noop.openLogs(),/не подтверждено/);
 const rejected=createDiagnostics({call:async()=>{throw Error('Буфер обмена занят');}});await assert.rejects(rejected.copy(),/занят/);
 const nativeString=createDiagnostics({call:async()=>{throw 'Нативная строковая ошибка';}});await assert.rejects(nativeString.copy(),/Нативная строковая ошибка/);await assert.rejects(nativeString.openLogs(),/Нативная строковая ошибка/);
});
test('diagnostics listeners record runtime/rejection events once and can be removed',async()=>{
 const target=new EventTarget(),calls=[];const dispose=installDiagnosticListeners(target,{record:async(...args)=>calls.push(args)});const error=new Event('error');error.error=Error('private');target.dispatchEvent(error);const rejection=new Event('unhandledrejection');rejection.reason='private';target.dispatchEvent(rejection);assert.deepEqual(calls.map(c=>c[0]),['window-error','unhandled-rejection']);dispose();target.dispatchEvent(error);assert.equal(calls.length,2);
});
