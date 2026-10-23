import { resolveCharacterSprite } from "./character-sprites.mjs";
import {renpyBackground} from './background-transform.mjs';
import {sceneImages} from './image-layers.mjs';
import {sceneCharacterLayers,layerZOrder} from './visual-order.mjs';
import {interactionScript,explorationLines} from './interaction-script.mjs';
import {rpgScript} from './rpg-script.mjs';
import {rpgActionProblems,rpgConfig} from './rpg-model.mjs';
import {compileCondition,compileGameplayEffect,scalarValue} from './game-logic.mjs';
import {gameUi,uiResourceIds,uiLayoutProblems} from './game-ui.mjs';
import {gameUiScript} from './game-ui-script.mjs';
import {AUDIO_CHANNELS,audioVolume,audioFade,voiceFilename} from './audio-model.mjs';
import {renpyActorTransform,renpyFloat} from './renpy-transform.mjs';
import {generateGameGui,validateGameGui} from './gui-template.mjs';
import {animationSettings,animationEnd,renpyAnimationLines} from './character-animation.mjs';
import { textAppearance } from './text-style.mjs';
import {motionDuration,motionSample,renpyMotionLines,motionWarperScript} from './keyframes.mjs';
import fs from "node:fs/promises";
import { timelineEvents } from "./timeline-model.mjs";
import { resolveStoryProject, storyActions } from "./story-routing.mjs";
import { assertProjectShape } from "./project-format.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GENERATED_NOTICE = "# Создано конструктором «История». Не редактируйте этот файл вручную.\n\n";

function quote(value = "") {
  return JSON.stringify(String(value)).replace(/\\u2028|\\u2029/g, " ");
}

function renpyLiteral(value) {
  if (typeof value === "boolean") return value ? "True" : "False";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return quote(value);
}

function asciiId(value, prefix = "item") {
  const cyrillic = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh", з: "z", и: "i", й: "y",
    к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
    х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  };
  const transliterated = String(value ?? "").toLowerCase().replace(/[а-яё]/g, (letter) => cyrillic[letter] ?? "");
  const normalized = transliterated.normalize("NFKD").replace(/[^a-zA-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase();
  return `${prefix}_${normalized || "unnamed"}`;
}

function extensionFromDataUrl(dataUrl) {
  const mime = dataUrl.match(/^data:([^;,]+)/)?.[1] ?? "image/png";
  if (mime.includes("jpeg")) return ".jpg";
  if (mime.includes("webp")) return ".webp";
  if (mime.includes("gif")) return ".gif";
  if (mime.includes("ico")) return ".ico";
  if (mime === 'font/ttf' || mime.includes('x-font-ttf')) return '.ttf';
  if (mime === 'font/otf' || mime.includes('opentype')) return '.otf';
  if (mime.includes('mpeg')) return '.mp3';
  if (mime.includes('ogg')) return '.ogg';
  if (mime.includes('wav')) return '.wav';
  return ".png";
}

async function materializeAsset(source, destinationBase, assetsRoot) {
  if (!source) return null;
  if (source.startsWith("data:")) {
    const match = source.match(/^data:[^;,]+(?:;charset=[^;,]+)?;base64,(.+)$/);
    if (!match) throw new Error("Неподдерживаемый встроенный ресурс.");
    const destination = `${destinationBase}${extensionFromDataUrl(source)}`;
    await fs.writeFile(destination, Buffer.from(match[1], "base64"));
    return destination;
  }

  let sourcePath = source;
  if (source.startsWith("file:")) sourcePath = fileURLToPath(source);
  if (/^\.?\/assets\//.test(source)) sourcePath = path.join(assetsRoot, source.replace(/^\.?\//, ""));
  const extension = path.extname(sourcePath) || ".png";
  const destination = `${destinationBase}${extension.toLowerCase()}`;
  await fs.copyFile(sourcePath, destination);
  return destination;
}

function compileEffect(effect, project) {
  return compileGameplayEffect(effect,project,{asciiId,literal:renpyLiteral}).map(line=>`            $ ${line}`);
}

function transitionName(value) {
  if (!value || value === "none") return null;
  if (value === "flash") return "flash";
  if (value === "shake") return "hpunch";
  if (["fade", "dissolve", "moveinleft", "moveinright", "moveoutleft", "moveoutright"].includes(value)) return value;
  return "dissolve";
}

function conditionExpression(condition, project) {
  return condition==null?'':` if ${compileCondition(condition,project,{asciiId,literal:renpyLiteral})}`;
}

function sayAppearance(project, action, assetMap) {
  const style=textAppearance(project,action);
  const font=assetMap.get(style.font)??(['DejaVuSans.ttf','DejaVuSans-Bold.ttf'].includes(style.font)?style.font:'DejaVuSans.ttf');
  const outlines=[];
  if(style.outline)outlines.push(`(${Math.max(0,Number(style.outline)||0)}, ${quote(style.outlineColor)}, 0, 0)`);
  if(style.shadow)outlines.push(`(0, "#000000", 2, 2)`);
  return ` (what_font=${quote(font)}, what_size=${Math.max(10,Number(style.size)||32)}, what_color=${quote(style.color)}, what_bold=${style.bold?'True':'False'}, what_italic=${style.italic?'True':'False'}, what_underline=${style.underline?'True':'False'}, what_outlines=[${outlines.join(', ')}], what_slow_cps=${Math.max(0,Number(style.speed)||0)})`;
}
function compileScene(scene, project, backgroundMap, nextSceneId, assetMap = new Map(), spriteMap = new Map()) {
  const lines = [`label ${asciiId(scene.id, "scene")}:`, '    camera', '    $ _istoriya_motion_props = {}', '    scene onlayer istoriya_cg_layer'];
  const background = backgroundMap.get(scene.id);
  if(rpgConfig(project).enabled)lines.push('    show screen istoriya_rpg_hud');
  const width = Number(project.meta.resolution.width) || 1920;
  const height = Number(project.meta.resolution.height) || 1080;
  const propSceneId=scene.sourceSceneId??scene.id;
  const sizedSprite = (sprite) => `Transform(${quote(sprite)}, xysize=(${Math.round(width * .34)}, ${Math.round(height * .88)}), fit="contain")`;
  const characters=sceneCharacterLayers(scene);
  const imageLayers=new Map(sceneImages(scene).map(l=>[l.id,{...l}]));let activeBackground=background,activeBackgroundTransform=scene.backgroundTransform??{},backgroundTag='istoriya_scene_bg';
  const visualLayers = new Map(characters.filter(layer=>layer.visible!==false).map(layer=>[layer.characterId,{...layer}]));
  const renderImages=()=>{for(const layer of imageLayers.values()){const asset=assetMap.get(layer.resourceId);if(!asset||layer.visible===false)continue;const interactive=layer.interactions?.length,source=interactive?`_istoriya_prop_source(${quote(propSceneId)}, ${quote(layer.id)}, ${quote(asset)})`:quote(asset);if(interactive)lines.push(`    if _istoriya_prop_visible(${quote(propSceneId)}, ${quote(layer.id)}):`);lines.push(`${interactive?'        ':'    '}show expression Transform(${source}, xysize=(${Math.round(width*layer.width/100)}, ${Math.round(height*layer.height/100)}), fit="contain") as ${asciiId(layer.id,'image')} at ${renpyActorTransform(layer)} zorder ${Math.round(layer.zOrder)}`);}};
  if (background) {
    lines.push(`    scene expression ${renpyBackground(background,width,height,scene.backgroundTransform)} as istoriya_scene_bg zorder -100`);
    const transition = transitionName(scene.transition);
    if (transition) lines.push(`    with ${transition}`);
  } else lines.push('    scene expression Solid("#000000") as istoriya_scene_bg zorder -100');

  for (const layer of characters) {
    if (layer.visible === false) continue;
    const sprite = spriteMap.get(`${layer.characterId}:${layer.spriteId ?? "default"}`) ?? spriteMap.get(`${layer.characterId}:default`);
    if (!sprite) continue;
    lines.push(`    show expression ${sizedSprite(sprite)} as ${asciiId(layer.characterId, "actor")} at ${renpyActorTransform(layer)} zorder ${layer.zOrder}`);
  }

  renderImages();
  if (!scene.actions?.length) {
    lines.push(nextSceneId ? `    jump ${asciiId(nextSceneId, "scene")}` : "    return", "");
    return lines.join("\n");
  }

  if (scene.timelineEnabled) lines.push('    $ _timeline_origin = renpy.get_game_runtime()', '    $ _timeline_hold = 0.0');
  for (const action of (scene.timelineEnabled ? timelineEvents(scene) : scene.actions)) {
    if(action.type==='keyframes'){
      const target=action.target,end=motionSample(action,motionDuration(action));let header,flip=false,settle;
      if(target.kind==='camera'){header='    camera:';settle=`    camera at Transform(xpos=${renpyFloat(end.x/100)}, ypos=${renpyFloat(end.y/100)}, anchor=(0.5,0.5), zoom=${renpyFloat(end.scale/100)}, rotate=${end.rotation}, alpha=${renpyFloat(end.opacity/100)}, blur=${end.blur??0}, rotate_pad=False, transform_anchor=True)`;}
      if(target.kind==='character'){const layer=visualLayers.get(target.id),sprite=layer&&(spriteMap.get(`${target.id}:${layer.spriteId??'default'}`)??spriteMap.get(`${target.id}:default`));if(!layer||!sprite)throw Error('Персонаж ключевых кадров не показан. Добавьте его перед движением.');header=`    show expression ${sizedSprite(sprite)} as ${asciiId(target.id,'actor')} zorder ${layer.zOrder??10}:`;flip=layer.flip;Object.assign(layer,end);settle=`    show expression ${sizedSprite(sprite)} as ${asciiId(target.id,'actor')} at ${renpyActorTransform(layer)}`;}
      if(target.kind==='image'){const layer=imageLayers.get(target.id),asset=assetMap.get(layer?.resourceId);if(!layer||!asset||layer.visible===false)throw Error('Предмет ключевых кадров недоступен.');flip=layer.flip;const source=layer.interactions?.length?`_istoriya_prop_source(${quote(propSceneId)},${quote(layer.id)},${quote(asset)})`:quote(asset),display=`Transform(${source}, xysize=(${Math.round(width*layer.width/100)},${Math.round(height*layer.height/100)}), fit="contain")`;header=`    show expression ${display} as ${asciiId(layer.id,'image')} zorder ${layer.zOrder}:`;Object.assign(layer,end);settle=`    show expression ${display} as ${asciiId(layer.id,'image')} at ${renpyActorTransform(layer)}`;lines.push(`    $ _istoriya_motion_props[${quote(layer.id)}] = ${renpyLiteral(JSON.stringify(end))}`);}
      if(target.kind==='background'){if(!activeBackground)throw Error('Для движения фона сначала выберите фон.');const t=activeBackgroundTransform,display=`Transform(${quote(activeBackground)}, xysize=(${Math.round(width*(t.width??100)/100)},${Math.round(height*(t.height??100)/100)}), fit=${quote(t.fit??'fill')})`;header=`    show expression ${display} as ${backgroundTag} zorder -100:`;activeBackgroundTransform={...t,...end};settle=`    show expression ${renpyBackground(activeBackground,width,height,activeBackgroundTransform)} as ${backgroundTag} zorder -100`;}
      lines.push(header,...renpyMotionLines(action,{flip}));if(!scene.timelineEnabled)lines.push(`    $ renpy.pause(${renpyFloat(motionDuration(action))}, hard=True)`,settle);continue;
    }
    const actionSound=assetMap.get(action.soundAssetId);
    if(actionSound)lines.push(`    play sound ${quote(actionSound)} volume ${audioVolume(action.soundVolume)}`);
    // Track the effective appearance so a move does not reset the current emotion or scale.
    if (action.type === 'background' && !scene.timelineEnabled && action.preserveCharacters!==true) visualLayers.clear();
    const visualId=action.characterId ?? action.speakerId;
    if (action.type === 'hideCharacter') visualLayers.delete(visualId);
    if (action.type === 'showCharacter') visualLayers.set(visualId,{...action,zOrder:layerZOrder(action.zOrder),x:action.x ?? ({left:25,center:50,right:75})[action.position] ?? 50,y:action.y ?? 100});
    if (['changeSprite','dialogue'].includes(action.type) && (action.type==='changeSprite'||action.spriteId)) {
      const layer=visualLayers.get(visualId);if(layer)layer.spriteId=action.spriteId ?? null;
    }
    if (action.type === 'moveCharacter') {const layer=visualLayers.get(visualId)??{};visualLayers.set(visualId,{...layer,x:action.x ?? ({left:25,center:50,right:75})[action.position] ?? 50,y:action.y ?? layer.y ?? 100});}
    if (action.type === 'timelineWait') { lines.push(`    $ renpy.pause(max(0.0, ${action.time} - (renpy.get_game_runtime() - _timeline_origin - _timeline_hold)), hard=True)`); continue; }
    if (action.type === 'timelineTextEnd') {
      if (action.wait) lines.push('    $ _timeline_before = renpy.get_game_runtime()', '    pause', '    $ _timeline_hold += renpy.get_game_runtime() - _timeline_before');
      lines.push('    hide screen say'); continue;
    }
    if (action.type === 'timelineStopAudio') { lines.push(`    stop ${action.channel}`); continue; }
    if (action.type === 'timelineBackgroundEnd') { lines.push('    hide istoriya_timeline_bg');activeBackground=background;activeBackgroundTransform=scene.backgroundTransform??{};backgroundTag='istoriya_scene_bg'; continue; }
    if (scene.timelineEnabled && action.type === 'pause') continue;
    if (action.type === 'pause') { lines.push(`    pause ${Math.max(.1,Number(action.duration)||1)}`); continue; }
    if(action.type==='explore'){lines.push(...explorationLines(propSceneId,action,quote));continue;}
    if (action.type === "background") {
      const asset = assetMap.get(action.assetId);
      activeBackground=asset;activeBackgroundTransform=action.backgroundTransform??{};backgroundTag=scene.timelineEnabled?'istoriya_timeline_bg':'istoriya_scene_bg';
      if (asset) {
        const displayable=renpyBackground(asset,width,height,action.backgroundTransform);
        lines.push(scene.timelineEnabled ? `    show expression ${displayable} as istoriya_timeline_bg zorder -100` : action.preserveCharacters===true?`    show expression ${displayable} as istoriya_scene_bg zorder -100`:`    scene expression ${displayable} as istoriya_scene_bg zorder -100`);
        if(!scene.timelineEnabled&&action.preserveCharacters!==true){lines.push('    scene onlayer istoriya_cg_layer');renderImages();}
        const transition = transitionName(action.transition);
        if (transition) lines.push(`    with ${transition}`);
      }
      continue;
    }
    if (action.type === "dialogue") {
      const character = project.characters.find((item) => item.id === action.speakerId);
      const speaker = character ? asciiId(character.id, "character") : "istoriya_narrator";
      const voice = assetMap.get(action.voiceAssetId);
      const sprite = spriteMap.get(`${action.speakerId}:${action.spriteId}`);
      if (sprite && character) lines.push(`    show expression ${sizedSprite(sprite)} as ${asciiId(character.id, "actor")}`);
      if (voice) lines.push(`    voice ${quote(voiceFilename(voice,action.voiceVolume))}`);
      lines.push(scene.timelineEnabled ? `    $ ${speaker}(${quote(action.text)}, interact=False, ${sayAppearance(project,action,assetMap).trim().slice(1,-1)})` : `    ${speaker} ${quote(action.text)}${sayAppearance(project,action,assetMap)}`);
      continue;
    }
    if (action.type === "narration") {
      const voice=assetMap.get(action.voiceAssetId);if(voice)lines.push(`    voice ${quote(voiceFilename(voice,action.voiceVolume))}`);
      lines.push(scene.timelineEnabled ? `    $ istoriya_narrator(${quote(action.text)}, interact=False, ${sayAppearance(project,action,assetMap).trim().slice(1,-1)})` : `    istoriya_narrator ${quote(action.text)}${sayAppearance(project,action,assetMap)}`);
      continue;
    }
    if (action.type === "choice") {
      lines.push("    menu:", `        ${quote(action.prompt || "Что сделать?")}`);
      for (const option of action.options ?? []) {
        lines.push(`        ${quote(option.text)}${conditionExpression(option.condition, project)}:`);
        for (const effect of option.effects ?? []) lines.push(...compileEffect(effect, project));
        if (project.scenes[option.targetSceneId]) lines.push(`            jump ${asciiId(option.targetSceneId, "scene")}`);
        else lines.push("            return");
      }
      lines.push("");
      continue;
    }
    if (action.type === "showCharacter") {
      const character = project.characters.find((item) => item.id === action.characterId);
      const sprite = spriteMap.get(`${action.characterId}:${action.spriteId ?? "default"}`) ?? spriteMap.get(`${action.characterId}:default`);
      if (character && sprite) {
        const tag = asciiId(character.id, "actor");
        const position = ["left", "right", "center"].includes(action.position) ? action.position : "center";
        const transform = renpyActorTransform({...action,position});
        lines.push(`    show expression ${sizedSprite(sprite)} as ${tag} at ${transform} zorder ${layerZOrder(action.zOrder)}`);
        const transition = transitionName(action.transition);
        if (transition) lines.push(`    with ${transition}`);
      }
      continue;
    }
    if (action.type === "hideCharacter") {
      const character = project.characters.find((item) => item.id === action.characterId);
      if (character) {
        lines.push(`    hide ${asciiId(character.id, "actor")}`);
        const transition = transitionName(action.transition);
        if (transition) lines.push(`    with ${transition}`);
      }
      continue;
    }
    if (["changeSprite", "moveCharacter", "characterAnimation"].includes(action.type)) {
      const character = project.characters.find((item) => item.id === action.characterId);
      const appearance=visualLayers.get(action.characterId)??{};
      if(action.type==='characterAnimation'&&!visualLayers.has(action.characterId))continue;
      const spriteId=action.type==='changeSprite'?action.spriteId:action.spriteId??appearance.spriteId;
      const sprite = spriteMap.get(`${action.characterId}:${spriteId ?? "default"}`) ?? spriteMap.get(`${action.characterId}:default`);
      if (character && sprite) {
        const tag = asciiId(character.id, "actor");
        if (action.type === "changeSprite") {
          lines.push(`    show expression ${sizedSprite(sprite)} as ${tag}`);
          const transition = transitionName(action.transition);
          if (transition) lines.push(`    with ${transition}`);
        } else if (action.type === "moveCharacter") {
          const transform=renpyActorTransform(appearance);
          lines.push(`    show expression ${sizedSprite(sprite)} as ${tag} at ${transform}`, `    with MoveTransition(${Math.max(0.1, Number(action.duration) || 0.5)})`);
        } else {
          const {duration}=animationSettings(action),end=animationEnd(appearance,action);
          lines.push(`    show expression ${sizedSprite(sprite)} as ${tag} zorder ${appearance.zOrder??10}:`,...renpyAnimationLines(appearance,action));
          visualLayers.set(action.characterId,end);
          if(!scene.timelineEnabled){
            lines.push(`    pause ${duration}`,`    show expression ${sizedSprite(sprite)} as ${tag} at ${renpyActorTransform(end)}`);
          }
        }
      }
      continue;
    }
    if (action.type === "showCG") {
      const asset = assetMap.get(action.assetId);
      if (asset) {
        lines.push(`    show expression Transform(${quote(asset)}, xysize=(${width}, ${height}), fit="contain") as istoriya_cg at truecenter onlayer istoriya_cg_layer`);
        const transition = transitionName(action.transition);
        if (transition) lines.push(`    with ${transition}`);
        if (action.unlockGallery !== false) {
          const galleryItems = (project.gallery?.sections ?? []).flatMap((section) => section.items ?? []).filter((item) => item.resourceId === action.assetId);
          for (const item of galleryItems) lines.push(`    $ persistent.istoriya_gallery_unlocked.add(${quote(item.id)})`);
        }
      }
      continue;
    }
    if (action.type === "hideCG") {
      lines.push("    hide istoriya_cg onlayer istoriya_cg_layer");
      const transition = transitionName(action.transition);
      if (transition) lines.push(`    with ${transition}`);
      continue;
    }
    if (action.type === "ambience") {
      const asset=assetMap.get(action.assetId);
      if(asset)lines.push(`    play ambience ${quote(asset)} volume ${audioVolume(action.volume)}${action.loop===false?" noloop":" loop"}`);
      continue;
    }
    if (action.type === "music") {
      const asset = assetMap.get(action.assetId);
      if (asset) lines.push(`    play music ${quote(asset)} volume ${audioVolume(action.volume)}${action.fadeIn ? ` fadein ${audioFade(action.fadeIn)}` : ""}${action.loop === false ? " noloop" : " loop"}`);
      continue;
    }
    if (action.type === "stopMusic") {
      lines.push(`    stop music${action.fadeOut ? ` fadeout ${Math.max(0, Number(action.fadeOut) || 0)}` : ""}`);
      continue;
    }
    if(action.type==='stopAudio'){
      if(!AUDIO_CHANNELS.includes(action.channel))throw Error('Выберите, какой звук нужно остановить.');
      // voice statements queue a file for the next interaction. Cancel that
      // pending file as well as playback, through the public voice statement.
      if(action.channel==='voice')lines.push('    voice ""');
      lines.push(`    stop ${action.channel} fadeout ${audioFade(action.fadeOut)}`);continue;
    }
    if (action.type === "sound") {
      const asset = assetMap.get(action.assetId);
      if (asset) lines.push(`    play sound ${quote(asset)} volume ${audioVolume(action.volume)}${action.loop===true?' loop':' noloop'}`);
      continue;
    }
    if (action.type === "voice") {
      const asset = assetMap.get(action.assetId);
      if (asset) lines.push(`    voice ${quote(voiceFilename(asset,action.volume))}`);
      continue;
    }
    if (action.type === "effect") {
      const transition = transitionName(action.effect);
      if (transition) lines.push(`    with ${transition}`);
      continue;
    }
    if (action.type === "variable") {
      lines.push(...compileEffect(action, project).map((line) => line.replace(/^ {12}/, "    ")));
      continue;
    }
    if (action.type === "flag") {
      const flag = (project.flags ?? []).find((item) => item.id === action.flagId);
      if (flag) lines.push(`    $ ${asciiId(flag.id, "flag")} = ${action.value === true || action.value === 'true' ? "True" : "False"}`);
      continue;
    }
    if (action.type === "event" && scene.timelineEnabled) {lines.push(`    $ renpy.notify(${quote(action.text || "Событие")})`);continue;}
    if (action.type === "event") {
      lines.push(`    $ renpy.notify(${quote(action.text || "Событие")})`, `    pause ${Math.max(0.5, Number(action.duration) || 2.5)}`);
      continue;
    }
    if (action.type === "condition") {
      const expression = conditionExpression(action.condition??action, project);
      if (expression) {
        lines.push(`   ${expression}:`, `        jump ${asciiId(action.trueSceneId, "scene")}`, "    else:", `        jump ${asciiId(action.falseSceneId, "scene")}`);
      }
      continue;
    }
    if (action.type === "jump") {
      if (project.scenes[action.targetSceneId]) lines.push(`    jump ${asciiId(action.targetSceneId, "scene")}`);
      continue;
    }
    if(action.type==='rpg'){
      const errors=rpgActionProblems(action,project);if(errors.length)throw Error(errors.join(' '));if(scene.timelineEnabled)throw Error('Игровое меню требует последовательной сцены.');
      if(action.operation==='stat')lines.push(`    $ _istoriya_rpg_change(${quote(action.statId)}, ${quote(action.statOperation)}, ${Number(action.value)})`);
      else lines.push(`    call istoriya_rpg_open(${quote(action.operation)}, ${quote(action.actorId??'')})`);
      continue;
    }
    if (action.type === "end") {
      lines.push("    return");
      continue;
    }
  }

  if (scene.timelineEnabled) lines.push("    hide screen say");
  const terminal = storyActions(scene).find(action => ["choice", "condition", "jump", "end"].includes(action.type));
  if (!terminal) lines.push(nextSceneId ? `    jump ${asciiId(nextSceneId, "scene")}` : "    return", "");
  return lines.map(line => scene.timelineEnabled && line.startsWith("    with ") ? `    $ renpy.transition(${line.slice(9)})` : line).join("\n");
}

function createOptions(project, iconPath, cursorPath) {
  const slug = asciiId(project.meta.title, "game").replace(/^game_/, "") || "visual_novel";
  const saveDirectory = String(project.meta.saveDirectory || `${slug}-${project.meta.version || "1"}`).replace(/[^a-zA-Z0-9_.-]+/g, "-");
  const cursorX = Math.max(0, Math.round(Number(project.meta.cursorHotspot?.x) || 0));
  const cursorY = Math.max(0, Math.round(Number(project.meta.cursorHotspot?.y) || 0));
  return `${GENERATED_NOTICE}define config.name = _(${quote(project.meta.title)})
define gui.show_name = True
define config.version = ${quote(project.meta.version || "0.1.0")}
define gui.about = _(${quote(project.meta.description || "Создано в конструкторе История.")})
define build.name = ${quote(slug)}
define build.version = ${quote(project.meta.version || "0.1.0")}
define config.has_sound = True
define config.has_music = True
define config.has_voice = True
define config.enter_transition = dissolve
define config.exit_transition = dissolve
define config.after_load_transition = None
define config.end_game_transition = None
define config.window = "auto"
define config.default_fullscreen = ${project.meta.windowMode === "fullscreen" ? "True" : "False"}
default preferences.text_cps = ${Math.max(0, Math.round(Number(project.ui?.textSpeed) || 0))}
default preferences.afm_time = 15
define config.save_directory = ${quote(saveDirectory)}
${iconPath ? `define config.window_icon = ${quote(iconPath)}\ndefine build.icon = ${quote(iconPath)}` : ""}
${cursorPath ? `define config.mouse = { "default": [(${quote(cursorPath)}, ${cursorX}, ${cursorY})] }` : ""}

init python:
    build.classify("**~", None)
    build.classify("**.bak", None)
    build.classify("**/.**", None)
    build.classify("**/#**", None)
    build.classify("**/thumbs.db", None)
    build.classify("game/**.rpy", "archive")
    build.classify("game/images/**", "archive")
    build.documentation("*.txt")
`;
}

function createTheme(project, dialogueBackground, mainMenuBackground, choiceButton, choiceButtonHover) {
  const ui = project.ui ?? {};
  const position = ui.dialoguePosition === "top" ? 0.0 : ui.dialoguePosition === "center" ? 0.5 : 1.0;
  const opacity = Math.max(0.1, Math.min(1, (Number(ui.dialogueOpacity) || 86) / 100));
  const background = dialogueBackground || "gui/textbox.png";
  return `${GENERATED_NOTICE}${mainMenuBackground ? `init 100 python:\n    gui.main_menu_background = ${quote(mainMenuBackground)}\n` : ""}
init 100:
    style say_window:
        yalign ${renpyFloat(position)}
        background Transform(Image(${quote(background)}, xalign=0.5, yalign=0.5), alpha=${opacity})
    style say_dialogue:
        color ${quote(ui.dialogueTextColor || "#ffffff")}
        size ${Math.max(14, Math.round(Number(ui.dialogueFontSize) || 32))}
    style istoriya_narrator:
        color ${quote(ui.narratorTextColor || "#e6e6ef")}
        size ${Math.max(14, Math.round(Number(ui.narratorFontSize) || 30))}
${choiceButton || choiceButtonHover ? `    style choice_button:\n${choiceButton ? `        background Frame(${quote(choiceButton)}, 20, 20)\n` : ""}${choiceButtonHover ? `        hover_background Frame(${quote(choiceButtonHover)}, 20, 20)\n` : ""}` : ""}

`;
}

function createGallery(project, assetMap) {
  const sections = (project.gallery?.sections ?? []).map((section) => ({
    title: section.title,
    items: (section.items ?? []).map((item) => ({ id: item.id, title: item.title, image: assetMap.get(item.resourceId), always: item.unlockMode === "always" })).filter((item) => item.image),
  })).filter((section) => section.items.length);
  const literal = `[${sections.map((section) => `{ "title": ${quote(section.title)}, "items": [${section.items.map((item) => `{ "id": ${quote(item.id)}, "title": ${quote(item.title)}, "image": ${quote(item.image)}, "always": ${item.always ? "True" : "False"} }`).join(", ")}] }`).join(", ")}]`;
  return `${GENERATED_NOTICE}default persistent.istoriya_gallery_unlocked = set()
define istoriya_gallery_data = ${literal}

screen istoriya_gallery():
    tag menu
    use game_menu(_("Галерея"), scroll="viewport"):
        vbox:
            spacing 30
            for section in istoriya_gallery_data:
                text section["title"] size 34
                hbox:
                    spacing 18
                    for item in section["items"]:
                        frame:
                            xsize 320
                            ysize 210
                            if item["always"] or item["id"] in persistent.istoriya_gallery_unlocked:
                                imagebutton:
                                    idle Transform(item["image"], xysize=(300, 170), fit="contain")
                                    action Show("istoriya_gallery_viewer", image_path=item["image"])
                                text item["title"] xalign 0.5 yalign 1.0
                            else:
                                text _("Закрыто") xalign 0.5 yalign 0.5

screen istoriya_gallery_viewer(image_path):
    modal True
    zorder 200
    add Solid("#000000dd")
    add Transform(image_path, xysize=(int(config.screen_width * .86), int(config.screen_height * .82)), fit="contain") xalign .5 yalign .5
    textbutton _("Закрыть") action Hide("istoriya_gallery_viewer") xalign .98 yalign .04
`;
}

function customizeScreens(project, source) {
  const ui = project.ui ?? {};
  const menu = ui.mainMenuButtons ?? {};
  const quick = ui.quickMenuButtons ?? {};
  const labels = { Start: "Новая игра", History: "История", Save: "Сохранить", Load: "Загрузить", Preferences: "Настройки", "End Replay": "Завершить повтор", "Main Menu": "Главное меню", About: "Об игре", Help: "Помощь", Quit: "Выход", Back: "Назад", Skip: "Пропуск", Auto: "Авто", "Q.Save": "Быстр. сохранение", "Q.Load": "Быстр. загрузка", Prefs: "Настройки" };
  let result = source;
  const commonLabels={Return:'Назад','Page {}':'Страница {}','Automatic saves':'Автосохранения','Quick saves':'Быстрые сохранения','empty slot':'Пустой слот',Display:'Экран',Window:'В окне',Fullscreen:'Полный экран','Unseen Text':'Непрочитанный текст','After Choices':'После выбора',Transitions:'Переходы','Text Speed':'Скорость текста','Auto-Forward Time':'Время автоперехода','Music Volume':'Громкость музыки','Sound Volume':'Громкость звуков','Voice Volume':'Громкость голоса','Mute All':'Выключить весь звук',Test:'Проверить',Skipping:'Пропуск'};
  for(const [from,to]of Object.entries(commonLabels))result=result.replaceAll(`_("${from}")`,`_("${to}")`);
  for (const [from, to] of Object.entries(labels)) result = result.replaceAll(`_("${from}")`, `_("${to}")`);
  const disableLine = (needle) => { result = result.split("\n").map((line) => line.trim() === needle ? `${line.match(/^\s*/)[0]}null` : line).join("\n"); };
  if (menu.gallery !== false) result = result.replace('        textbutton _("Настройки") action ShowMenu("preferences")', '        textbutton _("Галерея") action ShowMenu("istoriya_gallery")\n\n        textbutton _("Настройки") action ShowMenu("preferences")');
  if (menu.start === false) disableLine('textbutton _("Новая игра") action Start()');
  if (menu.load === false) disableLine('textbutton _("Загрузить") action ShowMenu("load")');
  if (menu.preferences === false) disableLine('textbutton _("Настройки") action ShowMenu("preferences")');
  if (menu.about === false) disableLine('textbutton _("Об игре") action ShowMenu("about")');
  if (menu.quit === false) disableLine('textbutton _("Выход") action Quit(confirm=not main_menu)');
  if (quick.rollback === false) disableLine('textbutton _("Назад") action Rollback()');
  if (quick.history === false) disableLine("textbutton _(\"История\") action ShowMenu('history')");
  if (quick.skip === false) disableLine('textbutton _("Пропуск") action Skip() alternate Skip(fast=True, confirm=True)');
  if (quick.auto === false) disableLine('textbutton _("Авто") action Preference("auto-forward", "toggle")');
  if (quick.save === false) { disableLine("textbutton _(\"Сохранить\") action ShowMenu('save')"); disableLine('textbutton _("Быстр. сохранение") action QuickSave()'); }
  if (quick.load === false) disableLine('textbutton _("Быстр. загрузка") action QuickLoad()');
  if (quick.preferences === false) disableLine("textbutton _(\"Настройки\") action ShowMenu('preferences')");
  return result;
}

function usedResourceIds(project) {
  const ids = uiResourceIds(project);
  if(project.ui?.textStyle?.font)ids.add(project.ui.textStyle.font);
  for(const scene of Object.values(project.scenes??{}))for(const action of scene.actions??[])if(action.textStyle?.font)ids.add(action.textStyle.font);
  const resources = project.resources ?? [];
  const bySource = new Map(resources.map((item) => [item.source, item.id]));
  const addSource = (source) => { const id = bySource.get(source); if (id) ids.add(id); };
  for (const scene of Object.values(project.scenes ?? {})) {
    for(const layer of scene.images??[]){if(layer.resourceId)ids.add(layer.resourceId);for(const reaction of layer.interactions??[])for(const key of ['voiceAssetId','soundAssetId','resultResourceId'])if(reaction[key])ids.add(reaction[key]);}
    if (scene.backgroundResourceId) ids.add(scene.backgroundResourceId); else addSource(scene.background);
    for (const action of scene.actions ?? []) { for(const key of ['assetId','voiceAssetId','soundAssetId'])if(action[key])ids.add(action[key]); }
  }
  for (const character of project.characters ?? []) {
    if (character.portraitResourceId) ids.add(character.portraitResourceId); else addSource(character.portrait);
    for (const sprite of character.sprites ?? []) { if (sprite.resourceId) ids.add(sprite.resourceId); else addSource(sprite.source); }
  }
  for (const section of project.gallery?.sections ?? []) for (const item of section.items ?? []) if (item.resourceId) ids.add(item.resourceId);
  for(const item of project.items??[])if(item.iconResourceId)ids.add(item.iconResourceId);
  for (const id of [project.ui?.dialogueBackgroundResourceId, project.ui?.mainMenuBackgroundResourceId].filter(Boolean)) ids.add(id);
  [project.ui?.dialogueBackground, project.ui?.mainMenuBackground, project.ui?.choiceButton, project.ui?.choiceButtonHover].forEach(addSource);
  return ids;
}

function createScript(project, backgroundMap, assetMap = new Map(), spriteMap = new Map(), startSceneId = null, startActionId = null) {
  project = resolveStoryProject(project);
  const firstSceneId = project.scenes[startSceneId] ? startSceneId : project.chapters?.[0]?.scenes?.[0] ?? Object.keys(project.scenes)[0];
  const declarations = [`init python:\n    renpy.music.register_channel("ambience", mixer="sfx", loop=True)\n    renpy.add_layer("istoriya_cg_layer", above="master")\n    config.tag_layer["istoriya_cg"] = "istoriya_cg_layer"`, `define istoriya_narrator = Character(None, what_style="istoriya_narrator")`];
  const dialogueUi=gameUi(project).dialogue;
  for (const character of project.characters ?? []) {const imageTag=asciiId(character.id,'actor');declarations.push(`define ${asciiId(character.id, "character")} = Character(${quote(character.name)}, color=${quote(dialogueUi.enabled?dialogueUi.name.color:character.color || "#ffffff")}, image=${quote(imageTag)})`);const portrait=spriteMap.get(`${character.id}:portrait`)??spriteMap.get(`${character.id}:default`);if(portrait&&dialogueUi.enabled&&dialogueUi.portrait.visible)declarations.push(`image side ${imageTag} = ${quote(portrait)}`);}
  for (const variable of project.variables ?? []) declarations.push(`default ${asciiId(variable.id, "v")} = ${renpyLiteral(scalarValue(variable.type,variable.initial))}`);
  for (const flag of project.flags ?? []) declarations.push(`default ${asciiId(flag.id, "flag")} = ${scalarValue('boolean',flag.initial) ? "True" : "False"}`);
  const orderedSceneIds = (project.chapters ?? []).flatMap((chapter) => chapter.scenes ?? []);
  const nextSceneById = new Map(orderedSceneIds.map((sceneId, index) => [sceneId, orderedSceneIds[index + 1] ?? null]));
  const scenes = Object.values(project.scenes).map((scene) => compileScene(scene, project, backgroundMap, nextSceneById.get(scene.id), assetMap, spriteMap));
  let entry = firstSceneId;
  const offset = project.scenes[firstSceneId]?.actions.findIndex((action) => action.id === startActionId) ?? -1;
  if (offset >= 0) {
    entry = "istoriya_preview_entry";
    const backgrounds = new Map(backgroundMap);
    backgrounds.set(entry, backgroundMap.get(firstSceneId));
    scenes.push(compileScene({ ...project.scenes[firstSceneId], id: entry, sourceSceneId:firstSceneId,actions: project.scenes[firstSceneId].actions.slice(offset) }, project, backgrounds, nextSceneById.get(firstSceneId), assetMap, spriteMap));
  }
  return `${GENERATED_NOTICE}${declarations.join("\n")}
${interactionScript(project,assetMap,{quote,asciiId,conditionExpression,sayAppearance,compileEffect})}
${rpgScript(project,{quote,asciiId,conditionExpression})}

label start:
    jump ${asciiId(entry, "scene")}

${scenes.join("\n")}`;
}

function createAndroidConfig(project) {
  const android = project.meta.android ?? {};
  const packageName = String(android.packageName || `com.istoriya.${asciiId(project.meta.title, "game").replace(/^game_/, "novel")}`).toLowerCase();
  if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(packageName)) {
    throw new Error("ID приложения Android должен выглядеть как com.company.game и состоять из латинских букв, цифр, точек и подчёркиваний.");
  }
  return {
    package: packageName,
    name: project.meta.title,
    icon_name: project.meta.title,
    version: project.meta.version || "0.1.0",
    numeric_version: Math.max(1, Math.round(Number(android.versionCode) || 1)),
    orientation: android.orientation || "sensorLandscape",
    permissions: Array.from(new Set([...(android.permissions ?? ["VIBRATE"]), "INTERNET"])),
    include_pil: false,
    include_sqlite: false,
    layout: null,
    source: false,
    expansion: false,
    google_play_key: null,
    google_play_salt: null,
    store: android.store || "none",
    update_icons: true,
    update_always: true,
    heap_size: null,
    update_keystores: true,
  };
}

export async function compileProject(project, destination, options) {
  assertProjectShape(project);
  const uiErrors=uiLayoutProblems(project);if(uiErrors.length)throw Error(uiErrors.map(e=>e.message).join(' '));
  if (!project?.meta || !project?.scenes) throw new Error("Файл проекта повреждён или имеет неизвестный формат.");
  if (!destination || path.resolve(destination) === path.parse(path.resolve(destination)).root) throw new Error("Небезопасная папка назначения.");
  const sdkPath = path.resolve(options.sdkPath);
  const assetsRoot = path.resolve(options.assetsRoot);
  const gameDir = path.join(destination, "game");
  const generatedImagesDir = path.join(gameDir, "images", "generated");
  const generatedAssetsDir = path.join(gameDir, "assets", "generated");
  const guiDir = path.join(gameDir, "gui");
  await Promise.all([fs.mkdir(generatedImagesDir, { recursive: true }), fs.mkdir(generatedAssetsDir, { recursive: true })]);
  const width = Number(project.meta.resolution?.width) || 1920;
  const height = Number(project.meta.resolution?.height) || 1080;
  const generatedGui=options.preparedGui!=null?validateGameGui(options.preparedGui):await generateGameGui(sdkPath,gameDir,width,height);
  await fs.writeFile(path.join(gameDir, "gui.rpy"), generatedGui.gui, "utf8");
  // Overwrite legacy compiler-owned support and invalidate its old bytecode.
  // Never ship SDK GUI regeneration/imports into a standalone game.
  await fs.writeFile(path.join(gameDir, "guisupport.rpy"), `${GENERATED_NOTICE}init -100 python in gui:\n    def scale(n):\n        return int(n)\n`, "utf8");
  await fs.rm(path.join(gameDir,'guisupport.rpyc'),{force:true});
  await fs.writeFile(path.join(gameDir, "screens.rpy"), customizeScreens(project, generatedGui.screens), "utf8");

  const assetMap = new Map();
  const assetBySource = new Map();
  const usedIds = usedResourceIds(project);
  for (const resource of project.resources ?? []) {
    if (!resource.source) continue;
    if (project.meta.buildQuality !== "original" && !usedIds.has(resource.id)) continue;
    const targetBase = path.join(generatedAssetsDir, asciiId(`${resource.category}_${resource.id}`, "asset"));
    const asset = await materializeAsset(resource.source, targetBase, assetsRoot);
    const relative = path.relative(gameDir, asset).split(path.sep).join("/");
    assetMap.set(resource.id, relative);
    assetBySource.set(resource.source, relative);
  }

  const spriteMap = new Map();
  for (const character of project.characters ?? []) {
    let defaultSprite = null;
    if (character.portraitResourceId && assetMap.has(character.portraitResourceId)) defaultSprite = assetMap.get(character.portraitResourceId);
    else if (character.portrait) {
      const asset = await materializeAsset(character.portrait, path.join(generatedImagesDir, asciiId(`${character.id}_portrait`, "character")), assetsRoot);
      defaultSprite = path.relative(gameDir, asset).split(path.sep).join("/");
    }
    if (defaultSprite) {spriteMap.set(`${character.id}:default`, defaultSprite);spriteMap.set(`${character.id}:portrait`,defaultSprite);}
    for (const sprite of character.sprites ?? []) {
      let relative = sprite.resourceId ? assetMap.get(sprite.resourceId) : null;
      if (!relative && sprite.source) {
        const asset = await materializeAsset(sprite.source, path.join(generatedImagesDir, asciiId(`${character.id}_${sprite.id}`, "sprite")), assetsRoot);
        relative = path.relative(gameDir, asset).split(path.sep).join("/");
      }
      if (relative) {
        spriteMap.set(`${character.id}:${sprite.id}`, relative);
        if (!spriteMap.has(`${character.id}:default`)) spriteMap.set(`${character.id}:default`, relative);
      }
    }
  }

  for (const character of project.characters ?? []) {
    const selected = resolveCharacterSprite(character, null, project.resources).sprite;
    if (selected && spriteMap.has(`${character.id}:${selected.id}`)) spriteMap.set(`${character.id}:default`, spriteMap.get(`${character.id}:${selected.id}`));
  }

  const backgroundMap = new Map();
  await fs.writeFile(path.join(gameDir,'00_istoriya_motion.rpy'),GENERATED_NOTICE+motionWarperScript,'utf8');
  for (const scene of Object.values(project.scenes)) {
    if (!scene.background && !scene.backgroundResourceId) continue;
    const linked = assetMap.get(scene.backgroundResourceId) ?? assetBySource.get(scene.background);
    if (linked) backgroundMap.set(scene.id, linked);
    else {
      const asset = await materializeAsset(scene.background, path.join(generatedImagesDir, asciiId(scene.id, "background")), assetsRoot);
      backgroundMap.set(scene.id, path.relative(gameDir, asset).split(path.sep).join("/"));
    }
  }

  let icon = null;
  let cursor = null;
  let dialogueBackground = null;
  let mainMenuBackground = null;
  let choiceButton = null;
  let choiceButtonHover = null;
  if (project.meta.icon) icon = await materializeAsset(project.meta.icon, path.join(guiDir, "window_icon_custom"), assetsRoot);
  if (project.meta.cursor) cursor = await materializeAsset(project.meta.cursor, path.join(guiDir, "custom_cursor"), assetsRoot);
  if (project.ui?.dialogueBackground) dialogueBackground = await materializeAsset(project.ui.dialogueBackground, path.join(guiDir, "dialogue_custom"), assetsRoot);
  if (project.ui?.mainMenuBackground) mainMenuBackground = await materializeAsset(project.ui.mainMenuBackground, path.join(guiDir, "main_menu_custom"), assetsRoot);
  if (project.ui?.choiceButton) choiceButton = await materializeAsset(project.ui.choiceButton, path.join(guiDir, "choice_button_custom"), assetsRoot);
  if (project.ui?.choiceButtonHover) choiceButtonHover = await materializeAsset(project.ui.choiceButtonHover, path.join(guiDir, "choice_button_hover_custom"), assetsRoot);
  const iconPath = icon ? path.relative(gameDir, icon).split(path.sep).join("/") : null;
  const cursorPath = cursor ? path.relative(gameDir, cursor).split(path.sep).join("/") : null;
  const dialogueBackgroundPath = dialogueBackground ? path.relative(gameDir, dialogueBackground).split(path.sep).join("/") : null;
  const mainMenuBackgroundPath = mainMenuBackground ? path.relative(gameDir, mainMenuBackground).split(path.sep).join("/") : null;
  const choiceButtonPath = choiceButton ? path.relative(gameDir, choiceButton).split(path.sep).join("/") : null;
  const choiceButtonHoverPath = choiceButtonHover ? path.relative(gameDir, choiceButtonHover).split(path.sep).join("/") : null;

  await fs.writeFile(path.join(gameDir, "options.rpy"), createOptions(project, iconPath, cursorPath), "utf8");
  await fs.writeFile(path.join(gameDir, "script.rpy"), createScript(project, backgroundMap, assetMap, spriteMap, options.startSceneId, options.startActionId), "utf8");
  await fs.writeFile(path.join(gameDir, "theme.rpy"), createTheme(project, dialogueBackgroundPath, mainMenuBackgroundPath, choiceButtonPath, choiceButtonHoverPath), "utf8");
  await fs.writeFile(path.join(gameDir,'ui_custom.rpy'),gameUiScript(project,assetMap,{quote,dialogueBackgroundPath}),'utf8');
  await fs.writeFile(path.join(gameDir, "gallery.rpy"), createGallery(project, assetMap), "utf8");
  await fs.writeFile(path.join(destination, "android.json"), JSON.stringify(createAndroidConfig(project), null, 2), "utf8");
  await fs.writeFile(path.join(destination, "project.vnproject"), JSON.stringify(project, null, 2), "utf8");
  await fs.writeFile(path.join(destination, "README.txt"), `Игра «${project.meta.title}» создана в конструкторе «История».\r\nRuntime: Ren'Py 8.5.3.\r\n`, "utf8");

  return { destination, gameDir, sceneCount: Object.keys(project.scenes).length, backgroundCount: backgroundMap.size };
}

export const compilerInternals = { asciiId, quote, renpyLiteral, createScript, createOptions, createTheme, createGallery, customizeScreens, usedResourceIds, createAndroidConfig };
