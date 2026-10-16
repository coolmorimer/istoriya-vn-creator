import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRuntimeReport} from '../runtime/runtime-verification.mjs';
import {builderInternals} from '../runtime/builder.mjs';
import fs from 'node:fs/promises';
const green='[rpytest] Status: PASSED\nTest cases : 5 | 5 passed\nAssertions : 14 | 14 passed';
test('RenPy recovery cannot conceal an init traceback behind PASSED',()=>{
 assert.equal(parseRuntimeReport(green,0,5).passed,true);
 for(const error of ['Full traceback:','Traceback (most recent call last):',"ModuleNotFoundError: No module named 'gui7'",'While running game code:','An exception has occurred']) {
  const report=parseRuntimeReport(`${error}\n${green}`,0,5);
  assert.equal(report.passed,false);assert.equal(report.runtimeException,true);
 }
 assert.equal(parseRuntimeReport(green,1,5).passed,false);
 assert.equal(parseRuntimeReport(green,0,6).passed,false);
 assert.equal(parseRuntimeReport(green.replace('14 passed','13 passed'),0,5).passed,false);
 assert.equal(parseRuntimeReport('',0,0).passed,false);
});
test('build subprocess rejects a recovered exception even with exit zero',async()=>{
 await assert.rejects(builderInternals.runProcess(process.execPath,['-e',"console.log('Full traceback:\\nModuleNotFoundError: gui7')"]),/ModuleNotFoundError/);
 const result=await builderInternals.runProcess(process.execPath,['-e',"console.log('compiled')"]);
 assert.match(result.stdout,/compiled/);
});
test('native build and installer require fresh adjacent compiler hashes, not only an EXE version',async()=>{
 const build=await fs.readFile('scripts/native.ps1','utf8'),guard=await fs.readFile('scripts/verify-native-bundle.ps1','utf8'),installer=await fs.readFile('scripts/build-native-installer.ps1','utf8');
 assert.match(build,/sync-native-runtime\.mjs/);assert.match(guard,/native-runtime-check\.json/);assert.match(guard,/Stale compiler module/);assert.match(installer,/verify-native-bundle\.ps1/);
});
