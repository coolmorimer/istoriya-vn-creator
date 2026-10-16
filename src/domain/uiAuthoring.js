import {defaultGameUi,gameUi,uiObject,uiElements,UI_SCREENS} from '../../runtime/game-ui.mjs';
export function authorUi(project,input,resourceId){
 if(project.id!==input.projectId)throw Error('Открыт другой проект. Повторите настройку интерфейса.');
 if(!UI_SCREENS.some(([id])=>id===input.screen))throw Error('Экран интерфейса не найден.');
 project.ui.layout??=defaultGameUi(project);
 project.ui.layout[input.screen]??=defaultGameUi(project)[input.screen];
 if(!['screen',...(gameUi(project)[input.screen].button?['button']:[]),...uiElements(project,input.screen).map(e=>e.id)].includes(input.target))throw Error('Элемент интерфейса удалён. Выберите его заново.');
 if(!uiObject(project.ui.layout,input.screen,input.target))project.ui.layout=gameUi(project);
 const object=uiObject(project.ui.layout,input.screen,input.target);if(!object)throw Error('Элемент интерфейса удалён. Выберите его заново.');
 project.ui.layout[input.screen].enabled=true;
 project.ui.layout.version=2;
 const patch={...input.patch};
 if(input.resource){let resource=project.resources.find(r=>r.source===input.resource.source&&r.mime?.startsWith('image/'));if(!resource){resource={...input.resource,id:resourceId,category:'ui'};project.resources.push(resource);}patch[input.imageKey??'resourceId']=resource.id;}
 if(input.screen==='dialogue'&&input.target==='window'&&patch.rect&&object.moveWithZones!==false){const dx=patch.rect.x-object.rect.x,dy=patch.rect.y-object.rect.y;for(const key of ['name','text','next','portrait','hide']){const child=project.ui.layout.dialogue[key];if(!child?.rect)continue;child.rect={...child.rect,x:Math.max(0,Math.min(100-child.rect.w,child.rect.x+dx)),y:Math.max(0,Math.min(100-child.rect.h,child.rect.y+dy))};}}
 Object.assign(object,patch);
 if(input.screen==='menu'&&input.target.startsWith('button:')&&'visible'in patch){project.ui.mainMenuButtons??={};project.ui.mainMenuButtons[input.target.slice(7)]=patch.visible;}
}
