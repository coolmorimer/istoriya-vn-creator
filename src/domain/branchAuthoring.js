// A new branch is an empty scene and a real option destination, never a
// map-only edge. Validate the captured authoring target before any mutation.
export function authorChoiceBranch(project,request,sceneId) {
 if(project.id!==request.projectId)throw Error('Открыт другой проект. Выберите вариант заново.');
 const source=project.scenes[request.sceneId],action=source?.actions?.find(a=>a.id===request.actionId&&a.type==='choice');
 const option=action?.options?.find(o=>o.id===request.optionId);
 if(!option)throw Error('Вариант больше не существует. Выберите его заново.');
 if(option.targetSceneId||option.targetChapterId)throw Error('У варианта уже есть переход. Сначала выберите пустое назначение.');
 const chapter=project.chapters.find(c=>c.scenes.includes(source.id));
 if(!chapter||!sceneId||project.scenes[sceneId])throw Error('Не удалось создать ветку в этой главе.');
 const chapterIndex=project.chapters.indexOf(chapter);
 project.scenes[sceneId]={id:sceneId,number:`${chapterIndex+1}.${chapter.scenes.length+1}`,title:String(option.text??'').trim().slice(0,120)||'Новая ветка',description:'',background:null,backgroundResourceId:null,transition:'none',duration:1,characters:[],images:[],actions:[]};
 chapter.scenes.push(sceneId);option.targetSceneId=sceneId;option.targetChapterId=null;
 return sceneId;
}
