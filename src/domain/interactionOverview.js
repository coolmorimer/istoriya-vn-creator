// Authoring inventory of scene layers. This describes configuration, not the
// player's current conditions/inventory (those remain in runtime/interactions).
export function sceneInteractionOverview(scene,resources=[]) {
 const media=new Map(resources.map(resource=>[resource.id,resource]));
 return (scene.images??[]).map(layer=>{
  const resource=media.get(layer.resourceId),reactions=layer.interactions??[],warnings=[];
  if(!resource?.source)warnings.push('Нет изображения');
  if(layer.visible===false)warnings.push('Скрыт при старте');
  if(layer.opacity===0)warnings.push('Прозрачный');
  return {
   id:layer.id,name:layer.name||'Предмет',source:resource?.source??null,
   reactionCount:reactions.length,voiceCount:reactions.filter(r=>r.voiceAssetId).length,soundCount:reactions.filter(r=>r.soundAssetId).length,warnings,
   search:[layer.name,resource?.name,resource?.fileName,...reactions.map(r=>r.label)].filter(Boolean).join(' ').toLocaleLowerCase('ru'),
  };
 });
}

export function interactionOverviewPage(entries,query='',page=0,pageSize=12) {
 if(!Number.isSafeInteger(pageSize)||pageSize<1)throw Error('Размер страницы должен быть положительным целым числом.');
 const words=String(query).trim().toLocaleLowerCase('ru').split(/\s+/).filter(Boolean);
 const filtered=words.length?entries.filter(entry=>words.every(word=>entry.search.includes(word))):entries;
 const pages=Math.max(1,Math.ceil(filtered.length/pageSize));
 const current=Math.max(0,Math.min(pages-1,Number.isSafeInteger(page)?page:0));
 return {entries:filtered.slice(current*pageSize,(current+1)*pageSize),count:filtered.length,page:current,pages};
}
