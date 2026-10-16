import {exitObject} from '../domain/storyGraph.js';
import {ConditionEditor,EffectsEditor} from './RuleFields.jsx';

// The map edits the same option/reaction/action as the storyboard inspector.
export function MapExitRules({project,edge,onChange}) {
 const object=exitObject(project,edge);
 if(!object||!['choice','condition','prop'].includes(edge.kind))return null;
 const action=project.scenes[edge.from].actions.find(a=>a.id===edge.actionId);
 return <div className="graph-exit-rules">
  {edge.kind==='choice'&&<label>Вопрос игроку<textarea rows={2} value={action.prompt??''} onChange={e=>onChange({prompt:e.target.value})}/></label>}
  {edge.kind==='prop'&&<p>Действие предмета «{edge.layerName}». Удаление связи уберёт только переход, но сохранит саму реакцию.</p>}
  {edge.kind==='condition'?<><p>{edge.field==='falseSceneId'?'Эта ветка выполняется, если условие не выполнено.':'Эта ветка выполняется, если условие выполнено.'} Обе ветки используют одно правило.</p><ConditionEditor project={project} value={object.condition??object} label="Правило ветвления" onChange={condition=>onChange({condition})}/></>:<details className="graph-rule-disclosure"><summary>Условия и результаты · {(object.effects??[]).length}</summary><ConditionEditor project={project} value={object.condition} label="Условия доступности" onChange={condition=>onChange({condition})}/><EffectsEditor project={project} value={object.effects??[]} onChange={effects=>onChange({effects})}/></details>}
 </div>;
}
