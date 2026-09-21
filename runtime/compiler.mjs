import { resolveCharacterSprite } from "./character-sprites.mjs";
import fs from "node:fs/promises";
import { timelineEvents } from "./timeline-model.mjs";
import { resolveStoryProject } from "./story-routing.mjs";
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

function compileEffect(effect, variables) {
  const variable = variables.find((item) => item.id === effect.variableId);
  if (!variable) return [];
  const name = asciiId(variable.id, "v");
  if (effect.operation === "add") return [`            $ ${name} += ${Number(effect.value) || 0}`];
  if (effect.operation === "subtract") return [`            $ ${name} -= ${Number(effect.value) || 0}`];
  const value = variable.type === "number" || variable.type === "relationship" ? Number(effect.value) || 0 : variable.type === "boolean" ? (effect.value === true || effect.value === "true") : effect.value;
  return [`            $ ${name} = ${renpyLiteral(value)}`];
}

function transitionName(value) {
  if (!value || value === "none") return null;
  if (value === "flash") return "flash";
  if (value === "shake") return "hpunch";
  if (["fade", "dissolve", "moveinleft", "moveinright", "moveoutleft", "moveoutright"].includes(value)) return value;
  return "dissolve";
}

function comparisonOperator(value) {
  return { eq: "==", neq: "!=", gt: ">", gte: ">=", lt: "<", lte: "<=" }[value] ?? "==";
}

function conditionExpression(condition, project) {
  if (!condition?.variableId) return "";
  const variable = (project.variables ?? []).find((item) => item.id === condition.variableId);
  if (!variable) return "";
  const value = variable.type === "number" || variable.type === "relationship" ? Number(condition.value) || 0 : variable.type === "boolean" ? String(condition.value) === "true" || condition.value === true : condition.value;
  return ` if ${asciiId(variable.id, "v")} ${comparisonOperator(condition.operator)} ${renpyLiteral(value)}`;
}

function sayAppearance(project, action, assetMap) {
  const style={font:'DejaVuSans.ttf',size:action.type==='narration'?project.ui?.narratorFontSize??30:project.ui?.dialogueFontSize??32,color:project.ui?.dialogueTextColor??'#ffffff',speed:project.ui?.textSpeed??35,outline:0,outlineColor:'#000000',...project.ui?.textStyle,...action.textStyle};
  const font=assetMap.get(style.font)??(['DejaVuSans.ttf','DejaVuSans-Bold.ttf'].includes(style.font)?style.font:'DejaVuSans.ttf');
  const outlines=[];
  if(style.outline)outlines.push(`(${Math.max(0,Number(style.outline)||0)}, ${quote(style.outlineColor)}, 0, 0)`);
  if(style.shadow)outlines.push(`(0, "#000000", 2, 2)`);
  return ` (what_font=${quote(font)}, what_size=${Math.max(10,Number(style.size)||32)}, what_color=${quote(style.color)}, what_bold=${style.bold?'True':'False'}, what_italic=${style.italic?'True':'False'}, what_underline=${style.underline?'True':'False'}, what_outlines=[${outlines.join(', ')}], what_slow_cps=${Math.max(0,Number(style.speed)||0)})`;
}
function compileScene(scene, project, backgroundMap, nextSceneId, assetMap = new Map(), spriteMap = new Map()) {
  const lines = [`label ${asciiId(scene.id, "scene")}:`];
  const background = backgroundMap.get(scene.id);
  const width = Number(project.meta.resolution.width) || 1920;
  const height = Number(project.meta.resolution.height) || 1080;
  const sizedSprite = (sprite) => `Transform(${quote(sprite)}, xysize=(${Math.round(width * .34)}, ${Math.round(height * .88)}), fit="contain")`;
  if (background) {
    lines.push(`    scene expression Transform(${quote(background)}, xysize=(${width}, ${height}))`);
    const transition = transitionName(scene.transition);
    if (transition) lines.push(`    with ${transition}`);
  } else lines.push('    scene expression Solid("#000000")');

  for (const [index, layer] of (scene.characters ?? []).entries()) {
    if (layer.visible === false) continue;
    const sprite = spriteMap.get(`${layer.characterId}:${layer.spriteId ?? "default"}`) ?? spriteMap.get(`${layer.characterId}:default`);
    if (!sprite) continue;
    const x = Number(layer.x ?? (layer.position === "left" ? 25 : layer.position === "right" ? 75 : 50)) / 100;
    const y = Number(layer.y ?? 100) / 100;
    lines.push(`    show expression ${sizedSprite(sprite)} as ${asciiId(layer.characterId, "actor")} at Transform(xpos=${x}, ypos=${y}, xanchor=0.5, yanchor=1.0, zoom=${Number(layer.scale ?? 100) / 100}, rotate=${Number(layer.rotation ?? 0)}, alpha=${Number(layer.opacity ?? 100) / 100}, xzoom=${layer.flip ? -1 : 1}) zorder ${index + 1}`);
  }

  if (!scene.actions?.length) {
    lines.push(nextSceneId ? `    jump ${asciiId(nextSceneId, "scene")}` : "    return", "");
    return lines.join("\n");
  }

  if (scene.timelineEnabled) lines.push('    $ _timeline_origin = renpy.get_game_runtime()', '    $ _timeline_hold = 0.0');
  for (const action of (scene.timelineEnabled ? timelineEvents(scene) : scene.actions)) {
    if (action.type === 'timelineWait') { lines.push(`    $ renpy.pause(max(0.0, ${action.time} - (renpy.get_game_runtime() - _timeline_origin - _timeline_hold)), hard=True)`); continue; }
    if (action.type === 'timelineTextEnd') {
      if (action.wait) lines.push('    $ _timeline_before = renpy.get_game_runtime()', '    pause', '    $ _timeline_hold += renpy.get_game_runtime() - _timeline_before');
      lines.push('    hide screen say'); continue;
    }
    if (action.type === 'timelineStopAudio') { lines.push(`    stop ${action.channel}`); continue; }
    if (action.type === 'timelineBackgroundEnd') { lines.push('    hide istoriya_timeline_bg'); continue; }
    if (scene.timelineEnabled && action.type === 'pause') continue;
    if (action.type === 'pause') { lines.push(`    pause ${Math.max(.1,Number(action.duration)||1)}`); continue; }
    if (action.type === "background") {
      const asset = assetMap.get(action.assetId);
      if (asset) {
        lines.push(scene.timelineEnabled ? `    show expression Transform(${quote(asset)}, xysize=(${width}, ${height})) as istoriya_timeline_bg zorder -100` : `    scene expression Transform(${quote(asset)}, xysize=(${width}, ${height}))`);
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
      if (voice) lines.push(`    voice ${quote(voice)}`);
      lines.push(scene.timelineEnabled ? `    $ ${speaker}(${quote(action.text)}, interact=False, ${sayAppearance(project,action,assetMap).trim().slice(1,-1)})` : `    ${speaker} ${quote(action.text)}${sayAppearance(project,action,assetMap)}`);
      continue;
    }
    if (action.type === "narration") {
      lines.push(scene.timelineEnabled ? `    $ istoriya_narrator(${quote(action.text)}, interact=False, ${sayAppearance(project,action,assetMap).trim().slice(1,-1)})` : `    istoriya_narrator ${quote(action.text)}${sayAppearance(project,action,assetMap)}`);
      continue;
    }
    if (action.type === "choice") {
      lines.push("    menu:", `        ${quote(action.prompt || "Что сделать?")}`);
      for (const option of action.options ?? []) {
        lines.push(`        ${quote(option.text)}${conditionExpression(option.condition, project)}:`);
        for (const effect of option.effects ?? []) {
          if (effect.kind === "flag") {
            const flag = (project.flags ?? []).find((item) => item.id === effect.flagId);
            if (flag) lines.push(`            $ ${asciiId(flag.id, "flag")} = ${effect.value ? "True" : "False"}`);
          } else lines.push(...compileEffect(effect, project.variables ?? []));
        }
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
        const transform = `Transform(xpos=${Number(action.x ?? ({left:25,center:50,right:75})[position])/100}, ypos=${Number(action.y ?? 100)/100}, xanchor=0.5, yanchor=1.0, zoom=${Number(action.scale ?? 100)/100})`;
        lines.push(`    show expression ${sizedSprite(sprite)} as ${tag} at ${transform}`);
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
      const sprite = spriteMap.get(`${action.characterId}:${action.spriteId ?? "default"}`) ?? spriteMap.get(`${action.characterId}:default`);
      if (character && sprite) {
        const tag = asciiId(character.id, "actor");
        if (action.type === "changeSprite") {
          lines.push(`    show expression ${sizedSprite(sprite)} as ${tag}`);
          const transition = transitionName(action.transition);
          if (transition) lines.push(`    with ${transition}`);
        } else if (action.type === "moveCharacter") {
          const position = ["left", "right", "center"].includes(action.position) ? action.position : "center";
          lines.push(`    show expression ${sizedSprite(sprite)} as ${tag} at ${position}`, `    with MoveTransition(${Math.max(0.1, Number(action.duration) || 0.5)})`);
        } else {
          const duration = Math.max(0.1, Number(action.duration) || 0.5);
          const intensity = Math.max(0.2, Math.min(3, Number(action.intensity) || 1));
          if (action.animation === "shake") lines.push("    with hpunch");
          else if (action.animation === "strongShake") lines.push("    with vpunch", "    with hpunch");
          else {
            const transform = { jump: "istoriya_jump", bounce: "istoriya_bounce", pulse: "istoriya_pulse", zoomIn: "istoriya_zoom", stepForward: "istoriya_step_forward", stepBack: "istoriya_step_back" }[action.animation] ?? "istoriya_jump";
            lines.push(`    show expression ${sizedSprite(sprite)} as ${tag} at ${transform}(${duration}, ${intensity})`);
          }
        }
      }
      continue;
    }
    if (action.type === "showCG") {
      const asset = assetMap.get(action.assetId);
      if (asset) {
        lines.push(`    show expression ${quote(asset)} as istoriya_cg at truecenter`);
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
      lines.push("    hide istoriya_cg");
      const transition = transitionName(action.transition);
      if (transition) lines.push(`    with ${transition}`);
      continue;
    }
    if (action.type === "ambience") {
      const asset=assetMap.get(action.assetId);
      if(asset)lines.push(`    play ambience ${quote(asset)} volume ${Math.max(0,Math.min(1,Number(action.volume??1)))}${action.loop===false?" noloop":" loop"}`);
      continue;
    }
    if (action.type === "music") {
      const asset = assetMap.get(action.assetId);
      if (asset) lines.push(`    play music ${quote(asset)} volume ${Math.max(0, Math.min(1, Number(action.volume) || 0))}${action.fadeIn ? ` fadein ${Math.max(0, Number(action.fadeIn) || 0)}` : ""}${action.loop === false ? " noloop" : " loop"}`);
      continue;
    }
    if (action.type === "stopMusic") {
      lines.push(`    stop music${action.fadeOut ? ` fadeout ${Math.max(0, Number(action.fadeOut) || 0)}` : ""}`);
      continue;
    }
    if (action.type === "sound") {
      const asset = assetMap.get(action.assetId);
      if (asset) lines.push(`    play sound ${quote(asset)} volume ${Math.max(0, Math.min(1, Number(action.volume ?? 1)))}`);
      continue;
    }
    if (action.type === "voice") {
      const asset = assetMap.get(action.assetId);
      if (asset) lines.push(`    voice ${quote(asset)}`);
      continue;
    }
    if (action.type === "effect") {
      const transition = transitionName(action.effect);
      if (transition) lines.push(`    with ${transition}`);
      continue;
    }
    if (action.type === "variable") {
      lines.push(...compileEffect(action, project.variables ?? []).map((line) => line.replace(/^ {12}/, "    ")));
      continue;
    }
    if (action.type === "flag") {
      const flag = (project.flags ?? []).find((item) => item.id === action.flagId);
      if (flag) lines.push(`    $ ${asciiId(flag.id, "flag")} = ${action.value ? "True" : "False"}`);
      continue;
    }
    if (action.type === "event" && scene.timelineEnabled) {lines.push(`    $ renpy.notify(${quote(action.text || "Событие")})`);continue;}
    if (action.type === "event") {
      lines.push(`    $ renpy.notify(${quote(action.text || "Событие")})`, `    pause ${Math.max(0.5, Number(action.duration) || 2.5)}`);
      continue;
    }
    if (action.type === "condition") {
      const variable = (project.variables ?? []).find((item) => item.id === action.variableId);
      if (variable) {
        const compareValue = variable.type === "number" || variable.type === "relationship" ? Number(action.value) || 0 : variable.type === "boolean" ? String(action.value) === "true" || action.value === true : action.value;
        lines.push(`    if ${asciiId(variable.id, "v")} ${comparisonOperator(action.operator)} ${renpyLiteral(compareValue)}:`, `        jump ${asciiId(action.trueSceneId, "scene")}`, "    else:", `        jump ${asciiId(action.falseSceneId, "scene")}`);
      }
      continue;
    }
    if (action.type === "jump") {
      if (project.scenes[action.targetSceneId]) lines.push(`    jump ${asciiId(action.targetSceneId, "scene")}`);
      continue;
    }
    if (action.type === "end") {
      lines.push("    return");
      continue;
    }
  }

  if (scene.timelineEnabled) lines.push("    hide screen say");
  const lastAction = scene.actions.at(-1);
  if (!["choice", "condition", "jump", "end"].includes(lastAction?.type)) lines.push(nextSceneId ? `    jump ${asciiId(nextSceneId, "scene")}` : "    return", "");
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
        yalign ${position}
        background Transform(Image(${quote(background)}, xalign=0.5, yalign=0.5), alpha=${opacity})
    style say_dialogue:
        color ${quote(ui.dialogueTextColor || "#ffffff")}
        size ${Math.max(14, Math.round(Number(ui.dialogueFontSize) || 32))}
    style istoriya_narrator:
        color ${quote(ui.narratorTextColor || "#e6e6ef")}
        size ${Math.max(14, Math.round(Number(ui.narratorFontSize) || 30))}
${choiceButton || choiceButtonHover ? `    style choice_button:\n${choiceButton ? `        background Frame(${quote(choiceButton)}, 20, 20)\n` : ""}${choiceButtonHover ? `        hover_background Frame(${quote(choiceButtonHover)}, 20, 20)\n` : ""}` : ""}

transform istoriya_jump(duration=0.5, intensity=1.0):
    yoffset 0
    ease duration / 2.0 yoffset int(-90 * intensity)
    ease duration / 2.0 yoffset 0

transform istoriya_bounce(duration=0.6, intensity=1.0):
    yoffset 0
    ease duration / 4.0 yoffset int(-55 * intensity)
    ease duration / 4.0 yoffset 0
    ease duration / 4.0 yoffset int(-28 * intensity)
    ease duration / 4.0 yoffset 0

transform istoriya_pulse(duration=0.6, intensity=1.0):
    zoom 1.0
    ease duration / 2.0 zoom 1.0 + (0.08 * intensity)
    ease duration / 2.0 zoom 1.0

transform istoriya_zoom(duration=0.5, intensity=1.0):
    zoom max(0.1, 1.0 - (0.25 * intensity))
    ease duration zoom 1.0

transform istoriya_step_forward(duration=0.5, intensity=1.0):
    zoom 1.0
    ease duration zoom 1.0 + (0.12 * intensity)

transform istoriya_step_back(duration=0.5, intensity=1.0):
    zoom 1.0
    ease duration zoom max(0.1, 1.0 - (0.12 * intensity))
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
  const ids = new Set();
  if(project.ui?.textStyle?.font)ids.add(project.ui.textStyle.font);
  for(const scene of Object.values(project.scenes??{}))for(const action of scene.actions??[])if(action.textStyle?.font)ids.add(action.textStyle.font);
  const resources = project.resources ?? [];
  const bySource = new Map(resources.map((item) => [item.source, item.id]));
  const addSource = (source) => { const id = bySource.get(source); if (id) ids.add(id); };
  for (const scene of Object.values(project.scenes ?? {})) {
    if (scene.backgroundResourceId) ids.add(scene.backgroundResourceId); else addSource(scene.background);
    for (const action of scene.actions ?? []) { if (action.assetId) ids.add(action.assetId); if (action.voiceAssetId) ids.add(action.voiceAssetId); }
  }
  for (const character of project.characters ?? []) {
    if (character.portraitResourceId) ids.add(character.portraitResourceId); else addSource(character.portrait);
    for (const sprite of character.sprites ?? []) { if (sprite.resourceId) ids.add(sprite.resourceId); else addSource(sprite.source); }
  }
  for (const section of project.gallery?.sections ?? []) for (const item of section.items ?? []) if (item.resourceId) ids.add(item.resourceId);
  for (const id of [project.ui?.dialogueBackgroundResourceId, project.ui?.mainMenuBackgroundResourceId].filter(Boolean)) ids.add(id);
  [project.ui?.dialogueBackground, project.ui?.mainMenuBackground, project.ui?.choiceButton, project.ui?.choiceButtonHover].forEach(addSource);
  return ids;
}

function createScript(project, backgroundMap, assetMap = new Map(), spriteMap = new Map(), startSceneId = null, startActionId = null) {
  project = resolveStoryProject(project);
  const firstSceneId = project.scenes[startSceneId] ? startSceneId : project.chapters?.[0]?.scenes?.[0] ?? Object.keys(project.scenes)[0];
  const declarations = [`init python:\n    renpy.music.register_channel("ambience", mixer="sfx", loop=True)`, `define istoriya_narrator = Character(None, what_style="istoriya_narrator")`];
  for (const character of project.characters ?? []) declarations.push(`define ${asciiId(character.id, "character")} = Character(${quote(character.name)}, color=${quote(character.color || "#ffffff")})`);
  for (const variable of project.variables ?? []) declarations.push(`default ${asciiId(variable.id, "v")} = ${renpyLiteral(variable.initial)}`);
  for (const flag of project.flags ?? []) declarations.push(`default ${asciiId(flag.id, "flag")} = ${flag.initial ? "True" : "False"}`);
  const orderedSceneIds = (project.chapters ?? []).flatMap((chapter) => chapter.scenes ?? []);
  const nextSceneById = new Map(orderedSceneIds.map((sceneId, index) => [sceneId, orderedSceneIds[index + 1] ?? null]));
  const scenes = Object.values(project.scenes).map((scene) => compileScene(scene, project, backgroundMap, nextSceneById.get(scene.id), assetMap, spriteMap));
  let entry = firstSceneId;
  const offset = project.scenes[firstSceneId]?.actions.findIndex((action) => action.id === startActionId) ?? -1;
  if (offset >= 0) {
    entry = "istoriya_preview_entry";
    const backgrounds = new Map(backgroundMap);
    backgrounds.set(entry, backgroundMap.get(firstSceneId));
    scenes.push(compileScene({ ...project.scenes[firstSceneId], id: entry, actions: project.scenes[firstSceneId].actions.slice(offset) }, project, backgrounds, nextSceneById.get(firstSceneId), assetMap, spriteMap));
  }
  return `${GENERATED_NOTICE}${declarations.join("\n")}

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
  if (!project?.meta || !project?.scenes) throw new Error("Файл проекта повреждён или имеет неизвестный формат.");
  if (!destination || path.resolve(destination) === path.parse(path.resolve(destination)).root) throw new Error("Небезопасная папка назначения.");
  const sdkPath = path.resolve(options.sdkPath);
  const assetsRoot = path.resolve(options.assetsRoot);
  const gameDir = path.join(destination, "game");
  const generatedImagesDir = path.join(gameDir, "images", "generated");
  const generatedAssetsDir = path.join(gameDir, "assets", "generated");
  const guiDir = path.join(gameDir, "gui");
  await Promise.all([fs.mkdir(generatedImagesDir, { recursive: true }), fs.mkdir(generatedAssetsDir, { recursive: true })]);
  await fs.cp(path.join(sdkPath, "gui", "game", "gui"), guiDir, { recursive: true, force: true });
  await fs.copyFile(path.join(sdkPath, "gui", "game", "guisupport.rpy"), path.join(gameDir, "guisupport.rpy"));
  const guiTemplate = await fs.readFile(path.join(sdkPath, "gui", "game", "gui.rpy"), "utf8");
  const width = Number(project.meta.resolution?.width) || 1920;
  const height = Number(project.meta.resolution?.height) || 1080;
  const guiSource = guiTemplate.replace(/gui\.init\(\s*1280\s*,\s*720\s*\)/, `gui.init(${width}, ${height})`);
  await fs.writeFile(path.join(gameDir, "gui.rpy"), guiSource, "utf8");
  const screensTemplate = await fs.readFile(path.join(sdkPath, "gui", "game", "screens.rpy"), "utf8");
  await fs.writeFile(path.join(gameDir, "screens.rpy"), customizeScreens(project, screensTemplate), "utf8");

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
    if (defaultSprite) spriteMap.set(`${character.id}:default`, defaultSprite);
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
  for (const scene of Object.values(project.scenes)) {
    if (!scene.background) continue;
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
  await fs.writeFile(path.join(gameDir, "gallery.rpy"), createGallery(project, assetMap), "utf8");
  await fs.writeFile(path.join(destination, "android.json"), JSON.stringify(createAndroidConfig(project), null, 2), "utf8");
  await fs.writeFile(path.join(destination, "project.vnproject"), JSON.stringify(project, null, 2), "utf8");
  await fs.writeFile(path.join(destination, "README.txt"), `Игра «${project.meta.title}» создана в конструкторе «История».\r\nRuntime: Ren'Py 8.5.3.\r\n`, "utf8");

  return { destination, gameDir, sceneCount: Object.keys(project.scenes).length, backgroundCount: backgroundMap.size };
}

export const compilerInternals = { asciiId, quote, renpyLiteral, createScript, createOptions, createTheme, createGallery, customizeScreens, usedResourceIds, createAndroidConfig };
