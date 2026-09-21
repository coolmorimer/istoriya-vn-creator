export function chapterEntry(project, id) {
  const chapter = project.chapters.find(c => c.id === id);
  return chapter?.scenes.includes(chapter.entrySceneId) ? chapter.entrySceneId : chapter?.scenes.find(id => project.scenes[id]) ?? null;
}

export function targetScene(project, target, field = 'targetSceneId') {
  const key = field.replace('SceneId', 'ChapterId');
  return target[key] ? chapterEntry(project, target[key]) : target[field];
}

// Both the preview and Ren'Py compiler resolve chapter entry points at run time.
export function resolveStoryProject(source) {
  const project = structuredClone(source ?? {});
  project.chapters ??= [];
  project.scenes ??= {};
  for (const scene of Object.values(project.scenes)) for (const action of scene.actions ?? []) {
    if (action.type === 'jump') action.targetSceneId = targetScene(project, action);
    if (action.type === 'condition') for (const field of ['trueSceneId','falseSceneId']) action[field] = targetScene(project, action, field);
    for (const option of action.options ?? []) option.targetSceneId = targetScene(project, option);
  }
  return project;
}
