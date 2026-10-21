import {sceneImages} from './image-layers.mjs';
import {voiceFilename,audioVolume} from './audio-model.mjs';
export function explorationLines(sceneId,action,quote) {
 return [
  '    $ _istoriya_clicked = None',
  '    while _istoriya_clicked != "__continue__":',`        $ _istoriya_install_props(${quote(sceneId)})`,
  `        call screen istoriya_explore(${quote(action.prompt||'Осмотрите сцену')}, ${quote(action.requiredItemId||'')}, ${quote(action.requiredFlagId||'')}, ${quote(JSON.stringify([sceneId,action.id]))})`,
  '        $ _istoriya_clicked = _return',`        $ _istoriya_restore_props(${quote(sceneId)})`,
  '        if _istoriya_clicked and _istoriya_clicked != "__continue__":',
  '            $ _istoriya_selected = None',
  '            if isinstance(_istoriya_clicked, tuple) and len(_istoriya_clicked) == 2:',
  '                $ _istoriya_clicked, _istoriya_selected = _istoriya_clicked',
  '            else:',`                $ _istoriya_options = _istoriya_reactions(${quote(sceneId)}, _istoriya_clicked)`,
  '                if len(_istoriya_options) == 1:', '                    $ _istoriya_selected = _istoriya_options[0]["id"]',
  '                elif _istoriya_options:',`                    call screen istoriya_prop_verbs(${quote(sceneId)}, _istoriya_clicked)`, '                    $ _istoriya_selected = _return',
  `            if _istoriya_selected and _istoriya_allowed(${quote(sceneId)}, _istoriya_clicked, _istoriya_selected):`,
  `                call expression _istoriya_props[${quote(sceneId)}][_istoriya_clicked]["labels"][_istoriya_selected]`,
 ];
}
export function interactionScript(project,assetMap,{quote,asciiId,conditionExpression,sayAppearance,compileEffect}) {
 const scenes={},conditions=[],exploreConditions=[],labels=[],items={};
 for(const item of project.items??[])items[item.id]={...item,icon:assetMap.get(item.iconResourceId)??null};
 for(const scene of Object.values(project.scenes)) {
  for(const action of scene.actions??[])if(action.type==='explore')exploreConditions.push(`    _istoriya_explore_conditions[${quote(JSON.stringify([scene.id,action.id]))}] = lambda: ${conditionExpression(action.condition,project).replace(/^ if /,'')||'True'}`);
  scenes[scene.id]={};
  for(const layer of sceneImages(scene).filter(l=>l.interactions?.length)) {
   const data={...layer,source:assetMap.get(layer.resourceId),tag:asciiId(layer.id,'image'),labels:{},widthPx:Math.round(project.meta.resolution.width*layer.width/100),heightPx:Math.round(project.meta.resolution.height*layer.height/100)};
   for(const reaction of layer.interactions) {
    const label=asciiId(`${scene.id}_${layer.id}_${reaction.id}`,'istoriya_reaction');data.labels[reaction.id]=label;
    const expression=conditionExpression(reaction.condition,project).replace(/^ if /,'')||'True';
    conditions.push(`    _istoriya_conditions[(${quote(scene.id)}, ${quote(layer.id)}, ${quote(reaction.id)})] = lambda: ${expression}`);
    labels.push(`label ${label}:`,`    if not _istoriya_allowed(${quote(scene.id)}, ${quote(layer.id)}, ${quote(reaction.id)}):`,'        return',`    $ _istoriya_apply(${quote(scene.id)}, ${quote(layer.id)}, ${quote(reaction.id)})`);
    for(const effect of reaction.effects??[]) labels.push(...compileEffect(effect,project).map(line=>line.replace(/^ {12}/,'    ')));
    const sound=assetMap.get(reaction.soundAssetId),voice=assetMap.get(reaction.voiceAssetId);
    if(sound)labels.push(`    play sound ${quote(sound)} volume ${audioVolume(reaction.soundVolume)}`);
    if(voice)labels.push(`    voice ${quote(voiceFilename(voice,reaction.voiceVolume))}`);
    if(reaction.text||voice)labels.push(`    ${reaction.speakerId?asciiId(reaction.speakerId,'character'):'istoriya_narrator'} ${quote(reaction.text??'')}${sayAppearance(project,reaction,assetMap)}`);
    if(reaction.targetSceneId)labels.push(`    jump ${asciiId(reaction.targetSceneId,'scene')}`);else labels.push('    return');
    labels.push('');
   }
   scenes[scene.id][layer.id]=data;
  }
 }
 const flagNames=Object.fromEntries((project.flags??[]).map(f=>[f.id,asciiId(f.id,'flag')]));
 return `default istoriya_inventory = {}
default istoriya_hidden_props = set()
default istoriya_used_interactions = set()
default istoriya_prop_images = {}
default _istoriya_motion_props = {}

init python:
    import json as _istoriya_json
    _istoriya_props = _istoriya_json.loads(${quote(JSON.stringify(scenes))})
    _istoriya_items = _istoriya_json.loads(${quote(JSON.stringify(items))})
    _istoriya_resource_paths = _istoriya_json.loads(${quote(JSON.stringify(Object.fromEntries(assetMap)))})
    _istoriya_flag_names = _istoriya_json.loads(${quote(JSON.stringify(flagNames))})
    _istoriya_conditions = {}
    _istoriya_explore_conditions = {}
${conditions.join('\n')}
${exploreConditions.join('\n')}
    def _istoriya_key(*parts):
        return _istoriya_json.dumps(parts, ensure_ascii=False, separators=(",", ":"))
    def _istoriya_prop_text(value):
        return str(value).replace("[", "[[").replace("{", "{{")
    def _istoriya_prop_visible(scene_id, layer_id):
        return _istoriya_key(scene_id, layer_id) not in istoriya_hidden_props
    def _istoriya_prop_source(scene_id, layer_id, fallback):
        return _istoriya_resource_paths.get(istoriya_prop_images.get(_istoriya_key(scene_id, layer_id)), fallback)
    def _istoriya_allowed(scene_id, layer_id, reaction_id):
        p = _istoriya_props.get(scene_id, {}).get(layer_id)
        if p:
            p = dict(p, **_istoriya_json.loads(_istoriya_motion_props.get(layer_id, "{}")))
        if not p or not p["visible"] or p["opacity"] == 0 or not _istoriya_prop_visible(scene_id, layer_id):
            return False
        r = next((r for r in p["interactions"] if r["id"] == reaction_id), None)
        if not r or (r.get("once") and _istoriya_key(scene_id, layer_id, reaction_id) in istoriya_used_interactions):
            return False
        if r.get("requiredItemId") == "":
            return False
        if r.get("requiredItemId") and istoriya_inventory.get(r["requiredItemId"], 0) < 1:
            return False
        inv = r.get("inventory") or {}
        if inv.get("operation") == "remove" and istoriya_inventory.get(inv.get("itemId"), 0) < max(1, int(inv.get("quantity") or 1)):
            return False
        return _istoriya_conditions[(scene_id, layer_id, reaction_id)]()
    def _istoriya_reactions(scene_id, layer_id):
        return [r for r in _istoriya_props.get(scene_id, {}).get(layer_id, {}).get("interactions", []) if _istoriya_allowed(scene_id, layer_id, r["id"])]
    def _istoriya_inventory_targets(scene_id, item_id):
        if not scene_id or item_id not in _istoriya_items or istoriya_inventory.get(item_id, 0) < 1 or renpy.showing("istoriya_cg", layer="istoriya_cg_layer"):
            return []
        return [(layer_id, r) for layer_id in _istoriya_props.get(scene_id, {}) for r in _istoriya_reactions(scene_id, layer_id) if r.get("requiredItemId") == item_id or ((r.get("inventory") or {}).get("operation") == "remove" and r["inventory"].get("itemId") == item_id)]
    def _istoriya_prop_display(scene_id, p):
        image = _istoriya_prop_source(scene_id, p["id"], p["source"])
        return Transform(image, xysize=(p["widthPx"], p["heightPx"]), fit="contain")
    def _istoriya_prop_transform(p):
        p = dict(p, **_istoriya_json.loads(_istoriya_motion_props.get(p["id"], "{}")))
        return Transform(xpos=float(p["x"])/100.0, ypos=float(p["y"])/100.0, xanchor=0.5, yanchor=1.0, zoom=float(p["scale"])/100.0, rotate=p["rotation"], alpha=float(p["opacity"])/100.0, xzoom=-1 if p.get("flip") else 1, blur=p.get("blur",0), rotate_pad=False, transform_anchor=True)
    def _istoriya_install_props(scene_id):
        if renpy.showing("istoriya_cg", layer="istoriya_cg_layer"):
            return
        order = renpy.get_zorder_list("master")
        for layer_id, p in _istoriya_props.get(scene_id, {}).items():
            if _istoriya_reactions(scene_id, layer_id):
                # show_screen cannot replace an image tag directly. Preserve the
                # original equal-z neighbours while replacing it with a screen.
                renpy.hide(p["tag"])
                renpy.show_screen("istoriya_prop_hotspot", scene_id, layer_id, _layer="master", _tag=p["tag"], _zorder=p["zOrder"])
        # Public change_zorder uses a stable sort. Re-establish original ranks,
        # then original zorders without ever exposing an intermediate frame.
        for i, (tag, z) in enumerate(order):
            renpy.change_zorder("master", tag, i)
        for tag, z in order:
            renpy.change_zorder("master", tag, z)
    def _istoriya_restore_props(scene_id):
        for layer_id, p in _istoriya_props.get(scene_id, {}).items():
            if p["visible"] and _istoriya_prop_visible(scene_id, layer_id):
                renpy.show(p["tag"], what=_istoriya_prop_display(scene_id, p), at_list=[_istoriya_prop_transform(p)], zorder=p["zOrder"])
            else:
                renpy.hide(p["tag"])
    def _istoriya_apply(scene_id, layer_id, reaction_id):
        p = _istoriya_props[scene_id][layer_id]
        r = next(r for r in p["interactions"] if r["id"] == reaction_id)
        inv = r.get("inventory") or {}
        if inv.get("itemId") and inv.get("operation") in ("add", "remove"):
            n = max(1, int(inv.get("quantity") or 1))
            istoriya_inventory[inv["itemId"]] = max(0, istoriya_inventory.get(inv["itemId"], 0) + (n if inv["operation"] == "add" else -n))
        istoriya_used_interactions.add(_istoriya_key(scene_id, layer_id, reaction_id))
        if r.get("hideAfter"):
            istoriya_hidden_props.add(_istoriya_key(scene_id, layer_id))
        if r.get("resultResourceId"):
            istoriya_prop_images[_istoriya_key(scene_id, layer_id)] = r["resultResourceId"]
        _istoriya_restore_props(scene_id)
    def _istoriya_explore_ready(item_id, flag_id, condition_key=""):
        return (not item_id or istoriya_inventory.get(item_id, 0) > 0) and (not flag_id or getattr(renpy.store, _istoriya_flag_names.get(flag_id, ""), False) is True) and (not condition_key or _istoriya_explore_conditions.get(condition_key, lambda: False)())

screen istoriya_prop_hotspot(scene_id, layer_id):
    $ p = _istoriya_props[scene_id][layer_id]
    imagebutton:
        id ("prop_" + layer_id)
        idle _istoriya_prop_display(scene_id, p)
        hover Transform(_istoriya_prop_display(scene_id, p), matrixcolor=BrightnessMatrix(0.1))
        at _istoriya_prop_transform(p)
        focus_mask True
        alt (p.get("name") or "Предмет")
        action Return(layer_id)

screen istoriya_explore(prompt, item_id, flag_id, condition_key=""):
    roll_forward False
    zorder 100
    frame:
        xalign 0.5
        yalign 0.03
        padding (24, 16)
        vbox:
            spacing 8
            text _istoriya_prop_text(prompt) xalign 0.5
            hbox:
                spacing 20
                textbutton "Инвентарь" action Show("istoriya_inventory_screen", scene_id=condition_key and _istoriya_json.loads(condition_key)[0])
                textbutton "Продолжить" action Return("__continue__") sensitive _istoriya_explore_ready(item_id, flag_id, condition_key)

screen istoriya_prop_verbs(scene_id, layer_id):
    roll_forward False
    modal True
    zorder 150
    frame:
        xalign 0.5
        yalign 0.5
        padding (24, 20)
        vbox:
            spacing 10
            text _istoriya_prop_text(_istoriya_props[scene_id][layer_id].get("name") or "Предмет")
            for r in _istoriya_reactions(scene_id, layer_id):
                textbutton _istoriya_prop_text(r["label"]) action Return(r["id"])
            textbutton "Назад" action Return(None)

screen istoriya_inventory_screen(scene_id=None):
    default selected_item = None
    modal True
    zorder 200
    add Solid("#000a")
    frame:
        xalign 0.5
        yalign 0.5
        xsize min(700, config.screen_width - 40)
        padding (30, 24)
        vbox:
            spacing 16
            text "Инвентарь" size 32
            viewport:
                ymaximum int(config.screen_height * 0.6)
                mousewheel True
                scrollbars "vertical"
                vbox:
                    spacing 12
                    if not any(n > 0 for n in istoriya_inventory.values()):
                        text "Пока ничего нет."
                    for item_id, n in istoriya_inventory.items():
                        if n > 0 and item_id in _istoriya_items:
                            vbox:
                                spacing 10
                                hbox:
                                    spacing 16
                                    if _istoriya_items[item_id].get("icon"):
                                        add _istoriya_items[item_id]["icon"] xysize (72, 72) fit "contain"
                                    vbox:
                                        text _istoriya_prop_text(_istoriya_items[item_id]["name"] + " × " + str(n)) id ("inventory_" + item_id)
                                        text _istoriya_prop_text(_istoriya_items[item_id].get("description", "")) size 20
                                        if scene_id:
                                            textbutton _istoriya_prop_text("Применить: " + _istoriya_items[item_id]["name"]) id ("inventory_use_" + item_id) action SetScreenVariable("selected_item", None if selected_item == item_id else item_id)
                                if selected_item == item_id and scene_id:
                                    $ targets = _istoriya_inventory_targets(scene_id, item_id)
                                    if not targets:
                                        text "Сейчас на сцене нет доступных действий с этим предметом." size 20
                                    for layer_id, r in targets:
                                        textbutton _istoriya_prop_text((_istoriya_props[scene_id][layer_id].get("name") or "Предмет") + " — " + r["label"]) id ("inventory_target_" + layer_id + "_" + r["id"]) action [Hide("istoriya_inventory_screen"), Return((layer_id, r["id"]))]
            textbutton "Закрыть" action Hide("istoriya_inventory_screen")
    key "game_menu" action Hide("istoriya_inventory_screen")

${labels.join('\n')}`;
}
