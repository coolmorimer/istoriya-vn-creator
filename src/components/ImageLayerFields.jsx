import {useProjectStore} from '../store/projectStore.js';
import {PropInteractionFields} from './PropInteractionFields.jsx';
export function ImageLayerFields({scene,layer}) {
 const {project,updateSceneImage,removeSceneImage}=useProjectStore();
 const patch=values=>{if(layer.motionActionId&&Object.keys(values).every(k=>['x','y','scale','rotation','opacity'].includes(k)))useProjectStore.getState().updateAction(scene.id,layer.motionActionId,values);else updateSceneImage(scene.id,layer.id,values);};
 return <section className="inspector-section" data-editor-location={JSON.stringify(['layer',layer.id])}><h3>Предметный слой</h3><label className="field"><span>Название слоя</span><input value={layer.name} onChange={event=>patch({name:event.target.value})}/></label>
 <label className="field"><span>Изображение</span><select value={layer.resourceId} onChange={event=>patch({resourceId:event.target.value})}>{project.resources.filter(r=>r.mime?.startsWith('image/')||['prop','background','sprite','cg','ui'].includes(r.category)).map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
 <div className="field-grid">{[['x','X · %'],['y','Y · %'],['width','Ширина · %'],['height','Высота · %'],['scale','Масштаб · %'],['rotation','Поворот · °'],['zOrder','Порядок слоя'],['opacity','Непрозрачность · %']].map(([key,label])=><label key={key} className="field"><span>{label}</span><input type="number" value={layer[key]} onChange={event=>patch({[key]:['width','height','scale'].includes(key)?Math.max(1,Number(event.target.value)):key==='opacity'?Math.max(0,Math.min(100,Number(event.target.value))):Number(event.target.value)})}/></label>)}</div>
 <div className="background-presets"><button onClick={()=>patch({zOrder:5})}>За героями</button><button onClick={()=>patch({zOrder:50})}>Перед героями</button><button onClick={()=>patch({visible:!layer.visible})}>{layer.visible?'Скрыть':'Показать'}</button><button onClick={()=>patch({locked:!layer.locked})}>{layer.locked?'Разблокировать':'Заблокировать'}</button><button onClick={()=>removeSceneImage(scene.id,layer.id)}>Удалить слой</button></div>
 <PropInteractionFields scene={scene} layer={layer}/>
 </section>;
}
