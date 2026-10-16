import {authorUi} from './uiAuthoring.js';
export function authorFont(project,request,id){
 if(project.id!==request.projectId)throw Error('Открыт другой проект. Повторите импорт шрифта.');
 const target=request.target??{kind:'default'};
 const action=target.kind==='action'?project.scenes[target.sceneId]?.actions.find(a=>a.id===target.actionId):null;
 if(target.kind==='action'&&!action)throw Error('Реплика удалена. Повторите импорт шрифта.');
 if(!['default','action','layout'].includes(target.kind))throw Error('Неизвестное назначение шрифта.');
 const resource=project.resources.find(r=>r.category==='font'&&r.source===request.resource.source)??{...request.resource,id,category:'font'};
 if(!resource.source||!['font/ttf','font/otf'].includes(resource.mime))throw Error('Выберите исправный TTF или OTF.');
 if(target.kind==='layout')authorUi(project,{projectId:project.id,screen:target.screen,target:target.elementId,patch:{font:resource.id}});
 else if(action)action.textStyle={...action.textStyle,font:resource.id};
 else project.ui.textStyle={...project.ui.textStyle,font:resource.id};
 if(!project.resources.some(r=>r.id===resource.id))project.resources.push(resource);
 return resource.id;
}
