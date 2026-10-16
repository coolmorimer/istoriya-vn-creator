import {Hand,Crosshair,BoundingBox,Minus,Plus} from '@phosphor-icons/react';
export function CanvasViewControls({navigation,selectedBounds,clipPreview,onToggleClip,onFocus}){
 const percent=Math.round(navigation.view.scale*1000)/10,presets=[1,5,10,25,50,100,200,400,800],values=[...new Set([...presets,percent])].sort((a,b)=>a-b);
 return <div className="canvas-view-controls" aria-label="Навигация по холсту">
  <button type="button" aria-label="Перемещать вид" title="Перемещать вид: Пробел + перетаскивание, средняя кнопка или стрелки в режиме руки" aria-pressed={navigation.hand} disabled={navigation.busy} onClick={()=>navigation.setHand(!navigation.hand)}><Hand size={17}/></button>
  <button type="button" aria-label="К выбранному слою" title={selectedBounds?'Показать выбранный слой, в том числе за кадром':'Выберите видимый слой'} disabled={!selectedBounds||navigation.busy} onClick={onFocus}><Crosshair size={17}/></button>
  <button type="button" aria-label="Границы кадра" title="Обрезать предпросмотр по границам кадра" aria-pressed={clipPreview} disabled={navigation.busy} onClick={onToggleClip}><BoundingBox size={17}/></button>
  <button type="button" aria-label="Уменьшить холст" title="Уменьшить холст (−)" disabled={navigation.busy} onClick={()=>navigation.zoom(navigation.view.scale/1.25)}><Minus size={14}/></button>
  <select aria-label="Масштаб холста" title="100% — исходные пиксели. Колесо увеличивает под курсором." disabled={navigation.busy} value={percent} onChange={event=>navigation.zoom(Number(event.target.value)/100)}>{values.map(value=><option key={value} value={value}>{value}%</option>)}</select>
  <button type="button" aria-label="Увеличить холст" title="Увеличить холст (+)" disabled={navigation.busy} onClick={()=>navigation.zoom(navigation.view.scale*1.25)}><Plus size={14}/></button>
  <button type="button" className="canvas-fit-button" title="Вписать сцену (Ctrl+0). Ctrl+1 — исходный размер." disabled={navigation.busy} onClick={navigation.fit}>Вписать</button>
 </div>;
}
