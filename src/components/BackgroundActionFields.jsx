import {useState} from 'react';
import {useProjectStore} from '../store/projectStore.js';
import {BackgroundPicker} from './BackgroundPicker.jsx';
import {BackgroundFields} from './BackgroundFields.jsx';
export function BackgroundActionFields({action,scene,Field}) {
 const {project,updateAction}=useProjectStore(),[picking,setPicking]=useState(false);
 const patch=value=>updateAction(scene.id,action.id,value);
 const resources=project.resources.filter(r=>r.mime?.startsWith('image/')||['background','cg'].includes(r.category));
 return <>
  <Field label="Фон этого шага"><select value={action.assetId??''} onChange={event=>patch({assetId:event.target.value||null,assetName:resources.find(r=>r.id===event.target.value)?.name??'Фон'})}><option value="">Выберите изображение</option>{resources.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>
  <button className="button secondary wide" onClick={()=>setPicking(true)}>Выбрать изображение…</button>
  {picking&&<BackgroundPicker sceneId={scene.id} onClose={()=>setPicking(false)}/>}
  <Field label="Переход"><select value={action.transition??'dissolve'} onChange={event=>patch({transition:event.target.value})}><option value="dissolve">Растворение</option><option value="fade">Затемнение</option><option value="flash">Вспышка</option><option value="none">Без перехода</option></select></Field>
  {!scene.timelineEnabled&&<label className="check-field"><input type="checkbox" checked={action.preserveCharacters===true} onChange={event=>patch({preserveCharacters:event.target.checked})}/><span>Оставить персонажей в кадре</span></label>}
  <BackgroundFields value={action.backgroundTransform} onChange={backgroundTransform=>patch({backgroundTransform})}/>
 </>;
}
