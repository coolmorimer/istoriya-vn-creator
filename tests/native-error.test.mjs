import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeError,createNativeCaller} from '../src/platform/nativeError.js';
test('native string failures reach UI Error.message, not a generic build failure',async()=>{
 const detail='Не удалось запустить компонент сборки: EISDIR';
 await assert.rejects(createNativeCaller(async()=>{throw detail;})('build',{project:{id:'p'}}),error=>error instanceof Error&&error.message===detail);
 const original=Error('Диск недоступен');assert.equal(nativeError(original),original);assert.equal(nativeError({message:'Запись отклонена'}).message,'Запись отклонена');assert.match(nativeError({token:'must not be displayed'}).message,/Повторите/);
});
test('native caller keeps operation and payload unchanged and returns successful results',async()=>{
 const project={id:'p'},calls=[];const call=createNativeCaller(async(...args)=>{calls.push(args);return {packagePath:'game.zip'};});
 assert.deepEqual(await call('build',{project,platform:'windows'}),{packagePath:'game.zip'});assert.deepEqual(calls,[['desktop',{operation:'build',payload:{project,platform:'windows'}}]]);
});
