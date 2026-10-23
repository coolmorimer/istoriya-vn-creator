import {searchFold} from './projectSearch.js';
export function sceneTreeGroups(project){
 const groups=project.chapters.map(chapter=>({chapter,virtual:false,key:`chapter:${chapter.id}`})),placed=new Set(project.chapters.flatMap(c=>c.scenes)),unassigned=Object.keys(project.scenes).filter(id=>!placed.has(id)).sort();
 if(unassigned.length){let id='@istoriya:unassigned';while(project.chapters.some(c=>c.id===id))id+=':';groups.push({chapter:{id,title:'Вне глав',scenes:unassigned},virtual:true,key:'group:unassigned'});}
 return groups;
}
export function shouldRevealTreeScene(previous,active,request){return !!previous&&(previous.active!==active||previous.request!==request);}
export function readCollapsedChapters(storage,projectId){try{const value=JSON.parse(storage.getItem(`istoriya-tree-v1:${projectId}`)??'[]');return new Set(Array.isArray(value)?value.filter(id=>typeof id==='string').slice(0,10000):[]);}catch{return new Set();}}
export function saveCollapsedChapters(storage,projectId,collapsed){try{storage.setItem(`istoriya-tree-v1:${projectId}`,JSON.stringify([...collapsed].slice(0,10000)));}catch{/* Layout preferences must not prevent editing or saving the story. */}}
export function sceneTreeRows(project,collapsed=new Set(),query=''){
 const words=searchFold(query).trim().split(/\s+/).filter(Boolean),matches=value=>words.every(w=>searchFold(value).includes(w)),rows=[];let top=0;
 const groups=sceneTreeGroups(project);
 groups.forEach(({chapter,virtual,key},chapterIndex)=>{
  const chapterMatch=words.length&&matches(chapter.title),scenes=chapter.scenes.map((id,index)=>({scene:project.scenes[id],index})).filter(({scene})=>scene&&(chapterMatch||matches(`${scene.number??''} ${scene.title} ${scene.description??''}`)));
  if(words.length&&!chapterMatch&&!scenes.length)return;
  const expanded=!!words.length||!collapsed.has(chapter.id);rows.push({key,kind:'chapter',chapter,virtual,chapterIndex,expanded,top,height:36});top+=36;
  if(expanded)for(const {scene,index}of scenes){rows.push({key:`scene:${scene.id}`,parentKey:key,kind:'scene',scene,chapter,virtual,chapterIndex,index,top,height:60});top+=60;}
 });return {rows,totalHeight:top,groups};
}
export function treeWindow(rows,scrollTop,height,overscan=3){
 const top=Math.max(0,Number(scrollTop)||0),bottom=top+Math.max(1,Number(height)||1);let low=0,high=rows.length;
 while(low<high){const mid=(low+high)>>>1;if(rows[mid].top+rows[mid].height<=top)low=mid+1;else high=mid;}
 const start=Math.max(0,low-overscan);let end=low;while(end<rows.length&&rows[end].top<bottom)end++;return {start,end:Math.min(rows.length,end+overscan)};
}
export function treeScroll(row,top,height){if(row.top<top)return row.top;return row.top+row.height>top+height?Math.max(0,row.top+row.height-height):top;}
