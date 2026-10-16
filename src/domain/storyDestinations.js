import {chapterEntry} from '../../runtime/story-routing.mjs';
const fold=value=>String(value??'').normalize('NFKC').toLocaleLowerCase('ru').replaceAll('ё','е');
const sceneFor=(project,id)=>id!=null&&Object.hasOwn(project.scenes??{},id)?project.scenes[id]:null;
export const destinationValue=(record,field='targetSceneId')=>({sceneId:record?.[field]??null,chapterId:record?.[field.replace('SceneId','ChapterId')]??null});
export const destinationPatch=(value,field='targetSceneId')=>({[field]:value.chapterId?null:value.sceneId||null,[field.replace('SceneId','ChapterId')]:value.chapterId||null});
export const destinationKey=value=>JSON.stringify(value.chapterId?['chapter',value.chapterId]:['scene',value.sceneId??null]);
export function destinationLabel(project,value,emptyLabel='Выберите сцену или главу') {
 if(value.chapterId){const c=project.chapters.find(c=>c.id===value.chapterId),entry=c&&sceneFor(project,chapterEntry(project,c.id));return {text:c?`Глава · ${c.title}`:'Глава недоступна',missing:!entry};}
 if(value.sceneId){const s=sceneFor(project,value.sceneId);return {text:s?`${s.number?`${s.number} · `:''}${s.title}`:'Сцена недоступна',missing:!s};}
 return {text:emptyLabel,missing:false};
}
export function storyDestinations(project,{allowChapters=true,withinChapterId=null}={}) {
 const entries=[],seen=new Set(),chapters=project.chapters.filter(c=>!withinChapterId||c.id===withinChapterId);
 const sceneEntry=(id,chapter)=>{
  const scene=sceneFor(project,id);if(!scene||seen.has(id))return;seen.add(id);
  const title=`${scene.number?`${scene.number} · `:''}${scene.title}`,detail=chapter?.title??'Вне глав';
  entries.push({sceneId:id,chapterId:null,key:destinationKey({sceneId:id}),title,detail,disabled:false,search:fold([scene.title,scene.number,chapter?.title,scene.description].join(' '))});
 };
 for(const chapter of chapters){
  const entry=sceneFor(project,chapterEntry(project,chapter.id));
  if(allowChapters&&!withinChapterId)entries.push({sceneId:null,chapterId:chapter.id,key:destinationKey({chapterId:chapter.id}),title:`Глава · ${chapter.title}`,detail:entry?`Вход: ${entry.number??''} ${entry.title}`:'Нет входной сцены',disabled:!entry,search:fold(`${chapter.title} ${entry?.title??''} ${entry?.number??''}`)});
  for(const id of chapter.scenes)sceneEntry(id,chapter);
 }
 if(!withinChapterId)for(const id of Object.keys(project.scenes))sceneEntry(id,null);
 return entries;
}
export function filterDestinations(entries,query) {
 const phrase=fold(query).trim().replace(/\s+/g,' '),words=phrase.split(' ').filter(Boolean);
 if(!words.length)return entries;
 const matches=entries.filter(entry=>words.every(word=>entry.search.includes(word)));
 // A chapter name such as "Глава 10" must precede accidental matches between
 // "Глава 1" and a scene's number 1.10. Preserve chapter order within each rank.
 return [...matches.filter(entry=>entry.search.includes(phrase)),...matches.filter(entry=>!entry.search.includes(phrase))];
}
export function destinationCursor(entries,current,key,pageSize=8) {
 const available=entries.map((entry,index)=>!entry.disabled?index:-1).filter(index=>index>=0);if(!available.length)return -1;
 const position=available.indexOf(current),start=position<0?0:position;
 if(key==='Home')return available[0];if(key==='End')return available.at(-1);
 if(position<0)return key==='ArrowUp'||key==='PageUp'?available.at(-1):available[0];
 const step=({ArrowDown:1,ArrowUp:-1,PageDown:pageSize,PageUp:-pageSize})[key]??0;
 return available[Math.max(0,Math.min(available.length-1,start+step))];
}
// Authoring APIs accept typed destinations. Legacy map tokens remain readable,
// but an explicit sceneId is never mistaken for a "chapter:" token.
export function resolveAuthorDestination(project,value) {
 const target=typeof value==='string'?(value.startsWith('chapter:')?{chapterId:value.slice(8)}:{sceneId:value}):value??{};
 if(target.chapterId){const sceneId=chapterEntry(project,target.chapterId);if(!sceneId||!sceneFor(project,sceneId))throw Error('Сначала добавьте в главу входную сцену.');return {sceneId,chapterId:target.chapterId};}
 if(target.sceneId&&!sceneFor(project,target.sceneId))throw Error('Сцена назначения не найдена');
 return {sceneId:target.sceneId||null,chapterId:null};
}
