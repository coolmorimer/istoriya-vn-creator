// Reproducible, valid synthetic media. Never uses the owner's application data.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createProject} from '../src/domain/projectFactory.js';
import {solidPng} from './qa-png.mjs';
const json=async file=>JSON.parse((await fs.readFile(file,'utf8')).replace(/^\uFEFF/,''));
const metadata=await json('.artifacts/native-ui-qa-location.json'),processResult=await json(path.join(metadata.run,'process-result.json'));assert.equal(processResult.ExitCode,0);assert.equal(processResult.TimedOut,false);
const root=await fs.realpath(metadata.root),info=await json(path.join(root,'ui-profile.json')),profile=await fs.realpath(info.profile);assert.equal(path.dirname(profile),root);assert.equal(path.basename(profile),info.marker);assert.equal(await fs.readFile(path.join(profile,'qa-profile-marker'),'utf8'),info.marker);
const workspace=path.join(profile,'workspace'),file=path.join(workspace,'workspace.json');assert.equal(await fs.stat(file).then(()=>true,()=>false),false,'Refusing to replace an existing QA library');await fs.mkdir(path.join(workspace,'assets'),{recursive:true});
const p=createProject({title:'Большая история — QA',resolution:{width:1280,height:720}}),base=structuredClone(Object.values(p.scenes)[0]);p.id='large-library-qa';p.scenes={};p.chapters=[];p.resources=[];
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');let mediaBytes=0;
for(let i=0;i<5000;i++){
 const payload=Buffer.alloc(1024);payload.writeUInt32LE(i);const bytes=Buffer.concat([solidPng(32,32,[i%251,(i*7)%251,(i*13)%251,255]),payload]),sha256=digest(bytes),asset=path.join(workspace,'assets',`${sha256}.png`);await fs.writeFile(asset,bytes,{flag:'wx'});mediaBytes+=bytes.length;
 p.resources.push({id:`large-resource-${i}`,name:`Изображение ${String(i+1).padStart(4,'0')}`,fileName:`изображение-${i+1}.png`,category:i%10===0?'background':'prop',mime:'image/png',source:pathToFileURL(asset).href,width:32,height:32,size:bytes.length});
}
for(let c=0;c<10;c++){const chapter={id:`large-chapter-${c}`,title:`Глава ${c+1}`,scenes:[]};p.chapters.push(chapter);for(let j=0;j<50;j++){
 const i=c*50+j,id=`large-scene-${i}`;p.scenes[id]={...structuredClone(base),id,title:`Сцена ${i+1}`,number:`${c+1}.${j+1}`,backgroundResourceId:p.resources[i*10].id,background:null,characters:[],images:Array.from({length:9},(_,k)=>({id:`prop-${i}-${k}`,name:`Декорация ${k+1}`,resourceId:p.resources[i*10+k+1].id,x:10+k*10,y:70,width:5,height:10,scale:100,rotation:0,opacity:100,visible:true,zOrder:50+k,interactions:[]})),actions:Array.from({length:10},(_,a)=>({id:`large-action-${i}-${a}`,type:'narration',text:`Сцена ${i+1}, реплика ${a+1}. Проверяем большой проект.`,textStyle:{speed:0}}))};chapter.scenes.push(id);
}}
await fs.writeFile(file,JSON.stringify({values:{'istoriya-project-v2':JSON.stringify(p),'istoriya-project-library-v1':JSON.stringify([p])},locations:{}}),{flag:'wx'});
const result={root,profile,workspace,projectId:p.id,scenes:500,steps:5000,resources:5000,mediaBytes,workspaceBytes:(await fs.stat(file)).size,firstResourceSha256:digest(await fs.readFile(new URL(p.resources[0].source))),lastResourceSha256:digest(await fs.readFile(new URL(p.resources.at(-1).source)))};await fs.writeFile('.artifacts/large-library-fixture.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
