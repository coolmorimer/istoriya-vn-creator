// Structural checks only: broken authoring links belong in the project validator.
import {assertGameUiShape} from './game-ui.mjs';
import {motionProblems} from './keyframes.mjs';
export function assertProjectShape(project) {
  const object = (value, label) => { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Некорректный проект: ${label}.`); };
  const list = (value, label) => { if (value != null && (!Array.isArray(value) || value.some(item => !item || typeof item !== 'object' || Array.isArray(item)))) throw new Error(`Некорректный список: ${label}.`); };
  object(project, 'ожидался объект'); object(project.scenes, 'отсутствует таблица сцен');
  const text = (value, label) => { if(value != null && typeof value !== 'string') throw new Error(`Некорректный текст: ${label}.`); };
  const conditionShape=root=>{let count=0;const seen=new Set();const visit=(value,depth)=>{if(value==null)return;object(value,'условие');if(depth>8||++count>128||seen.has(value))throw Error('Слишком сложное или циклическое условие.');seen.add(value);if(value.conditions!=null){list(value.conditions,'условия группы');for(const child of value.conditions)visit(child,depth+1);}seen.delete(value);};visit(root,0);};
  if (Number(project.schemaVersion) > 8) throw new Error('Проект создан более новой версией редактора. Обновите «Историю».');
  if(project.rpg!=null){object(project.rpg,'игровые системы');if(Number(project.schemaVersion)<8)throw Error('Игровые системы требуют формат проекта 8.');for(const key of ['skills','recipes','locations','actors']){list(project.rpg[key],key);if(project.rpg[key]?.length>500)throw Error('В игровом списке больше 500 записей.');}}
  assertGameUiShape(project.ui?.layout);
  if(project.ui?.layout?.version===2&&Number(project.schemaVersion)<6)throw Error('Расширенная компоновка интерфейса требует формат проекта 6.');
  if (project.meta != null) object(project.meta, 'настройки');
  text(project.meta?.title, 'название проекта');
  for (const key of ['characters','resources','chapters','variables','flags','items']) list(project[key], key);
  const unique=(values,label)=>{const ids=new Set();for(const value of values??[]){if(typeof value.id!=='string'||!value.id||['__proto__','constructor','prototype'].includes(value.id)||ids.has(value.id))throw Error(`Некорректный или повторный идентификатор: ${label}.`);ids.add(value.id);}};
  unique(project.items,'предмет инвентаря');
  for(const item of project.items??[]){text(item.name,'название предмета инвентаря');text(item.description,'описание предмета инвентаря');}
  for (const [id, scene] of Object.entries(project.scenes)) {
    object(scene, `сцена ${id}`);
    text(scene.title, 'название сцены');
    if (['__proto__','constructor','prototype'].includes(id) || (scene.id && scene.id !== id)) throw new Error('Некорректный идентификатор сцены.');
    list(scene.characters, 'слои сцены'); list(scene.images,'предметные слои'); list(scene.actions, 'действия');
    if(scene.images?.some(l=>l.interactions?.length))unique(scene.images,'предметный слой');
    for(const layer of scene.images??[]){list(layer.interactions,'реакции предмета');unique(layer.interactions,'реакция предмета');if(layer.interactions?.length&&(!layer.id||typeof layer.id!=='string'))throw Error('У интерактивного предмета нет идентификатора.');for(const reaction of layer.interactions??[]){text(reaction.label,'название реакции');text(reaction.text,'ответ предмета');list(reaction.effects,'результаты реакции');conditionShape(reaction.condition);}}
    for (const action of scene.actions ?? []) {
      if (typeof action.type !== 'string') throw new Error('У действия не задан тип.');
      if(action.type==='rpg'&&Number(project.schemaVersion)<8)throw Error('Игровое действие требует формат проекта 8.');
      if(action.type==='keyframes'){if(Number(project.schemaVersion)<7)throw Error('Ключевые кадры требуют формат проекта 7.');const problems=motionProblems(action,scene,project);if(problems.length)throw Error(problems.join(' '));}
      text(action.text, 'реплика'); text(action.prompt, 'вопрос');
      conditionShape(action.condition);
      list(action.options, 'варианты выбора');
      for (const option of action.options ?? []) {list(option.effects, 'результаты выбора');conditionShape(option.condition);}
    }
  }
  for (const c of project.characters ?? []) { text(c.name, 'имя персонажа'); list(c.sprites, 'спрайты'); }
  for (const c of project.chapters ?? []) if (c.scenes != null && (!Array.isArray(c.scenes) || c.scenes.some(id => typeof id !== 'string'))) throw new Error('Некорректный список сцен главы.');
  list(project.gallery?.sections, 'разделы галереи');
  for (const section of project.gallery?.sections ?? []) list(section.items, 'иллюстрации галереи');
  return project;
}
