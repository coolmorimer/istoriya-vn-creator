import {rpgConfig,initialRpg,rpgProblems} from './rpg-model.mjs';
import {conditionProblems} from './game-logic.mjs';
export function rpgScript(project,{quote,asciiId,conditionExpression}){
 const r=rpgConfig(project);if(!r.enabled)return '';
 const errors=rpgProblems(project);for(const l of r.locations)errors.push(...conditionProblems(l.condition,project));if(errors.length)throw Error(errors.join(' '));
 const destinations=Object.fromEntries(Object.keys(project.scenes).map(id=>[id,asciiId(id,'scene')]));
 const conditions=r.locations.map(l=>`    _istoriya_rpg_locations[${quote(l.id)}] = lambda: ${conditionExpression(l.condition,project).replace(/^ if /,'')||'True'}`).join('\n');
 return `
init -1 python:
    import json as _rpg_json
    import copy as _rpg_copy
    _istoriya_rpg_config = _rpg_json.loads(${quote(JSON.stringify(r))})
    _istoriya_rpg_items = _rpg_json.loads(${quote(JSON.stringify(Object.fromEntries((project.items??[]).map(i=>[i.id,i.name]))))})
    _istoriya_rpg_destinations = _rpg_json.loads(${quote(JSON.stringify(destinations))})
    _istoriya_rpg_speakers = _rpg_json.loads(${quote(JSON.stringify(Object.fromEntries((project.characters??[]).map(c=>[c.id,asciiId(c.id,'character')]))))})
    _istoriya_rpg_locations = {}
    def _istoriya_rpg_text(value):
        return str(value).replace('{', '{{')
    def _istoriya_rpg_initial():
        return _rpg_json.loads(${quote(JSON.stringify(initialRpg(project)))})
    def _istoriya_rpg_stat(key):
        if key == 'level': return 1 + store.istoriya_rpg['xp'] // int(_istoriya_rpg_config['xpPerLevel'])
        if key.startswith('skill:'): return store.istoriya_rpg['skills'].get(key[6:], 0)
        return store.istoriya_rpg.get(key, 0)
    def _istoriya_rpg_change(key, op, amount):
        amount = int(amount)
        limits = {'health': int(_istoriya_rpg_config['maxHealth']), 'xp': 1000000000}
        limits.update({'skill:' + s['id']: int(s['max']) for s in _istoriya_rpg_config['skills']})
        if key not in limits or op not in ('set', 'add', 'subtract') or not 0 <= amount <= 1000000000: return False
        state = _rpg_copy.deepcopy(store.istoriya_rpg)
        old = _istoriya_rpg_stat(key)
        value = max(0, min(limits[key], old + amount if op == 'add' else old - amount if op == 'subtract' else amount))
        if key.startswith('skill:'): state['skills'][key[6:]] = value
        else: state[key] = value
        store.istoriya_rpg = state
        return True
    def _istoriya_rpg_craft_reason(key):
        recipe = next((c for c in _istoriya_rpg_config['recipes'] if c['id'] == key), None)
        if not recipe: return 'Рецепт недоступен.'
        if recipe.get('skillId') and store.istoriya_rpg['skills'].get(recipe['skillId'], 0) < int(recipe.get('requiredLevel', 0)): return 'Недостаточный уровень навыка.'
        missing = [str(_istoriya_rpg_items.get(i['itemId'], 'Предмет')) + ' × ' + str(int(i['quantity']) - store.istoriya_inventory.get(i['itemId'], 0)) for i in recipe['ingredients'] if store.istoriya_inventory.get(i['itemId'], 0) < int(i['quantity'])]
        return 'Не хватает: ' + ', '.join(missing) if missing else ''
    def _istoriya_rpg_craft(key):
        reason = _istoriya_rpg_craft_reason(key)
        state = _rpg_copy.deepcopy(store.istoriya_rpg)
        if reason:
            state['message'] = reason
            store.istoriya_rpg = state
            return False
        recipe = next(c for c in _istoriya_rpg_config['recipes'] if c['id'] == key)
        inventory = dict(store.istoriya_inventory)
        for item in recipe['ingredients']: inventory[item['itemId']] -= int(item['quantity'])
        for item in recipe['results']:
            total = inventory.get(item['itemId'], 0) + int(item['quantity'])
            if total > 1000000000:
                state['message'] = 'Слишком много предметов.'
                store.istoriya_rpg = state
                return False
            inventory[item['itemId']] = total
        state['message'] = 'Создано: ' + recipe['name']
        store.istoriya_inventory = inventory
        store.istoriya_rpg = state
        return True
    def _istoriya_rpg_begin(key):
        actor = next((a for a in _istoriya_rpg_config['actors'] if a['id'] == key), None)
        if not actor: return False
        state = _rpg_copy.deepcopy(store.istoriya_rpg)
        state['battle'] = None
        state['message'] = ''
        if actor['role'] == 'enemy':
            if state['health'] <= 0: state['message'] = 'Нет здоровья для боя.'
            elif key in state['defeated']: state['message'] = 'Этот противник уже побеждён.'
            else: state['battle'] = {'actorId': key, 'health': int(actor['health'])}
        store.istoriya_rpg = state
        return bool(state['battle']) or actor['role'] == 'npc'
    def _istoriya_rpg_turn(skill_id=''):
        state = _rpg_copy.deepcopy(store.istoriya_rpg)
        battle = state.get('battle')
        actor = next((a for a in _istoriya_rpg_config['actors'] if a['id'] == (battle or {}).get('actorId')), None)
        if not actor or state['health'] <= 0: return None
        skill = next((s for s in _istoriya_rpg_config['skills'] if s['id'] == skill_id), None)
        if skill_id and (not skill or state['skills'].get(skill_id, 0) < 1): return None
        damage = int(_istoriya_rpg_config['attack']) + (int(skill['power']) * state['skills'].get(skill_id, 0) if skill else 0)
        battle['health'] = max(0, battle['health'] - damage)
        state['message'] = actor['name'] + ': −' + str(damage) + ' здоровья.'
        destination = None
        if battle['health'] == 0:
            if actor['id'] not in state['defeated']:
                state['defeated'].append(actor['id'])
                state['xp'] = min(1000000000, state['xp'] + int(actor['xp']))
                inventory = dict(store.istoriya_inventory)
                for item in actor.get('loot', []): inventory[item['itemId']] = min(1000000000, inventory.get(item['itemId'], 0) + int(item['quantity']))
                store.istoriya_inventory = inventory
            state['battle'] = None
            state['message'] = 'Победа: ' + actor['name'] + '. Опыт +' + str(actor['xp']) + '.'
            destination = actor.get('winSceneId')
        else:
            state['health'] = max(0, state['health'] - int(actor['attack']))
            if state['health'] == 0:
                state['battle'] = None
                state['message'] = 'Поражение. Здоровье закончилось.'
                destination = actor.get('loseSceneId') or '__game_over__'
        store.istoriya_rpg = state
        return _istoriya_rpg_destinations.get(destination) if destination != '__game_over__' else 'istoriya_rpg_game_over'
    def _istoriya_rpg_travel(key):
        location = next((l for l in _istoriya_rpg_config['locations'] if l['id'] == key), None)
        if location and _istoriya_rpg_locations.get(key, lambda: False)(): return _istoriya_rpg_destinations.get(location['sceneId'])
        return None
    def _istoriya_rpg_retreat():
        state = _rpg_copy.deepcopy(store.istoriya_rpg)
        state['battle'] = None
        store.istoriya_rpg = state

default istoriya_rpg = _istoriya_rpg_initial()
init python:
${conditions||'    pass'}

screen istoriya_rpg_hud():
    zorder 25
    frame:
        xalign 0.01
        yalign 0.01
        background '#15151ee6'
        padding (16, 10)
        vbox:
            text ("Здоровье: %s / %s" % (istoriya_rpg['health'], _istoriya_rpg_config['maxHealth'])) size 22
            text ("Уровень: %s · Опыт: %s" % (_istoriya_rpg_stat('level'), istoriya_rpg['xp'])) size 20

screen istoriya_rpg_panel(mode='menu', actor_id=''):
    modal True
    zorder 200
    $ actor = next((a for a in _istoriya_rpg_config['actors'] if a['id'] == actor_id), None)
    frame:
        xalign 0.5
        yalign 0.5
        xsize int(config.screen_width * 0.88)
        ysize int(config.screen_height * 0.88)
        background '#15151ef5'
        padding (28, 22)
        vbox:
            spacing 14
            text 'Игровой мир' size 32
            if mode != 'actor':
                hbox:
                    spacing 24
                    textbutton 'Персонаж' action Return(('tab', 'menu'))
                    textbutton 'Крафт' action Return(('tab', 'craft'))
                    textbutton 'Карта' action Return(('tab', 'map'))
            text _istoriya_rpg_text(istoriya_rpg['message']) substitute False size 22
            viewport:
                yfill True
                mousewheel True
                scrollbars 'vertical'
                vbox:
                    spacing 14
                    if mode == 'menu':
                        text ('Здоровье: %s / %s' % (istoriya_rpg['health'], _istoriya_rpg_config['maxHealth'])) size 26
                        text ('Уровень: %s · Опыт: %s' % (_istoriya_rpg_stat('level'), istoriya_rpg['xp'])) size 24
                        for skill in _istoriya_rpg_config['skills']:
                            text _istoriya_rpg_text('%s: %s / %s' % (skill['name'], istoriya_rpg['skills'].get(skill['id'], 0), skill['max'])) substitute False size 22
                        text 'Инвентарь' size 26
                        for item_id, quantity in istoriya_inventory.items():
                            if quantity > 0:
                                text _istoriya_rpg_text('%s × %s' % (_istoriya_rpg_items.get(item_id, item_id), quantity)) substitute False size 22
                    elif mode == 'craft':
                        if not _istoriya_rpg_config['recipes']:
                            text 'Рецепты пока не добавлены.' size 22
                        for recipe in _istoriya_rpg_config['recipes']:
                            text _istoriya_rpg_text(recipe['name']) substitute False size 26
                            text _istoriya_rpg_text(' + '.join('%s × %s' % (_istoriya_rpg_items.get(i['itemId'], i['itemId']), i['quantity']) for i in recipe['ingredients'])) substitute False size 20
                            text _istoriya_rpg_text('→ ' + ', '.join('%s × %s' % (_istoriya_rpg_items.get(i['itemId'], i['itemId']), i['quantity']) for i in recipe['results'])) substitute False size 20
                            text _istoriya_rpg_text(_istoriya_rpg_craft_reason(recipe['id'])) substitute False size 20
                            textbutton _istoriya_rpg_text('Создать: ' + recipe['name']) substitute False sensitive (not _istoriya_rpg_craft_reason(recipe['id'])) action Return(('craft', recipe['id']))
                    elif mode == 'map':
                        fixed:
                            xfill True
                            ysize int(config.screen_height * 0.48)
                            for location in _istoriya_rpg_config['locations']:
                                textbutton _istoriya_rpg_text(location['name']) substitute False xpos (float(location['x']) / 100.0) ypos (float(location['y']) / 100.0) xanchor 0.5 yanchor 0.5 sensitive _istoriya_rpg_locations.get(location['id'], lambda: False)() action Return(('travel', location['id']))
                    elif actor:
                        text _istoriya_rpg_text(actor['name']) substitute False size 28
                        if actor['role'] == 'npc':
                            textbutton 'Поговорить' action Return(('talk', actor['id']))
                        elif istoriya_rpg['battle']:
                            text ('Здоровье противника: %s' % istoriya_rpg['battle']['health']) size 24
                            textbutton 'Атаковать' action Return(('attack', ''))
                            for skill in _istoriya_rpg_config['skills']:
                                textbutton _istoriya_rpg_text('Навык: ' + skill['name']) substitute False sensitive (istoriya_rpg['skills'].get(skill['id'], 0) > 0) action Return(('attack', skill['id']))
            textbutton ('Отступить' if istoriya_rpg['battle'] else 'Продолжить') action Return(('close', ''))

label istoriya_rpg_open(mode='menu', actor_id=''):
    if mode == 'actor':
        $ _istoriya_rpg_begin(actor_id)
    while True:
        call screen istoriya_rpg_panel(mode, actor_id)
        $ _rpg_command, _rpg_id = _return
        if _rpg_command == 'close':
            $ _istoriya_rpg_retreat()
            return
        elif _rpg_command == 'tab':
            $ mode = _rpg_id
        elif _rpg_command == 'craft':
            $ _istoriya_rpg_craft(_rpg_id)
        elif _rpg_command == 'travel':
            $ _rpg_destination = _istoriya_rpg_travel(_rpg_id)
            if _rpg_destination:
                jump expression _rpg_destination
        elif _rpg_command == 'attack':
            $ _rpg_destination = _istoriya_rpg_turn(_rpg_id)
            if _rpg_destination:
                jump expression _rpg_destination
        elif _rpg_command == 'talk':
            $ _rpg_actor = next(a for a in _istoriya_rpg_config['actors'] if a['id'] == actor_id)
            $ renpy.say(getattr(store, _istoriya_rpg_speakers.get(_rpg_actor.get('characterId'), ''), None), _istoriya_prop_text(_rpg_actor['text']))
            if _rpg_actor.get('talkSceneId'):
                jump expression _istoriya_rpg_destinations[_rpg_actor['talkSceneId']]

label istoriya_rpg_game_over:
    'Вы потерпели поражение.'
    $ renpy.full_restart()
`;
}
