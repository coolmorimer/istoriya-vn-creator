import {useState} from 'react';
import {Plus,Trash,ArrowSquareOut} from '@phosphor-icons/react';
import {useProjectStore} from '../store/projectStore.js';
import {createId} from '../data/defaultProject.js';
import {targetScene} from '../../runtime/story-routing.mjs';
import {ConditionEditor,EffectsEditor} from './RuleFields.jsx';
import {StoryDestinationField} from './StoryDestinationField.jsx';
import {destinationValue,destinationPatch} from '../domain/storyDestinations.js';
import './choice-fields.css';

export function ChoiceFields({scene,action}) {
 const {project,updateAction,createChoiceBranch,setActiveScene,setActiveSection}=useProjectStore();
 const [error,setError]=useState('');
 const patch=value=>updateAction(scene.id,action.id,value);
 const update=(id,value)=>patch({options:action.options.map(option=>option.id===id?{...option,...value}:option)});
 const create=option=>{setError('');try{createChoiceBranch({projectId:project.id,sceneId:scene.id,actionId:action.id,optionId:option.id});}catch(e){setError(e.message);}};
 return <div className="choice-authoring"><label className="field"><span>Вопрос</span><textarea rows="3" value={action.prompt} onChange={e=>patch({prompt:e.target.value})}/></label>
  <div className="choice-editor">{action.options.map((option,index)=>{
   const destination=targetScene(project,option),resolved=project.scenes[destination];
   return <section className="choice-option" key={option.id} aria-label={`Вариант ${index+1}`}>
    <header><strong>Вариант {index+1}</strong><button type="button" aria-label={`Удалить вариант ${index+1}`} disabled={action.options.length<2} onClick={()=>patch({options:action.options.filter(o=>o.id!==option.id)})}><Trash/></button></header>
    <label className="field"><span>Текст варианта</span><input value={option.text} onChange={e=>update(option.id,{text:e.target.value})}/></label>
    <StoryDestinationField project={project} label="Переход варианта" value={destinationValue(option)} onChange={value=>update(option.id,destinationPatch(value))}/>
    {!option.targetSceneId&&!option.targetChapterId?<button type="button" className="choice-branch-button" aria-label={`Создать сцену для варианта ${index+1}`} onClick={()=>create(option)}><Plus/>Создать сцену для варианта</button>:resolved?<button type="button" className="choice-branch-button" aria-label={`Открыть сцену варианта ${index+1}`} onClick={()=>{setActiveScene(resolved.id);setActiveSection('scenes');}}><ArrowSquareOut/>Открыть сцену</button>:<p className="choice-author-error">Назначение недоступно. Выберите другую сцену.</p>}
    <details><summary>Условия и результаты{option.condition||option.effects?.length?' · настроены':''}</summary><ConditionEditor project={project} label="Когда показывать вариант" value={option.condition} onChange={condition=>update(option.id,{condition})}/><EffectsEditor project={project} value={option.effects??[]} onChange={effects=>update(option.id,{effects})}/></details>
   </section>;
  })}</div>
  <button className="outline-wide" onClick={()=>patch({options:[...action.options,{id:createId('choice'),text:`Вариант ${action.options.length+1}`,targetSceneId:null,effects:[]}]})}><Plus/>Добавить вариант</button>
  {error&&<p role="alert" className="choice-author-error">{error}</p>}
 </div>;
}
