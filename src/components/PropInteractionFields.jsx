import {Plus,Trash,CursorClick} from '@phosphor-icons/react';
import {useState} from 'react';
import {useProjectStore} from '../store/projectStore.js';
import {AudioResourceField} from './AudioResourceField.jsx';
import {ConditionEditor,EffectsEditor} from './RuleFields.jsx';
import {ReactionPicker} from './ReactionPicker.jsx';
import {SceneInteractionList} from './SceneInteractionList.jsx';
import {StoryDestinationField} from './StoryDestinationField.jsx';
import {destinationValue,destinationPatch} from '../domain/storyDestinations.js';
import {captureReactionTarget,reactionMode,reactionModePatch,reactionConsumptionPatch,reactionRequiredItemPatch,reactionItemStatus} from '../domain/reactionAuthoring.js';
import './prop-interactions.css';

export function PropInteractionFields({scene,layer}) {
 const {project,activeActionId,updatePropReaction,removePropReaction,addAction,setActiveAction,updateItem}=useProjectStore();
 const [creation,setCreation]=useState(null);
 const items=project.items??[],explore=scene.actions.find(a=>a.id===activeActionId&&a.type==='explore')??scene.actions.find(a=>a.type==='explore');
 const images=project.resources.filter(r=>r.mime?.startsWith('image/')||['prop','background','sprite','cg'].includes(r.category));
 const change=(id,patch)=>updatePropReaction(scene.id,layer.id,id,patch);
 return <section className="prop-interaction-fields"><h3>Взаимодействия</h3>
  <p>Что произойдёт, когда игрок нажмёт на этот предмет.</p>
  {(layer.interactions??[]).map((reaction,reactionIndex)=>{
   const target={kind:'reaction',sceneId:scene.id,layerId:layer.id,reactionId:reaction.id},patch=value=>change(reaction.id,value),item=items.find(i=>i.id===reaction.inventory?.itemId);
   const itemProblem=reactionItemStatus(reaction,items).problem;
   const missingItemOption=id=>id&&!items.some(i=>i.id===id)?<option value={id} disabled>Удалённый предмет · выберите замену</option>:null;
   return <details key={reaction.id??reactionIndex} className="prop-reaction" data-editor-location={JSON.stringify(['reaction',reaction.id??`index:${reactionIndex}`])} open><summary>{reaction.label||'Новая реакция'}</summary>
    <label className="field"><span>Название действия</span><input value={reaction.label??''} onChange={e=>patch({label:e.target.value})}/></label>
    <label className="field"><span>Результат</span><select value={reactionMode(reaction)} onChange={e=>{
      const mode=e.target.value,name={inspect:'Осмотреть',take:'Взять',use:'Использовать',hide:'Убрать'}[mode];
      patch({...reactionModePatch(reaction,mode,{itemId:mode==='take'?layer.itemId??reaction.inventory?.itemId:null,consume:reaction.inventory?.operation==='remove'}),...(['Осмотреть','Взять','Использовать','Убрать'].includes(reaction.label)?{label:name}:{})});
    }}><option value="inspect">Осмотреть / ответить</option><option value="take">Взять в инвентарь</option><option value="use">Применить предмет инвентаря</option><option value="hide">Убрать со сцены</option></select></label>
    {reactionMode(reaction)==='use'&&<><label className="prop-checkbox"><input type="checkbox" checked={reaction.inventory?.operation==='remove'} onChange={e=>patch(reactionConsumptionPatch(reaction,e.target.checked))}/>Расходовать предмет при применении</label>{!reaction.inventory&&<label className="field"><span>Какой предмет нужен</span><select aria-invalid={itemProblem?true:undefined} value={reaction.requiredItemId??''} onChange={e=>patch(reactionRequiredItemPatch(reaction,e.target.value))}><option value="">Выберите предмет</option>{missingItemOption(reaction.requiredItemId)}{items.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}</select><small>Предмет останется в инвентаре. Дополнительные требования — в условиях ниже.</small></label>}</>}
    {reaction.inventory&&<>
      <label className="field"><span>Предмет инвентаря</span><select aria-invalid={itemProblem?true:undefined} value={reaction.inventory.itemId??''} onChange={e=>patch({inventory:{...reaction.inventory,itemId:e.target.value||null}})}><option value="">Выберите предмет</option>{missingItemOption(reaction.inventory.itemId)}{items.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}</select></label>
      <label className="field"><span>Количество</span><input type="number" min="1" step="1" value={reaction.inventory.quantity??1} onChange={e=>patch({inventory:{...reaction.inventory,quantity:Math.max(1,Math.floor(Number(e.target.value)||1))}})}/></label>
      {item&&<details className="prop-advanced"><summary>Название и описание в инвентаре</summary><label className="field"><span>Название предмета</span><input value={item.name} onChange={e=>updateItem(item.id,{name:e.target.value})}/></label><label className="field"><span>Описание предмета</span><textarea value={item.description??''} onChange={e=>updateItem(item.id,{description:e.target.value})}/></label><label className="field"><span>Иконка в инвентаре</span><select value={item.iconResourceId??''} onChange={e=>updateItem(item.id,{iconResourceId:e.target.value||null})}><option value="">Без иконки</option>{images.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label></details>}
    </>}
    {itemProblem&&<p className="prop-item-problem" role="alert">{itemProblem}</p>}
    <label className="field"><span>Ответ при нажатии</span><textarea rows="3" value={reaction.text??''} placeholder="Текст можно не добавлять" onChange={e=>patch({text:e.target.value})}/></label>
    <label className="field"><span>Кто говорит</span><select value={reaction.speakerId??''} onChange={e=>patch({speakerId:e.target.value||null})}><option value="">Автор</option>{project.characters.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    <AudioResourceField label="Звук предмета" value={reaction.soundAssetId} target={target} field="soundAssetId" volume={reaction.soundVolume} onVolumeChange={soundVolume=>patch({soundVolume})}/>
    <AudioResourceField label="Озвучка ответа" value={reaction.voiceAssetId} target={target} field="voiceAssetId" category="voice" volume={reaction.voiceVolume} onVolumeChange={voiceVolume=>patch({voiceVolume})}/>
    {reaction.voiceAssetId&&!reaction.text&&<small>Ответ без текста: игрок слушает запись и нажимает для продолжения.</small>}
    <details className="prop-advanced"><summary>Изменение предмета и условия</summary>
      <label className="field"><span>Изображение после нажатия</span><select value={reaction.resultResourceId??''} onChange={e=>patch({resultResourceId:e.target.value||null})}><option value="">Не менять</option>{images.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
      <StoryDestinationField project={project} label="Перейти к сцене после ответа" value={destinationValue(reaction)} onChange={value=>patch(destinationPatch(value))} emptyLabel="Остаться в текущей сцене"/>
      {(reactionMode(reaction)!=='use'||reaction.inventory)&&<label className="field"><span>{reaction.inventory?'Дополнительно нужен предмет':'Нужен предмет для этого действия'}</span><select value={reaction.requiredItemId??''} onChange={e=>patch(reactionRequiredItemPatch(reaction,e.target.value))}><option value="">Не требуется</option>{missingItemOption(reaction.requiredItemId)}{items.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}</select></label>}
      <ConditionEditor project={project} label="Условия доступности" value={reaction.condition} onChange={condition=>patch({condition})}/>
      <EffectsEditor project={project} value={reaction.effects??[]} onChange={effects=>patch({effects})}/>
      <label className="prop-checkbox"><input type="checkbox" checked={!!reaction.once} onChange={e=>patch({once:e.target.checked})}/>Только один раз за игру</label>
      <label className="prop-checkbox"><input type="checkbox" checked={!!reaction.hideAfter} onChange={e=>patch({hideAfter:e.target.checked})}/>Скрыть предмет после действия</label>
    </details>
    <button className="prop-remove-reaction" aria-label={`Удалить реакцию: ${reaction.label}`} onClick={()=>removePropReaction(scene.id,layer.id,reaction.id)}><Trash/>Удалить реакцию</button>
   </details>;
  })}
  <button className="button secondary wide" onClick={()=>setCreation(captureReactionTarget(project,scene.id,layer.id,activeActionId))}><Plus/>Добавить реакцию</button>
  <button className="button secondary wide prop-explore-link" disabled={scene.timelineEnabled} onClick={()=>explore?setActiveAction(explore.id):addAction('explore',{afterId:activeActionId})}><CursorClick/>{explore?'Перейти к шагу осмотра':'Добавить осмотр сцены'}</button>
  <small>{scene.timelineEnabled?'Осмотр работает в последовательных кадрах. Исходный монтаж можно сохранить при явном переводе сцены в кадры.':'Игрок взаимодействует с предметами во время шага «Осмотреть сцену».'}</small>
  {creation&&creation.projectId===project.id&&creation.layerId===layer.id&&creation.sceneId===scene.id&&<ReactionPicker key={`${creation.projectId}:${creation.sceneId}:${creation.layerId}`} target={creation} layerName={layer.name||'Предмет'} onClose={()=>setCreation(null)}/>}
 </section>;
}

export function ExplorationFields({action,scene}) {
 const {project,updateAction}=useProjectStore(),patch=value=>updateAction(scene.id,action.id,value);
 return <><label className="field"><span>Подсказка игроку</span><textarea rows="3" value={action.prompt??''} onChange={e=>patch({prompt:e.target.value})}/></label>
  <SceneInteractionList key={`${project.id}:${scene.id}:${action.id}`} scene={scene} action={action}/>
  <details className="prop-advanced"><summary>Когда можно продолжить историю</summary>
  <label className="field"><span>Для продолжения нужен предмет</span><select value={action.requiredItemId??''} onChange={e=>patch({requiredItemId:e.target.value||null})}><option value="">Можно продолжить сразу</option>{(project.items??[]).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
  <label className="field"><span>Для продолжения нужен включённый флаг</span><select value={action.requiredFlagId??''} onChange={e=>patch({requiredFlagId:e.target.value||null})}><option value="">Не требуется</option>{project.flags.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
  <details className="prop-advanced"><summary>Дополнительные условия продолжения</summary><ConditionEditor project={project} value={action.condition} onChange={condition=>patch({condition})}/><p className="inspector-hint">Все выбранные требования должны выполняться одновременно.</p></details>
  </details>
 </>;
}
