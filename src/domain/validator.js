import { resolveStoryProject, storyActions } from '../../runtime/story-routing.mjs';
import { timelineConflicts } from '../../runtime/timeline-model.mjs';
import { assertProjectShape } from '../../runtime/project-format.mjs';
import {backgroundSource} from '../../runtime/background-transform.mjs';
import {conditionProblems,effectProblems} from '../../runtime/game-logic.mjs';
import {logicPotential} from '../../runtime/logic-diagnostics.mjs';
import {uiLayoutProblems,uiResourceIds} from '../../runtime/game-ui.mjs';
import {audioProblems,isAudioResource} from '../../runtime/audio-model.mjs';
import {storyboardFrames} from './storyboard.js';
import {rpgProblems,rpgActionProblems,rpgConfig} from '../../runtime/rpg-model.mjs';
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
  try { assertProjectShape(project); }
  catch (error) { return { valid: false, issues: [issue('error', 'invalid-project', error.message)], summary: {errors:1,warnings:0} }; }
  project = resolveStoryProject(project);
  const issues = [];
  rpgProblems(project).forEach((message,index)=>issues.push(issue('error','rpg-settings-'+index,message)));
  for(const location of rpgConfig(project).locations)conditionProblems(location.condition,project).forEach((message,index)=>issues.push(issue('error','rpg-location-'+location.id+'-'+index,message)));
  for(const scene of Object.values(project.scenes))for(const action of scene.actions??[])if(action.type==='rpg'){for(const message of rpgActionProblems(action,project))issues.push(issue('error','rpg-action',message,{sceneId:scene.id,actionId:action.id}));if(scene.timelineEnabled)issues.push(issue('error','rpg-timing','Игровое меню требует последовательной сцены.',{sceneId:scene.id,actionId:action.id}));}
  const scenes = project?.scenes ?? {};
  const resources = project?.resources ?? [];
  const characters = project?.characters ?? [];
  const sceneIds = orderedSceneIds(project ?? {});
  const resourceIds = new Set(resources.map((item) => item.id));
  const characterIds = new Set(characters.map((item) => item.id));
  const variableIds = new Set((project?.variables ?? []).map((item) => item.id));
  const flagIds = new Set((project?.flags ?? []).map((item) => item.id));
  const itemIds=new Set((project.items??[]).map(item=>item.id));
  const graph = new Map(sceneIds.map((id) => [id, new Set()]));
  const usedResources = uiResourceIds(project);
  for(const problem of uiLayoutProblems(project))issues.push(issue('error','invalid-game-ui',problem.message,{uiScreen:problem.screen}));
  const potential=logicPotential(project);

  if (!sceneIds.length) issues.push(issue("error", "no-scenes", "В проекте нет ни одной сцены."));
  if (!project?.meta?.title?.trim()) issues.push(issue("error", "no-title", "Не задано название игры."));

  resources.forEach((resource) => {
    if (!resource.source) issues.push(issue("error", "missing-resource-file", `У ресурса «${resource.name || "Без названия"}» отсутствует файл.`, { resourceId: resource.id }));
  });

  sceneIds.forEach((sceneId, index) => {
    const scene = scenes[sceneId];
    for(const layer of scene.images??[]) {if(!resourceIds.has(layer.resourceId))issues.push(issue('error','broken-image-layer',`У слоя «${layer.name||'Изображение'}» отсутствует ресурс.`,{sceneId,resourceId:layer.resourceId}));else usedResources.add(layer.resourceId);}
    const executed = storyActions(scene);
    if(!scene.timelineEnabled){const frames=storyboardFrames(project,scene);for(let i=0;i<scene.actions.length;i++){const action=scene.actions[i];if(action.type!=='keyframes')continue;const before=i?frames[i-1].frame:null,t=action.target;if(t.kind==='character'&&!(before?.layers??scene.characters??[]).some(l=>l.characterId===t.id&&l.visible!==false))issues.push(issue('error','motion-hidden-character','Сначала покажите персонажа, затем добавьте его движение.',{sceneId,actionId:action.id}));if(t.kind==='background'&&!(before?.background??backgroundSource(project,scene)))issues.push(issue('error','motion-missing-background','Сначала выберите фон, затем добавьте его движение.',{sceneId,actionId:action.id}));}}
    const terminal = executed.find(action=>terminalTypes.has(action.type));
    const hasExplore=executed.some((action,i)=>action.type==='explore'&&(!terminal||i<executed.indexOf(terminal)));
    for(const layer of scene.images??[])for(const reaction of layer.interactions??[]) {
      const target={sceneId,layerId:layer.id,reactionId:reaction.id};
      for(const message of audioProblems(reaction))issues.push(issue('error','invalid-reaction-audio-settings',message,target));
      if(!reaction.label?.trim())issues.push(issue('error','unnamed-reaction','Назовите действие с предметом.',target));
      if(reaction.requiredItemId==='')issues.push(issue('error','empty-reaction-item','Выберите предмет инвентаря для применения.',target));
      for(const key of ['voiceAssetId','soundAssetId','resultResourceId'])if(reaction[key]) {
        usedResources.add(reaction[key]);const resource=resources.find(r=>r.id===reaction[key]);
        if(!resource)issues.push(issue('error','broken-reaction-resource','В реакции предмета выбран удалённый файл.',target));
        else if(key!=='resultResourceId'&&!isAudioResource(resource))issues.push(issue('error','invalid-reaction-audio','Для звука или озвучки реакции выберите аудиофайл.',target));
      }
      for(const itemId of [reaction.requiredItemId,reaction.inventory?.itemId].filter(Boolean))if(!itemIds.has(itemId))issues.push(issue('error','broken-reaction-item','Реакция ссылается на отсутствующий предмет инвентаря.',target));
      if(reaction.inventory&&(!['add','remove'].includes(reaction.inventory.operation)||!reaction.inventory.itemId||!Number.isInteger(Number(reaction.inventory.quantity))||Number(reaction.inventory.quantity)<1))issues.push(issue('error','invalid-inventory-effect','Выберите предмет и положительное целое количество.',target));
      if(reaction.speakerId&&!characterIds.has(reaction.speakerId))issues.push(issue('error','broken-reaction-speaker','Для ответа предмета выбран удалённый персонаж.',target));
      for(const message of conditionProblems(reaction.condition,project))issues.push(issue('error','broken-reaction-condition',message,target));
      for(const effect of reaction.effects??[])for(const message of effectProblems(effect,project))issues.push(issue('error','broken-reaction-effect',message,target));
      if(reaction.targetChapterId&&!reaction.targetSceneId)issues.push(issue('error','broken-reaction-chapter','В реакции выбрана отсутствующая глава или глава без входной сцены.',target));
      if(reaction.targetSceneId){if(!scenes[reaction.targetSceneId])issues.push(issue('error','broken-reaction-scene','Реакция ведёт в удалённую сцену.',target));else if(hasExplore)graph.get(sceneId)?.add(reaction.targetSceneId);}
    }
    if(scene.timelineEnabled)for(const [a,b] of timelineConflicts(scene))issues.push(issue('error','timeline-overlap',`В сцене «${scene.title}» клипы на одной дорожке перекрываются (${a.start}–${a.end} и ${b.start}–${b.end} с). Раздвиньте или укоротите клипы.`,{sceneId,actionId:b.action.id}));
    if (!backgroundSource(project,scene)) issues.push(issue("warning", "missing-background", `В сцене «${scene.title}» не выбран фон — будет чёрный экран.`, { sceneId }));
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
      for(const message of audioProblems(action))issues.push(issue('error','invalid-action-audio-settings',message,target));
      if(action.condition||action.type==='condition')for(const message of conditionProblems(action.condition??action,project))issues.push(issue('error','invalid-condition',message,target));
      if(action.type==='explore'){
        if(action.requiredItemId&&itemIds.has(action.requiredItemId)&&!potential.itemCanExist(action.requiredItemId))issues.push(issue('error','impossible-exploration-item','Для продолжения нужен предмет, который игрок нигде не может получить. Добавьте результат выдачи или уберите требование.',target));
        if(action.requiredFlagId&&flagIds.has(action.requiredFlagId)&&!potential.flagCanBeTrue(action.requiredFlagId))issues.push(issue('error','impossible-exploration-flag','Для продолжения нужен флаг, который нигде не включается. Добавьте результат включения или уберите требование.',target));
        if(action.condition&&!conditionProblems(action.condition,project).length&&potential.conditionPossible(action.condition)===false)issues.push(issue('error','impossible-exploration-condition','Условия продолжения осмотра никогда не выполнятся при имеющихся изменениях состояния. Проверьте требования и результаты.',target));
        let cg=false;for(const earlier of executed.slice(0,executed.indexOf(action))){if(earlier.type==='showCG')cg=true;if(earlier.type==='hideCG'||earlier.type==='background'&&!earlier.preserveCharacters)cg=false;}
        if(cg)issues.push(issue('error','exploration-covered','Перед осмотром скройте CG: иллюстрация закрывает интерактивные предметы.',target));
        if(scene.timelineEnabled)issues.push(issue('error','timed-exploration','Осмотр сцены доступен в последовательных кадрах. Явно переведите эту сцену в кадры, сохранив исходный монтаж.',target));
        if(action.requiredItemId&&!itemIds.has(action.requiredItemId))issues.push(issue('error','broken-exploration-item','Для продолжения осмотра выбран отсутствующий предмет.',target));
        if(action.requiredFlagId&&!flagIds.has(action.requiredFlagId))issues.push(issue('error','broken-exploration-flag','Для продолжения осмотра выбран отсутствующий флаг.',target));
        if(!(scene.images??[]).some(l=>l.visible!==false&&l.interactions?.length))issues.push(issue('warning','empty-exploration','В шаге осмотра пока нет предметов с реакциями.',target));
      }
      if(action.type==='jump'&&!action.targetSceneId)issues.push(issue('error','jump-without-target','У перехода не выбрана сцена или вход в главу.',target));
      if(action.type==='condition'&&(!action.trueSceneId||!action.falseSceneId))issues.push(issue('error','condition-without-target','У условия нужно настроить обе ветки перехода.',target));
      for (const targetSceneId of actionTargets(action)) {
        if (!scenes[targetSceneId]) issues.push(issue("error", "broken-scene-link", `Действие в сцене «${scene.title}» ведёт в удалённую сцену.`, target));
        else if (action === terminal) graph.get(sceneId)?.add(targetSceneId);
      }
      if (["dialogue", "showCharacter", "hideCharacter", "changeSprite", "moveCharacter", "characterAnimation"].includes(action.type) && !characterIds.has(action.speakerId ?? action.characterId)) issues.push(issue("error", "broken-action-character", `Действие в сцене «${scene.title}» ссылается на удалённого персонажа.`, target));
      const characterId = action.speakerId ?? action.characterId;
      if (action.spriteId && !characters.find((item) => item.id === characterId)?.sprites?.some((sprite) => sprite.id === action.spriteId)) issues.push(issue("error", "broken-action-sprite", `Действие в сцене «${scene.title}» ссылается на отсутствующий спрайт.`, target));
      for (const key of ["assetId", "voiceAssetId","soundAssetId"]) {
        if (!action[key]) continue;
        usedResources.add(action[key]);
        if (!resourceIds.has(action[key])) issues.push(issue("error", "broken-action-resource", `Действие в сцене «${scene.title}» ссылается на удалённый ресурс.`, target));
        else if((key!=='assetId'||['music','sound','voice','ambience'].includes(action.type))&&!isAudioResource(resources.find(r=>r.id===action[key])))issues.push(issue('error','invalid-action-audio','Для звука или озвучки выберите аудиофайл.',target));
      }
      if (["music", "sound", "voice", "ambience", "background", "showCG"].includes(action.type) && !action.assetId) issues.push(issue("error", "action-without-resource", `Для действия «${{ music: "Музыка", ambience:"Фоновый звук", background:"Фон", sound: "Звук", voice: "Озвучка", showCG: "CG" }[action.type]}» в сцене «${scene.title}» не выбран файл.`, target));
      if ((action.type==='variable'||action.type==='condition'&&!action.condition) && !action.flagId && !variableIds.has(action.variableId)) issues.push(issue("error", "broken-variable", `Действие в сцене «${scene.title}» ссылается на удалённую переменную.`, target));
      if(['variable','flag'].includes(action.type))for(const message of effectProblems(action,project))issues.push(issue('error','invalid-effect',message,target));
      if ((action.type === "flag" || action.flagId) && !flagIds.has(action.flagId)) issues.push(issue("error", "broken-flag", `Действие в сцене «${scene.title}» ссылается на удалённый флаг.`, target));
      if (action.type === "choice") {
        if(action.options?.length&&action.options.every(option=>option.condition&&!conditionProblems(option.condition,project).length&&potential.conditionPossible(option.condition)===false))issues.push(issue('error','choice-always-hidden','Все варианты этого выбора всегда скрыты условиями. Добавьте доступный вариант или изменение состояния до выбора.',target));
        if (!(action.options ?? []).length) issues.push(issue("error", "empty-choice", `В сцене «${scene.title}» есть выбор без вариантов.`, target));
        for (const option of action.options ?? []) if (!option.targetSceneId) issues.push(issue("error", "choice-without-target", `У варианта «${option.text || "Без текста"}» не выбрана следующая сцена.`, target));
        for (const option of action.options ?? []) {
          for(const message of conditionProblems(option.condition,project))issues.push(issue('error','broken-choice-condition',message,{...target,optionId:option.id}));
          for(const effect of option.effects??[])for(const message of effectProblems(effect,project))issues.push(issue('error','broken-choice-effect',message,{...target,optionId:option.id}));
        }
      }
    }
    const last = terminal;
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
  for(const item of project.items??[]) {
    if(!item.id||!item.name?.trim())issues.push(issue('error','invalid-inventory-item','У предмета инвентаря нет названия или идентификатора.',{itemId:item.id}));
    if(item.iconResourceId){usedResources.add(item.iconResourceId);if(!resourceIds.has(item.iconResourceId))issues.push(issue('error','broken-item-icon','У предмета инвентаря отсутствует изображение.',{itemId:item.id}));}
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
  issues.forEach((entry,index)=>{entry.id+=`:${index}`;});
  return { valid: summary.errors === 0, issues, summary };
}

export const validatorInternals = { orderedSceneIds, actionTargets };
