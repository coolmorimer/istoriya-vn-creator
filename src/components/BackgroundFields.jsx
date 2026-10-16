import {backgroundTransform} from '../../runtime/background-transform.mjs';
export function BackgroundFields({value,onChange}) {
 const t=backgroundTransform(value);
 const patch=values=>onChange({...t,...values});
 return <section className="background-controls"><h3>Положение и размер фона</h3>
   <label className="field"><span>Подгонка изображения</span><select value={t.fit} onChange={event=>patch({fit:event.target.value})}><option value="cover">Заполнить кадр (обрезать края)</option><option value="contain">Вписать целиком</option><option value="fill">Растянуть</option></select></label>
   <div className="field-grid">{[['x','X · %'],['y','Y · %'],['width','Ширина · %'],['height','Высота · %'],['scale','Масштаб · %'],['rotation','Поворот · °']].map(([key,label])=><label className="field" key={key}><span>{label}</span><input type="number" step={key==='rotation'?1:.5} min={['width','height','scale'].includes(key)?1:undefined} max={['width','height','scale'].includes(key)?2000:undefined} value={t[key]} onChange={event=>patch({[key]:Number(event.target.value)})}/></label>)}</div>
   <div className="background-presets"><button onClick={()=>patch({x:50,y:50})}>По центру</button><button onClick={()=>onChange({x:50,y:50,width:100,height:100,scale:100,rotation:0,fit:'contain'})}>Вписать</button><button onClick={()=>onChange({x:50,y:50,width:100,height:100,scale:100,rotation:0,fit:'cover'})}>Заполнить</button><button onClick={()=>onChange(backgroundTransform())}>Сбросить</button></div>
   <small>Можно задать отрицательные координаты и вынести фон за края. Над холстом включите «Двигать фон», чтобы менять положение напрямую.</small>
 </section>;
}
