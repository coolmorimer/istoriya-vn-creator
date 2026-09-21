import { resolveStoryProject } from '../../runtime/story-routing.mjs';
import { timelineConflicts } from '../../runtime/timeline-model.mjs';
const terminalTypes = new Set(["choice", "condition", "jump", "end"]);

function issue(severity, code, message, target = {}) {
  return { id: `${code}:${target.sceneId ?? target.resourceId ?? target.characterId ?? "project"}:${target.actionId ?? ""}`, severity, code, message, ...target };
}

function orderedSceneIds(project) {
  const ids = (project.chapters ?? []).flatMap((chapter) => chapter.scenes ?? []).filter((id) => project.scenes?.[id]);
  for (const id of Object.keys(project.scenes ?? {})) if (!ids.includes(id)) ids.push(id);
  return ids;
}

function actionTargets(action) {
  if (action.type === "choice") return (action.options ?? []).map((option) => option.targetSceneId).filter(Boolean);
  if (action.type === "condition") return [action.trueSceneId, action.falseSceneId].filter(Boolean);
  if (action.type === "jump") return [action.targetSceneId].filter(Boolean);
  return [];
}

export function validateProject(project) {
  project = resolveStoryProject(project);
  const issues = [];
  const scenes = project?.scenes ?? {};
  const resources = project?.resources ?? [];
  const characters = project?.characters ?? [];
  const sceneIds = orderedSceneIds(project ?? {});
  const resourceIds = new Set(resources.map((item) => item.id));
  const characterIds = new Set(characters.map((item) => item.id));
  const variableIds = new Set((project?.variables ?? []).map((item) => item.id));
  const flagIds = new Set((project?.flags ?? []).map((item) => item.id));
  const graph = new Map(sceneIds.map((id) => [id, new Set()]));
  const usedResources = new Set();

  if (!sceneIds.length) issues.push(issue("error", "no-scenes", "В проекте нет ни одной сцены."));
  if (!project?.meta?.title?.trim()) issues.push(issue("error", "no-title", "Не задано название игры."));

  resources.forEach((resource) => {
    if (!resource.source) issues.push(issue("error", "missing-resource-file", `У ресурса «${resource.name || "Без названия"}» отсутствует файл.`, { resourceId: resource.id }));
  });

  sceneIds.forEach((sceneId, index) => {
    const scene = scenes[sceneId];
    if(scene.timelineEnabled)for(const [a,b] of timelineConflicts(scene))issues.push(issue('error','timeline-overlap',`В сцене «${scene.title}» клипы на одной дорожке перекрываются (${a.start}–${a.end} и ${b.start}–${b.end} с). Раздвиньте или укоротите клипы.`,{sceneId,actionId:b.action.id}));
    if (!scene.background) issues.push(issue("warning", "missing-background", `В сцене «${scene.title}» не выбран фон — будет чёрный экран.`, { sceneId }));
    if (scene.backgroundResourceId) {
      usedResources.add(scene.backgroundResourceId);
      if (!resourceIds.has(scene.backgroundResourceId)) issues.push(issue("error", "broken-background", `Фон сцены «${scene.title}» ссылается на удалённый ресурс.`, { sceneId, resourceId: scene.backgroundResourceId }));
    }
    for (const layer of scene.characters ?? []) {
      if (!characterIds.has(layer.characterId)) issues.push(issue("error", "broken-layer-character", `Слой «${layer.name || "Персонаж"}» в сцене «${scene.title}» ссылается на удалённого персонажа.`, { sceneId, layerId: layer.id }));
      const character = characters.find((item) => item.id === layer.characterId);
      if (layer.spriteId && !character?.sprites?.some((sprite) => sprite.id === layer.spriteId)) issues.push(issue("error", "broken-layer-sprite", `В слое персонажа сцены «${scene.title}» выбран отсутствующий спрайт.`, { sceneId, layerId: layer.id, characterId: layer.characterId }));
    }
    for (const action of scene.actions ?? []) {
      if(scene.timelineEnabled && action.timeline?.enabled===false)continue;
      const target = { sceneId, actionId: action.id };
      if(action.type==='jump'&&!action.targetSceneId)issues.push(issue('error','jump-without-target','У перехода не выбрана сцена или вход в главу.',target));
      if(action.type==='condition'&&(!action.trueSceneId||!action.falseSceneId))issues.push(issue('error','condition-without-target','У условия нужно настроить обе ветки перехода.',target));
      for (const targetSceneId of actionTargets(action)) {
        if (!scenes[targetSceneId]) issues.push(issue("error", "broken-scene-link", `Действие в сцене «${scene.title}» ведёт в удалённую сцену.`, target));
        else graph.get(sceneId)?.add(targetSceneId);
      }
      if (["dialogue", "showCharacter", "hideCharacter", "changeSprite", "moveCharacter", "characterAnimation"].includes(action.type) && !characterIds.has(action.speakerId ?? action.characterId)) issues.push(issue("error", "broken-action-character", `Действие в сцене «${scene.title}» ссылается на удалённого персонажа.`, target));
      const characterId = action.speakerId ?? action.characterId;
      if (action.spriteId && !characters.find((item) => item.id === characterId)?.sprites?.some((sprite) => sprite.id === action.spriteId)) issues.push(issue("error", "broken-action-sprite", `Действие в сцене «${scene.title}» ссылается на отсутствующий спрайт.`, target));
      for (const key of ["assetId", "voiceAssetId"]) {
        if (!action[key]) continue;
        usedResources.add(action[key]);
        if (!resourceIds.has(action[key])) issues.push(issue("error", "broken-action-resource", `Действие в сцене «${scene.title}» ссылается на удалённый ресурс.`, target));
      }
      if (["music", "sound", "voice", "ambience", "background", "showCG"].includes(action.type) && !action.assetId) issues.push(issue("error", "action-without-resource", `Для действия «${{ music: "Музыка", ambience:"Фоновый звук", background:"Фон", sound: "Звук", voice: "Озвучка", showCG: "CG" }[action.type]}» в сцене «${scene.title}» не выбран файл.`, target));
      if (["variable", "condition"].includes(action.type) && !variableIds.has(action.variableId)) issues.push(issue("error", "broken-variable", `Действие в сцене «${scene.title}» ссылается на удалённую переменную.`, target));
      if (action.type === "flag" && !flagIds.has(action.flagId)) issues.push(issue("error", "broken-flag", `Действие в сцене «${scene.title}» ссылается на удалённый флаг.`, target));
      if (action.type === "choice") {
        if (!(action.options ?? []).length) issues.push(issue("error", "empty-choice", `В сцене «${scene.title}» есть выбор без вариантов.`, target));
        for (const option of action.options ?? []) if (!option.targetSceneId) issues.push(issue("error", "choice-without-target", `У варианта «${option.text || "Без текста"}» не выбрана следующая сцена.`, target));
      }
    }
    const last = scene.actions?.at(-1);
    if (!terminalTypes.has(last?.type) && sceneIds[index + 1]) graph.get(sceneId)?.add(sceneIds[index + 1]);
    if (!terminalTypes.has(last?.type) && !sceneIds[index + 1]) issues.push(issue("warning", "scene-without-exit", `Последняя сцена «${scene.title}» завершится возвратом в главное меню.`, { sceneId }));
  });

  const reachable = new Set();
  const queue = sceneIds.length ? [sceneIds[0]] : [];
  while (queue.length) {
    const current = queue.shift();
    if (reachable.has(current)) continue;
    reachable.add(current);
    for (const next of graph.get(current) ?? []) if (!reachable.has(next)) queue.push(next);
  }
  for (const sceneId of sceneIds) if (!reachable.has(sceneId)) issues.push(issue("warning", "unreachable-scene", `Сцена «${scenes[sceneId].title}» недостижима из начала игры.`, { sceneId }));

  for (const character of characters) {
    if (!character.portrait && !(character.sprites ?? []).some((sprite) => sprite.source || sprite.resourceId)) issues.push(issue("warning", "character-without-image", `У персонажа «${character.name}» нет портрета или спрайтов.`, { characterId: character.id }));
    for (const sprite of character.sprites ?? []) {
      if (sprite.resourceId) usedResources.add(sprite.resourceId);
      if (!sprite.source && !sprite.resourceId) issues.push(issue("error", "missing-sprite-file", `У спрайта «${sprite.name}» персонажа «${character.name}» отсутствует файл.`, { characterId: character.id }));
    }
  }

  for (const section of project?.gallery?.sections ?? []) for (const item of section.items ?? []) {
    usedResources.add(item.resourceId);
    if (!resourceIds.has(item.resourceId)) issues.push(issue("error", "broken-gallery-item", `В разделе галереи «${section.title}» есть удалённое изображение.`, { gallerySectionId: section.id, galleryItemId: item.id }));
  }
  for (const id of [project?.ui?.dialogueBackgroundResourceId, project?.ui?.mainMenuBackgroundResourceId].filter(Boolean)) usedResources.add(id);
  for (const resource of resources) if (!usedResources.has(resource.id) && !Object.values(scenes).some((scene) => scene.background === resource.source) && !characters.some((character) => character.portrait === resource.source || character.sprites?.some((sprite) => sprite.source === resource.source))) issues.push(issue("warning", "unused-resource", `Ресурс «${resource.name}» нигде не используется и не попадёт в оптимизированную сборку.`, { resourceId: resource.id }));

  const summary = {
    errors: issues.filter((item) => item.severity === "error").length,
    warnings: issues.filter((item) => item.severity === "warning").length,
  };
  return { valid: summary.errors === 0, issues, summary };
}

export const validatorInternals = { orderedSceneIds, actionTargets };
