import {useState} from 'react';
import {Plus,Trash} from '@phosphor-icons/react';
import {conditionProblems,effectProblems,effectKind} from '../../runtime/game-logic.mjs';
import './rule-fields.css';
const numeric=type=>['number','relationship'].includes(type);
const valueFor=type=>numeric(type)?0:type==='boolean'?false:'';
const refs=project=>[...(project.flags??[]).map(v=>({...v,kind:'flag',type:'boolean'})),...(project.variables??[]).map(v=>({...v,kind:'variable'})),...(project.items??[]).map(v=>({...v,kind:'item',type:'number'}))];
function clauseFor(ref){return ref?{[{flag:'flagId',variable:'variableId',item:'itemId'}[ref.kind]]:ref.id,operator:ref.kind==='item'?'gte':'eq',value:ref.kind==='item'?1:valueFor(ref.type)}:null;}
function conditionSummary(value,project){
 if(!value)return 'Не задано';
 if(value.kind==='all'||value.kind==='any')return `${value.negate?'Не: ':''}${value.kind==='all'?'Все':'Любое'} из ${value.conditions?.length??0} условий`;
 const reference=refs(project).find(r=>r.kind===(value.flagId?'flag':value.itemId?'item':'variable')&&r.id===(value.flagId??value.itemId??value.variableId));
 const comparison={eq:'равно',neq:'не равно',gt:'больше',gte:'не меньше',lt:'меньше',lte:'не больше',contains:'содержит'}[value.operator??(value.itemId?'gte':'eq')];
 const display=reference?.type==='boolean'?(value.value===true||value.value==='true'?'да':'нет'):String(value.value??'');
 return `${value.negate?'Не: ':''}${reference?.name??'Выберите значение'} ${comparison??'—'} ${display}`;
}
function ValueField({label,type,value,onChange}){return <label className="field"><span>{label}</span>{type==='boolean'?<select value={String(value??false)} onChange={e=>onChange(e.target.value==='true')}><option value="true">Да / включён</option><option value="false">Нет / выключен</option></select>:<input type={numeric(type)?'number':'text'} value={value??''} onChange={e=>onChange(e.target.value)}/>}</label>;}
export function VariableActionFields({project,action,onChange}){
 const variable=project.variables.find(v=>v.id===action.variableId);
 return <><label className="field"><span>Переменная</span><select value={action.variableId??''} onChange={e=>{const next=project.variables.find(v=>v.id===e.target.value);onChange({variableId:e.target.value,operation:'set',value:valueFor(next?.type)});}}><option value="">Выберите переменную</option>{project.variables.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select></label><label className="field"><span>Операция</span><select value={action.operation??'set'} onChange={e=>onChange({operation:e.target.value})}><option value="set">Установить</option>{numeric(variable?.type)&&<><option value="add">Прибавить</option><option value="subtract">Вычесть</option></>}</select></label><ValueField label="Значение" type={variable?.type??'text'} value={action.value} onChange={value=>onChange({value})}/></>;
}
export function ConditionEditor({project,value,onChange,label='Условия',depth=0}){
 const [expanded,setExpanded]=useState(null);
 const references=refs(project),first=clauseFor(references[0]),group=value?.kind==='all'||value?.kind==='any';
 const kind=value?.flagId?'flag':value?.itemId?'item':'variable',id=value?.flagId??value?.itemId??value?.variableId,reference=references.find(r=>r.kind===kind&&r.id===id);
 const problems=depth===0?conditionProblems(value,project):[];
 const add=()=>{setExpanded(group?value.conditions.length:value?1:null);onChange(value?group?{...value,conditions:[...value.conditions,first]}:{kind:'all',conditions:[value,first]}:first);};
 return <fieldset className="rule-editor condition-editor" aria-label={label}><legend>{label}</legend>
  {!value?<p className="rule-empty">Без ограничений.</p>:group?<>
   <label className="field"><span>Правило группы</span><select value={value.kind} onChange={e=>onChange({...value,kind:e.target.value})}><option value="all">Выполнены все условия</option><option value="any">Выполнено хотя бы одно</option></select></label>
   <label className="rule-checkbox"><input type="checkbox" checked={!!value.negate} onChange={e=>onChange({...value,negate:e.target.checked})}/>Обратить результат группы</label>
   {(value.conditions??[]).map((child,index)=><details className="rule-clause" key={index} open={expanded===index}><summary onClick={event=>{event.preventDefault();setExpanded(previous=>previous===index?null:index);}}>{conditionSummary(child,project)}</summary><ConditionEditor project={project} value={child} label={`Условие ${index+1}`} depth={depth+1} onChange={next=>{if(!next)setExpanded(null);onChange({...value,conditions:next?value.conditions.map((c,i)=>i===index?next:c):value.conditions.filter((_,i)=>i!==index)});}}/></details>)}
  </>:<>
   <label className="field"><span>Что проверить</span><select value={`${kind}:${id??''}`} onChange={e=>{const colon=e.target.value.indexOf(':'),r=references.find(r=>r.kind===e.target.value.slice(0,colon)&&r.id===e.target.value.slice(colon+1));onChange({...clauseFor(r),negate:!!value.negate});}}>{!reference&&<option value={`${kind}:${id??''}`}>Выберите существующее значение</option>}{[['flag','Флаги'],['variable','Переменные'],['item','Инвентарь']].map(([k,name])=><optgroup key={k} label={name}>{references.filter(r=>r.kind===k).map(r=><option key={r.id} value={`${r.kind}:${r.id}`}>{r.name}</option>)}</optgroup>)}</select></label>
   <label className="field"><span>Сравнение</span><select value={value.operator??(kind==='item'?'gte':'eq')} onChange={e=>onChange({...value,operator:e.target.value})}>{[['eq','Равно'],['neq','Не равно'],...(numeric(reference?.type)?[['gt','Больше'],['gte','Не меньше'],['lt','Меньше'],['lte','Не больше']]:reference?.type==='text'?[['contains','Содержит текст']]:[])].map(([op,name])=><option value={op} key={op}>{name}</option>)}</select></label>
   <ValueField label={kind==='item'?'Количество предмета':'Значение условия'} type={reference?.type??'text'} value={value.value} onChange={next=>onChange({...value,value:next})}/>
   <label className="rule-checkbox"><input type="checkbox" checked={!!value.negate} onChange={e=>onChange({...value,negate:e.target.checked})}/>Обратить это условие</label>
  </>}
  {problems.length>0&&<p className="rule-error" role="alert">{problems.join(' ')}</p>}
  {!references.length&&<p className="rule-empty">Создайте переменную, флаг или предмет в разделе «Сюжет».</p>}
  <div className="rule-actions"><button type="button" disabled={!first||depth>=8} onClick={add}><Plus/>{value?'Добавить условие':'Задать условие'}</button>{value&&<button type="button" className="rule-remove" aria-label={`Удалить: ${label}`} onClick={()=>onChange(null)}><Trash/>Удалить</button>}</div>
 </fieldset>;
}
export function EffectsEditor({project,value=[],onChange,label='Результаты'}){
 const [expanded,setExpanded]=useState(null);
 const flags=project.flags??[],variables=project.variables??[],items=project.items??[];
 const make=kind=>kind==='flag'?{kind,flagId:flags[0]?.id??'',value:true}:kind==='inventory'?{kind,itemId:items[0]?.id??'',operation:'add',quantity:1}:{kind:'variable',variableId:variables[0]?.id??'',operation:'set',value:valueFor(variables[0]?.type)};
 const update=(index,patch)=>onChange(value.map((effect,i)=>i===index?{...effect,...patch}:effect));
 return <fieldset className="rule-editor effects-editor" aria-label={label}><legend>{label}</legend>{!value.length&&<p className="rule-empty">Дополнительных изменений нет.</p>}
  {value.map((effect,index)=>{const kind=effectKind(effect),definition=(kind==='flag'?flags:kind==='inventory'?items:variables).find(v=>v.id===(kind==='flag'?effect.flagId:kind==='inventory'?effect.itemId:effect.variableId)),problems=effectProblems(effect,project);
   const summary=kind==='inventory'?`${definition?.name??'Предмет'}: ${effect.operation==='remove'?'забрать':'добавить'} ${effect.quantity??1}`:`${definition?.name??'Значение'}: ${kind==='variable'&&effect.operation==='add'?'прибавить ':kind==='variable'&&effect.operation==='subtract'?'вычесть ':''}${kind==='flag'||definition?.type==='boolean'?(effect.value===true||effect.value==='true'?'да':'нет'):effect.value??''}`;
   return <details className="rule-effect" key={effect.id??index} open={expanded===index}><summary onClick={event=>{event.preventDefault();setExpanded(previous=>previous===index?null:index);}}>{summary}</summary><div role="group" aria-label={`Результат ${index+1}`}>
    <label className="field"><span>Вид результата</span><select value={kind} onChange={e=>onChange(value.map((old,i)=>i===index?{...(old.id?{id:old.id}:{}),...make(e.target.value)}:old))}><option value="flag">Изменить флаг</option><option value="variable">Изменить переменную</option><option value="inventory">Изменить инвентарь</option></select></label>
    <label className="field"><span>{kind==='flag'?'Флаг':kind==='inventory'?'Предмет инвентаря':'Переменная'}</span><select value={kind==='flag'?effect.flagId??'':kind==='inventory'?effect.itemId??'':effect.variableId??''} onChange={e=>{const ref=(kind==='flag'?flags:kind==='inventory'?items:variables).find(v=>v.id===e.target.value);update(index,{[{flag:'flagId',inventory:'itemId',variable:'variableId'}[kind]]:e.target.value,...(kind==='variable'?{operation:'set',value:valueFor(ref?.type)}:{})});}}><option value="">Выберите значение</option>{(kind==='flag'?flags:kind==='inventory'?items:variables).map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
    {kind==='inventory'?<><label className="field"><span>Операция с предметом</span><select value={effect.operation??'add'} onChange={e=>update(index,{operation:e.target.value})}><option value="add">Добавить</option><option value="remove">Забрать, не ниже нуля</option></select></label><label className="field"><span>Количество</span><input type="number" min="1" step="1" value={effect.quantity??1} onChange={e=>update(index,{quantity:e.target.value})}/></label></>:<>
     {kind==='variable'&&<label className="field"><span>Операция со значением</span><select value={effect.operation??'set'} onChange={e=>update(index,{operation:e.target.value})}><option value="set">Установить</option>{numeric(definition?.type)&&<><option value="add">Прибавить</option><option value="subtract">Вычесть</option></>}</select></label>}
     <ValueField label="Новое значение" type={kind==='flag'?'boolean':definition?.type??'text'} value={effect.value} onChange={next=>update(index,{value:next})}/>
    </>}
    {problems.length>0&&<p className="rule-error" role="alert">{problems.join(' ')}</p>}
    <button type="button" className="rule-remove" aria-label={`Удалить результат ${index+1}`} onClick={()=>{setExpanded(null);onChange(value.filter((_,i)=>i!==index));}}><Trash/>Удалить результат</button>
   </div></details>;
  })}
  <button type="button" className="rule-add-result" disabled={!flags.length&&!variables.length&&!items.length} onClick={()=>{setExpanded(value.length);onChange([...value,make(flags.length?'flag':variables.length?'variable':'inventory')]);}}><Plus/>Добавить результат</button>
  {!flags.length&&!variables.length&&!items.length&&<p className="rule-empty">Создайте переменную, флаг или предмет в разделе «Сюжет».</p>}
 </fieldset>;
}
