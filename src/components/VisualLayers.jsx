import { Eye, LockSimple, LockSimpleOpen, ImageSquare, User } from '@phosphor-icons/react';
import { useProjectStore } from '../store/projectStore.js';
import { resolveCharacterSprite } from '../../runtime/character-sprites.mjs';
import {BACKGROUND_Z_ORDER,compareVisualLayers} from '../../runtime/visual-order.mjs';
export function VisualLayers({ layers, background, onEdit }) {
  const { project, activeLayerId, selectVisualLayer } = useProjectStore();
  return <div className="layers-list"><p>Выберите слой, чтобы изменить положение, размер или изображение.</p>
    {[...layers,{id:'__background',kind:'background',zOrder:BACKGROUND_Z_ORDER,_stackOrder:0}].sort((a,b)=>compareVisualLayers(b,a)).map(layer => {
      if(layer.kind==='background')return <div key={layer.id} className="visual-layer"><button onClick={()=>selectVisualLayer('__background')}>{background?<img src={background} alt=""/>:<ImageSquare size={28}/>}<span><strong>Фон</strong><small>{background?'Фон выбранного кадра':'Не выбран'}</small></span></button></div>;
      const character = project.characters.find(item => item.id === layer.characterId);
      const { source, sprite } = layer.kind==='image'?{source:project.resources.find(r=>r.id===layer.resourceId)?.source,sprite:{name:'Предмет'}}:resolveCharacterSprite(character, layer.spriteId, project.resources);
      return <div key={layer.id} className={`visual-layer ${activeLayerId === layer.id ? 'active' : ''}`}>
        <button onClick={() => selectVisualLayer(layer.id)}>{source ? <img src={source} alt="" /> : <User size={28} />}<span><strong>{layer.name || character?.name || 'Персонаж'}</strong><small>{sprite?.name || 'Основной спрайт'} · {Math.round(layer.scale ?? 100)}%</small></span></button>
        <button title={layer.locked ? 'Разблокировать перемещение' : 'Заблокировать перемещение'} aria-pressed={!!layer.locked} onClick={() => onEdit(layer.id, { locked: !layer.locked })}>{layer.locked ? <LockSimple /> : <LockSimpleOpen />}</button>
        <button title="Видимость в игре (прозрачность)" aria-pressed={layer.opacity !== 0 && layer.visible !== false} onClick={() => onEdit(layer.id, { opacity: layer.opacity === 0 ? 100 : 0 })}><Eye color={layer.opacity === 0 ? '#666978' : '#c79cf3'} /></button>
      </div>;
    })}
    {!layers.length && <div className="layers-empty">Персонажей пока нет. Нажмите «Добавить персонажа» над холстом.</div>}
  </div>;
}
