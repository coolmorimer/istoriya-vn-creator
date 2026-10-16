import test from 'node:test';
import assert from 'node:assert/strict';
import {audioAttachmentStatus} from '../src/domain/audioAuthoring.js';

test('audio selection distinguishes no recording, deleted reference and a source-less resource without mutation',()=>{
 const resources=[{id:'empty',name:'Ответ',mime:'audio/wav'}],before=structuredClone(resources);
 assert.deepEqual(audioAttachmentStatus(resources,null),{resource:null,problem:null});
 assert.deepEqual(audioAttachmentStatus(resources,''),{resource:null,problem:null});
 assert.match(audioAttachmentStatus(resources,'deleted').problem,/не найдена/);
 assert.match(audioAttachmentStatus(resources,'empty').problem,/нет файла/);
 assert.equal(audioAttachmentStatus(resources,'empty').resource,resources[0]);
 assert.deepEqual(resources,before);
});

test('audio selection accepts legacy recordings and staged uploads, not an image with a misleading category',()=>{
 const legacy={id:'legacy',category:'voice',source:'voice.wav'},image={id:'image',category:'voice',mime:'image/png',source:'image.png'},upload={name:'Новая запись',mime:'audio/ogg',source:'data:audio/ogg;base64,AA=='};
 const resources=[legacy,image];
 assert.equal(audioAttachmentStatus(resources,'legacy').problem,null);
 assert.match(audioAttachmentStatus(resources,'image').problem,/не является аудиозаписью/);
 const status=audioAttachmentStatus(resources,'deleted',{resource:upload});
 assert.equal(status.resource,upload);assert.equal(status.problem,null);
 assert.equal(resources.length,2,'staging is not a project mutation');
});
