import { timelineClips } from './timeline-model.mjs';
// One navigation order for maps, preview, validation and compatible export.
// Explicit chapter order wins; unassigned scenes follow in stable UTF-16 order.
export function orderedStoryScenes(project) {
  const scenes=project.scenes??{},seen=new Set(),ids=[];
  for(const id of (project.chapters??[]).flatMap(c=>c.scenes??[]))if(Object.hasOwn(scenes,id)&&!seen.has(id)){seen.add(id);ids.push(id);}
  for(const id of Object.keys(scenes).sort())if(!seen.has(id))ids.push(id);
  return ids;
}
export function storyStartScene(project, requested=null) {
  if(requested){if(!Object.hasOwn(project.scenes??{},requested))throw Error('Сцена запуска удалена. Выберите существующую сцену.');return requested;}
  for(const chapter of project.chapters??[]){const entry=entryForChapter(project,chapter);if(entry&&Object.hasOwn(project.scenes??{},entry))return entry;}
  return orderedStoryScenes(project)[0]??null;
}
export function storyActions(scene) {
  return scene.timelineEnabled ? timelineClips(scene).filter(c=>c.enabled).sort((a,b)=>a.start-b.start||a.index-b.index).map(c=>c.action) : scene.actions ?? [];
}

export function chapterEntry(project, id) {
  const chapter = project.chapters.find(c => c.id === id);
  return entryForChapter(project,chapter);
}
function entryForChapter(project,chapter){const scenes=chapter?.scenes??[];return scenes.includes(chapter?.entrySceneId)?chapter.entrySceneId:scenes.find(id=>Object.hasOwn(project.scenes??{},id))??null;}

export function targetScene(project, target, field = 'targetSceneId') {
  const key = field.replace('SceneId', 'ChapterId');
  return target[key] ? chapterEntry(project, target[key]) : target[field];
}

// Both the preview and Ren'Py compiler resolve chapter entry points at run time.
export function resolveStoryProject(source) {
  const project = structuredClone(source ?? {});
  project.chapters ??= [];
  project.scenes ??= {};
  for (const scene of Object.values(project.scenes)) {for(const layer of scene.images??[])for(const reaction of layer.interactions??[])if(reaction.targetChapterId)reaction.targetSceneId=targetScene(project,reaction);for (const action of scene.actions ?? []) {
    if (action.type === 'jump') action.targetSceneId = targetScene(project, action);
    if (action.type === 'condition') for (const field of ['trueSceneId','falseSceneId']) action[field] = targetScene(project, action, field);
    for (const option of action.options ?? []) option.targetSceneId = targetScene(project, option);
  }
  }
  return project;
}
