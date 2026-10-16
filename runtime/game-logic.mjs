// Shared semantics for no-code rules. No authored strings are executed as code.
const operators=new Set(['eq','neq','gt','gte','lt','lte','contains']);
export const scalarValue=(type,value)=>['number','relationship'].includes(type)?Number(value)||0:type==='boolean'?value===true||value==='true':String(value??'');
function reference(condition,project){
 if(condition.flagId)return {kind:'flag',id:condition.flagId,type:'boolean',definition:project.flags?.find(v=>v.id===condition.flagId)};
 if(condition.itemId)return {kind:'item',id:condition.itemId,type:'number',definition:project.items?.find(v=>v.id===condition.itemId)};
 return {kind:'variable',id:condition.variableId,definition:project.variables?.find(v=>v.id===condition.variableId),type:project.variables?.find(v=>v.id===condition.variableId)?.type};
}
export function conditionProblems(condition,project){
 const errors=[],seen=new Set();let count=0;
 const visit=(c,depth,label)=>{
  if(!c||typeof c!=='object'||Array.isArray(c)){errors.push(`${label}: выберите условие.`);return;}
  if(depth>8||++count>128||seen.has(c)){errors.push(`${label}: условие слишком сложное или содержит цикл.`);return;}
  seen.add(c);
  if(c.negate!=null&&typeof c.negate!=='boolean')errors.push(`${label}: некорректное отрицание.`);
  if(c.kind==='all'||c.kind==='any'){
   if(!Array.isArray(c.conditions)||!c.conditions.length)errors.push(`${label}: добавьте хотя бы одно условие в группу.`);
   else c.conditions.forEach((child,i)=>visit(child,depth+1,`${label}.${i+1}`));
  }else{
   const ref=reference(c,project),op=c.operator??(ref.kind==='item'?'gte':'eq');
   if(!ref.definition)errors.push(`${label}: отсутствует ${ref.kind==='flag'?'флаг':ref.kind==='item'?'предмет инвентаря':'переменная'}.`);
   if(c.kind)errors.push(`${label}: неизвестный вид условия.`);
   if(!operators.has(op))errors.push(`${label}: неизвестное сравнение.`);
   if(op==='contains'&&ref.type!=='text')errors.push(`${label}: поиск подстроки доступен только для текста.`);
   if(['number','relationship'].includes(ref.type)&&(!['number','string'].includes(typeof c.value)||String(c.value).trim()===''||!Number.isFinite(Number(c.value))))errors.push(`${label}: введите число.`);
   if(ref.kind==='item'&&(!Number.isInteger(Number(c.value))||Number(c.value)<0))errors.push(`${label}: количество должно быть целым и неотрицательным.`);
   if(ref.type==='boolean'&&![true,false,'true','false'].includes(c.value))errors.push(`${label}: выберите «да» или «нет».`);
  }
  seen.delete(c);
 };
 if(condition!=null)visit(condition,0,'Условие');return errors;
}
export function evaluateCondition(condition,state,project){
 if(condition==null)return true;if(conditionProblems(condition,project).length)return false;
 const visit=c=>{
  let result;
  if(c.kind==='all'||c.kind==='any')result=c.kind==='all'?c.conditions.every(visit):c.conditions.some(visit);
  else{
   const ref=reference(c,project),value=ref.kind==='flag'?state.flags?.[ref.id]:ref.kind==='item'?state.inventory?.[ref.id]:state.variables?.[ref.id];
   const a=scalarValue(ref.type,value),b=scalarValue(ref.type,c.value),op=c.operator??(ref.kind==='item'?'gte':'eq');
   result=({eq:()=>a===b,neq:()=>a!==b,gt:()=>a>b,gte:()=>a>=b,lt:()=>a<b,lte:()=>a<=b,contains:()=>a.includes(b)})[op]();
  }
  return c.negate?!result:result;
 };return visit(condition);
}
export function compileCondition(condition,project,{asciiId,literal}){
 if(condition==null)return 'True';if(conditionProblems(condition,project).length)return 'False';
 const visit=c=>{
  let result;
  if(c.kind==='all'||c.kind==='any')result=`(${c.conditions.map(visit).join(c.kind==='all'?' and ':' or ')})`;
  else{
   const ref=reference(c,project),a=ref.kind==='item'?`istoriya_inventory.get(${literal(ref.id)}, 0)`:asciiId(ref.id,ref.kind==='flag'?'flag':'v'),b=literal(scalarValue(ref.type,c.value)),op=c.operator??(ref.kind==='item'?'gte':'eq');
   result=op==='contains'?`(${b} in ${a})`:`${a} ${{eq:'==',neq:'!=',gt:'>',gte:'>=',lt:'<',lte:'<='}[op]} ${b}`;
  }
  return c.negate?`(not ${result})`:result;
 };return visit(condition);
}
export function conditionReferences(condition,kind,id){
 const seen=new Set();const visit=(c,depth)=>{if(!c||typeof c!=='object'||seen.has(c)||depth>8)return false;seen.add(c);if(c.kind==='all'||c.kind==='any')return Array.isArray(c.conditions)&&c.conditions.some(child=>visit(child,depth+1));const source=c.flagId?'flag':c.itemId?'item':'variable';return source===kind&&c[{flag:'flagId',variable:'variableId',item:'itemId'}[kind]]===id;};return visit(condition,0);
}
export function effectKind(effect){return ['inventory','flag','variable'].includes(effect.kind)?effect.kind:effect.type==='flag'||effect.flagId?'flag':'variable';}
export function effectProblems(effect,project){
 if(!effect||typeof effect!=='object'||Array.isArray(effect))return ['Некорректный результат.'];
 const kind=effectKind(effect);
 if(effect.kind&&!['flag','variable','inventory'].includes(effect.kind))return ['Неизвестный вид результата.'];
 if(kind==='inventory'){
  if(!project.items?.some(i=>i.id===effect.itemId))return ['В результате отсутствует предмет инвентаря.'];
  if(!['add','remove'].includes(effect.operation)||!Number.isInteger(Number(effect.quantity))||Number(effect.quantity)<1)return ['Выберите добавление/изъятие и положительное целое количество.'];
  return [];
 }
 const definition=kind==='flag'?project.flags?.find(v=>v.id===effect.flagId):project.variables?.find(v=>v.id===effect.variableId);
 if(!definition)return [`В результате отсутствует ${kind==='flag'?'флаг':'переменная'}.`];
 const type=kind==='flag'?'boolean':definition.type,operation=effect.operation??'set';
 if(kind==='variable'&&!(['number','relationship'].includes(type)?['set','add','subtract']:['set']).includes(operation))return ['Для этого типа значения доступна только установка, а для чисел также сложение/вычитание.'];
 if(['number','relationship'].includes(type)&&(!['number','string'].includes(typeof effect.value)||String(effect.value).trim()===''||!Number.isFinite(Number(effect.value))))return ['В результате нужно число.'];
 if(type==='boolean'&&![true,false,'true','false'].includes(effect.value))return ['В результате выберите «да» или «нет».'];
 return [];
}
export function applyGameplayEffect(effect,state,project){
 if(effectProblems(effect,project).length)return false;
 const kind=effectKind(effect);
 if(kind==='flag'){state.flags[effect.flagId]=scalarValue('boolean',effect.value);return true;}
 if(kind==='inventory'){state.inventory??={};state.inventory[effect.itemId]=Math.max(0,(Number(state.inventory[effect.itemId])||0)+(effect.operation==='add'?1:-1)*Number(effect.quantity));return true;}
 const definition=project.variables.find(v=>v.id===effect.variableId),value=scalarValue(definition.type,effect.value),old=scalarValue(definition.type,state.variables[definition.id]);
 state.variables[definition.id]=effect.operation==='add'?old+value:effect.operation==='subtract'?old-value:value;
 if(definition.type==='relationship')state.variables[definition.id]=Math.min(definition.max??100,Math.max(definition.min??0,state.variables[definition.id]));return true;
}
export function compileGameplayEffect(effect,project,{asciiId,literal}){
 const errors=effectProblems(effect,project);if(errors.length)throw Error(errors.join(' '));
 const kind=effectKind(effect);
 if(kind==='flag')return [`${asciiId(effect.flagId,'flag')} = ${literal(scalarValue('boolean',effect.value))}`];
 if(kind==='inventory'){const key=literal(effect.itemId);return [`istoriya_inventory[${key}] = max(0, istoriya_inventory.get(${key}, 0) ${effect.operation==='add'?'+':'-'} ${Number(effect.quantity)})`];}
 const variable=project.variables.find(v=>v.id===effect.variableId),name=asciiId(variable.id,'v'),value=literal(scalarValue(variable.type,effect.value));
 const lines=[`${name} ${effect.operation==='add'?'+=':effect.operation==='subtract'?'-=':'='} ${value}`];
 if(variable.type==='relationship')lines.push(`${name} = min(${Number(variable.max??100)}, max(${Number(variable.min??0)}, ${name}))`);return lines;
}
