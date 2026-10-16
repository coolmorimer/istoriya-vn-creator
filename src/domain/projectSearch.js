import {storyDestinations} from './storyDestinations.js';
export const SEARCH_TYPES=[['all','Всё'],['scenes','Главы и сцены'],['text','Текст'],['objects','Предметы'],['characters','Герои'],['resources','Ресурсы'],['inventory','Инвентарь'],['gallery','Галерея']];
export const searchFold=value=>String(value??'').normalize('NFKC').toLocaleLowerCase('ru').replaceAll('ё','е');
export function projectSearchIndex(project){
 const entries=[],add=(category,title,detail,text,location)=>entries.push({key:JSON.stringify([category,location]),category,title,detail,excerpt:String(text??'').slice(0,180),search:searchFold(`${title} ${detail} ${text??''}`),location:{...location,projectId:project.id}});
 for(const entry of storyDestinations(project)){if(entry.chapterId)add('scenes',entry.title,entry.detail,'',{kind:'chapter',id:entry.chapterId});else{
  const scene=project.scenes[entry.sceneId];add('scenes',entry.title,entry.detail,scene.description,{kind:'scene',id:scene.id});
  scene.actions.forEach((action,index)=>{const text=[action.text,action.prompt,...(action.options??[]).map(o=>o.text)].filter(Boolean).join('\n');if(text)add('text',`Шаг ${index+1} · ${action.type==='choice'?'Выбор':action.type==='dialogue'?'Реплика':'Текст'}`,`${entry.detail} · ${entry.title}`,text,{kind:'scene',id:scene.id,actionId:action.id});});
  for(const layer of scene.images??[]){add('objects',layer.name||'Предмет',`${entry.detail} · ${entry.title}`,'',{kind:'scene',id:scene.id,layerId:layer.id});(layer.interactions??[]).forEach((reaction,reactionIndex)=>add('objects',reaction.label||'Реакция',`${layer.name||'Предмет'} · ${entry.detail} · ${entry.title}`,reaction.text,{kind:'scene',id:scene.id,layerId:layer.id,...(reaction.id?{reactionId:reaction.id}:{reactionIndex})}));}
 }}
 for(const character of project.characters??[]){add('characters',character.name,'Персонаж','',{kind:'character',id:character.id});for(const sprite of character.sprites??[])add('characters',sprite.name||'Основной спрайт',character.name,'',{kind:'character',id:character.id,spriteId:sprite.id});}
 for(const resource of project.resources??[])add('resources',resource.name,resource.fileName||'Ресурс проекта','',{kind:'resource',id:resource.id});
 for(const item of project.items??[])add('inventory',item.name,'Инвентарь',item.description,{kind:'inventory',id:item.id});
 for(const section of project.gallery?.sections??[]){add('gallery',section.title,'Раздел галереи','',{kind:'gallery',id:section.id});section.items.forEach((item,itemIndex)=>add('gallery',item.title||'Изображение',section.title,'',{kind:'gallery',id:section.id,...(item.id?{itemId:item.id}:{itemIndex})}));}
 return entries;
}
export function searchProject(entries,query='',category='all'){
 const phrase=searchFold(query).trim().replace(/\s+/g,' '),words=phrase.split(' ').filter(Boolean),matches=entries.filter(e=>(category==='all'||e.category===category)&&words.every(word=>e.search.includes(word)));
 if(!phrase)return matches;return [...matches.filter(e=>searchFold(e.title).includes(phrase)),...matches.filter(e=>!searchFold(e.title).includes(phrase))];
}
export function searchPage(entries,page=0,size=8){if(!Number.isSafeInteger(size)||size<1)throw Error('Неверный размер страницы поиска.');const pages=Math.max(1,Math.ceil(entries.length/size)),current=Math.max(0,Math.min(pages-1,Number.isSafeInteger(page)?page:0));return {entries:entries.slice(current*size,(current+1)*size),page:current,pages,count:entries.length};}
export const plainNavigationKey=event=>!event.isComposing&&!event.shiftKey&&!event.ctrlKey&&!event.metaKey&&!event.altKey;
