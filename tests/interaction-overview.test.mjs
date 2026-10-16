import test from 'node:test';
import assert from 'node:assert/strict';
import {sceneInteractionOverview,interactionOverviewPage} from '../src/domain/interactionOverview.js';

test('exploration overview includes every independent prop, recordings and configuration warnings without evaluating player gates',()=>{
 const scene={images:[{id:'key',name:'Ключ',resourceId:'image',interactions:[{id:'take',label:'Подобрать',voiceAssetId:'voice',soundAssetId:'sound',condition:{flagId:'later',value:true}}]},{id:'door',name:'Дверь',resourceId:'missing',visible:false,opacity:0},{id:'table',name:'Стол',resourceId:'image',interactions:[]}]};
 const resources=[{id:'image',name:'Предмет',fileName:'предмет.png',source:'asset://own/prop.png'}],before=structuredClone({scene,resources});
 const entries=sceneInteractionOverview(scene,resources);
 assert.deepEqual(entries.map(entry=>[entry.id,entry.reactionCount,entry.voiceCount,entry.soundCount]),[['key',1,1,1],['door',0,0,0],['table',0,0,0]]);
 assert.deepEqual(entries[0].warnings,[]);assert.deepEqual(entries[1].warnings,['Нет изображения','Скрыт при старте','Прозрачный']);assert.equal(entries[1].source,null);
 assert.deepEqual({scene,resources},before);assert.equal(interactionOverviewPage(entries,'КЛЮЧ Подобрать').entries[0].id,'key');assert.equal(interactionOverviewPage(entries,'предмет.png').count,2);
});

test('bounded pages and search reach the final prop, clamp removed pages and retain original order',()=>{
 const entries=sceneInteractionOverview({images:Array.from({length:1001},(_,i)=>({id:`p${i}`,name:`Предмет ${i}`,resourceId:'image'}))},[{id:'image',source:'image.png'}]);
 const first=interactionOverviewPage(entries);assert.equal(first.entries.length,12);assert.equal(first.pages,84);assert.equal(first.count,1001);
 const last=interactionOverviewPage(entries,'',999);assert.equal(last.page,83);assert.equal(last.entries.at(-1).id,'p1000');
 assert.equal(interactionOverviewPage(entries,'Предмет 1000',83).entries[0].id,'p1000');assert.equal(interactionOverviewPage(entries,'нет совпадений',83).page,0);
 assert.deepEqual(interactionOverviewPage(entries,'',-2).entries,first.entries);assert.equal(interactionOverviewPage(entries,'',NaN).page,0);assert.throws(()=>interactionOverviewPage(entries,'',0,0),/положительным/);
});

test('empty scenes and legacy unnamed layers have safe, non-mutating overview states',()=>{
 assert.deepEqual(sceneInteractionOverview({}),[]);assert.deepEqual(interactionOverviewPage([]),{entries:[],count:0,page:0,pages:1});
 const [entry]=sceneInteractionOverview({images:[{id:'legacy',resourceId:'old'}]},[{id:'old',source:'data:image/png;base64,AA=='}]);assert.equal(entry.name,'Предмет');assert.deepEqual(entry.warnings,[]);assert.equal(entry.reactionCount,0);
});
