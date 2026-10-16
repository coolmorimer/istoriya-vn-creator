import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createProject} from '../src/domain/projectFactory.js';
import {solidPng} from './qa-png.mjs';
const metadata=JSON.parse(await fs.readFile('.artifacts/native-ui-qa-location.json','utf8'));
const root=await fs.realpath(metadata.root),{profile,marker}=JSON.parse(await fs.readFile(path.join(root,'ui-profile.json'),'utf8')),base=await fs.realpath(profile);
assert.equal(path.dirname(base),root);assert.equal(path.basename(base),marker);assert.ok(marker.startsWith('ui-profile-'));
const workspace=path.join(base,'workspace'),file=path.join(workspace,'workspace.json');
if(await fs.stat(file).catch(()=>false))throw Error('Refusing to replace an existing QA library. Use a new empty QA profile.');
const assets=path.join(workspace,'assets');await fs.mkdir(assets,{recursive:true});const hashes=[];
const projects=[];
for(let group=0;group<2;group++){
 const p=createProject({title:`Нагрузка ${group+1} — QA`,resolution:{width:1280,height:720}});p.id=`media-qa-${group}`;p.resources=[];p.scenes={};p.chapters[0].scenes=[];
 for(let i=0;i<32;i++){
  // Deliberately padded valid PNGs measure transfer cost, not illustration quality.
  const image=Buffer.alloc(1024*1024,group*32+i);solidPng(256,144,[30+i*3,60,100+group*30,255]).copy(image);const filename=path.join(assets,`фон # % ${group}-${i}.png`);await fs.writeFile(filename,image);
  const id=`image-${group}-${i}`,source=pathToFileURL(filename).href;hashes.push({id,source,sha256:createHash('sha256').update(image).digest('hex')});p.resources.push({id,name:`Фон ${i+1}`,category:'background',mime:'image/png',width:256,height:144,size:image.length,source});
  const sceneId=`scene-${group}-${i}`;p.scenes[sceneId]={id:sceneId,title:`Кадр ${i+1}`,number:`1.${i+1}`,characters:[],images:[],backgroundResourceId:id,actions:[{id:`line-${i}`,type:'narration',text:`Проверка кадра ${i+1}.`,...(group===0?{voiceAssetId:'qa-voice'}:{})},{id:`end-${i}`,type:'end'}]};p.chapters[0].scenes.push(sceneId);
 }
 if(group===0){
  const voice=path.join(assets,'голос # %.wav'),font=path.join(assets,'шрифт # %.ttf');await fs.copyFile('examples/tea-with-goblins/assets/mystery.wav',voice);await fs.copyFile('public/fonts/DejaVuSans.ttf',font);
  p.resources.push({id:'qa-voice',name:'QA tone — not speech',category:'voice',mime:'audio/wav',source:pathToFileURL(voice).href},{id:'qa-font',name:'QA font',category:'font',mime:'font/ttf',source:pathToFileURL(font).href});p.ui.textStyle={font:'qa-font',size:32,speed:0};
  p.characters=[{id:'hero',name:'QA герой',color:'#ffffff',portrait:p.resources[1].source,sprites:[{id:'neutral',name:'Основной',source:p.resources[1].source,width:256,height:144}],defaultSpriteId:'neutral'}];
 }
 projects.push(p);
}
await fs.writeFile(file,JSON.stringify({values:{'istoriya-project-v2':JSON.stringify(projects[0]),'istoriya-project-library-v1':JSON.stringify(projects)},locations:{}}));
const unlisted=path.join(assets,'unlisted.png'),outside=path.join(root,'outside.png');await fs.writeFile(unlisted,solidPng(16,16,[1,2,3,255]));await fs.writeFile(outside,solidPng(16,16,[1,2,3,255]));
const report={root,profile:base,workspace,projects:2,scenes:64,paddedImageBytes:64*1024*1024,unlisted:pathToFileURL(unlisted).href,outside:pathToFileURL(outside).href,hashes};await fs.writeFile('.artifacts/media-load-fixture.json',JSON.stringify(report,null,2));console.log(JSON.stringify({root,projects:2,scenes:64,paddedImageBytes:report.paddedImageBytes},null,2));
