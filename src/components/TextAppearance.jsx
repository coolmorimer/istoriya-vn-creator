import { useEffect, useRef, useState } from 'react';
import { useProjectStore } from '../store/projectStore.js';
import { textAppearance } from '../../runtime/text-style.mjs';
import {readFontFile} from '../platform/fontFile.js';
export { textAppearance } from '../../runtime/text-style.mjs';
export function StyledText({project,action,children,animate=false,factor=1,minFontSize=12}) {
  const style=textAppearance(project,action),[count,setCount]=useState(0),text=String(children??'');
  useEffect(()=>{setCount(0);if(!animate||!style.speed)return;const began=Date.now();const timer=setInterval(()=>{const n=Math.floor((Date.now()-began)*style.speed/1000);setCount(n);if(n>=text.length)clearInterval(timer);},30);return()=>clearInterval(timer);},[text,style.speed,animate]);
  return <p style={{fontFamily:`"vn-${style.font}",sans-serif`,fontSize:Math.max(minFontSize,style.size*factor),color:style.color,fontWeight:style.bold?'bold':'normal',fontStyle:style.italic?'italic':'normal',textDecoration:style.underline?'underline':'none',WebkitTextStroke:style.outline?`${style.outline*factor}px ${style.outlineColor}`:undefined,paintOrder:'stroke fill',textShadow:style.shadow?`${2*factor}px ${2*factor}px ${2*factor}px #000`:undefined}}>{animate&&style.speed?text.slice(0,count):text}</p>;
}
export function ProjectFonts({project}) {
  return <style>{[{id:'DejaVuSans.ttf',source:'./fonts/DejaVuSans.ttf'},{id:'DejaVuSans-Bold.ttf',source:'./fonts/DejaVuSans-Bold.ttf'},...project.resources.filter(r=>r.category==='font')].map(r=>`@font-face {font-family:${JSON.stringify('vn-'+r.id)};src:url(${JSON.stringify(r.source)});}`).join('\n')}</style>;
}
export function TextAppearance(props) {
  return props.action ? <details className="text-appearance-disclosure"><summary>Шрифт и оформление</summary><TextAppearanceFields {...props}/></details> : <TextAppearanceFields {...props}/>;
}
function TextAppearanceFields({action,onChange}) {
  const {project,updateUi,attachFont,activeSceneId}=useProjectStore();
  const generation=useRef(0);
  useEffect(()=>()=>{generation.current++;},[project.id,action?.id]);
  const [error,setError]=useState('');
  const value=textAppearance(project,action);
  const change=patch=>action?onChange({textStyle:{...action.textStyle,...patch}}):updateUi({textStyle:{...project.ui.textStyle,...patch}});
  const importFont=async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;const token=++generation.current,projectId=project.id,target=action?{kind:'action',sceneId:activeSceneId,actionId:action.id}:{kind:'default'};try{const resource=await readFontFile(file);if(token!==generation.current)return;attachFont({projectId,target,resource});setError('');}catch(err){if(token===generation.current)setError(`Не удалось загрузить шрифт: ${err.message}`);}};
  return <section className="text-appearance"><h3>{action?'Оформление этой реплики':'Оформление текста по умолчанию'}</h3>{action&&<button onClick={()=>onChange({textStyle:undefined})}>Сбросить к настройкам проекта</button>}<label>Шрифт<select value={value.font} onChange={e=>change({font:e.target.value})}><option value="DejaVuSans.ttf">DejaVu Sans</option><option value="DejaVuSans-Bold.ttf">DejaVu Sans Bold</option>{project.resources.filter(r=>r.category==='font'&&(/\.(ttf|otf)$/i.test(r.name)||/font\/(ttf|otf)/.test(r.mime))).map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label><label>Импорт своего шрифта (.ttf, .otf)<input type="file" accept=".ttf,.otf" onChange={importFont}/></label>{error&&<p role="alert">{error}</p>}<div className="text-style-grid"><label>Размер<input type="number" min="10" max="160" value={value.size} onChange={e=>change({size:Math.min(160,Math.max(10,Number(e.target.value)||10))})}/></label><label>Цвет<input type="color" value={value.color} onChange={e=>change({color:e.target.value})}/></label><label>Обводка, px<input type="number" min="0" max="10" value={value.outline} onChange={e=>change({outline:Math.min(10,Math.max(0,Number(e.target.value)||0))})}/></label><label>Цвет обводки<input type="color" value={value.outlineColor} onChange={e=>change({outlineColor:e.target.value})}/></label></div>{[['bold','Жирный'],['italic','Курсив'],['underline','Подчёркивание'],['shadow','Тень']].map(([key,title])=><label className="text-style-check" key={key}><input type="checkbox" checked={!!value[key]} onChange={e=>change({[key]:e.target.checked})}/>{title}</label>)}<label>Появление текста<select value={value.speed===0?'instant':'typing'} onChange={e=>change({speed:e.target.value==='instant'?0:35})}><option value="typing">Печатная машинка</option><option value="instant">Мгновенно</option></select></label>{value.speed>0&&<label>Символов в секунду<input type="range" min="1" max="150" value={value.speed} onChange={e=>change({speed:Number(e.target.value)})}/>{value.speed}</label>}<div className="text-style-preview"><StyledText project={project} action={action} animate factor={.65}>Пример текста: история начинается здесь…</StyledText></div></section>;
}
