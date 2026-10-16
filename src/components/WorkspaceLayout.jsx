import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { DEFAULT_LAYOUT, layoutPreset, layoutWidths, normalizeLayout, readLayout, saveLayout } from '../domain/workspaceLayout.js';
import {useProjectStore} from '../store/projectStore.js';
const LayoutContext = createContext(null);
export const useWorkspaceLayout = () => useContext(LayoutContext);
export function WorkspaceLayout({ inspector, className, children }) {
  const [layout, setLayout] = useState(() => readLayout(window.localStorage));
  const [width, setWidth] = useState(window.innerWidth);
  const request=useProjectStore(s=>s.navigationRequest),target=useProjectStore(s=>s.navigationTarget),projectId=useProjectStore(s=>s.project.id);
  useEffect(()=>{if(request&&target?.projectId===projectId&&target.kind==='scene')setLayout(current=>normalizeLayout({...current,showRight:true,showBottom:true}));},[request,target,projectId]);
  const previous = useRef(null);
  const patch = values => setLayout(current => normalizeLayout({ ...current, ...values }));
  const focus = () => { if (previous.current) { setLayout(previous.current); previous.current = null; } else { previous.current = layout; setLayout(layoutPreset('canvas')); } };
  useEffect(() => { saveLayout(window.localStorage, layout); }, [layout]);
  useEffect(() => { const resize = () => setWidth(window.innerWidth); window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize); }, []);
  const sizes = layoutWidths(layout, width, inspector);
  const reverse=inspector && layout.inspectorSide==='left',left=reverse?sizes.right:sizes.left,right=reverse?sizes.left:sizes.right;
  return <LayoutContext.Provider value={{ layout, patch, reverse }}><div className={`app-shell dock-layout ${className} ${reverse?'dock-reversed':''} ${layout.showLeft ? '' : 'dock-hide-left'} ${layout.showRight ? '' : 'dock-hide-right'}`} style={{ '--dock-left': `${left}px`, '--dock-right': `${right}px`, '--dock-left-gap': left ? '7px' : '0px', '--dock-right-gap': right ? '7px' : '0px' }}>
    <div className="workspace-bar" aria-label="Рабочее пространство"><strong>Панели</strong>
      <button aria-pressed={layout.showLeft} onClick={() => patch({ showLeft: !layout.showLeft })}>Проект</button>
      {inspector && <><button aria-pressed={layout.showRight} onClick={() => patch({ showRight: !layout.showRight })}>Свойства и слои</button><button aria-pressed={layout.showBottom} onClick={() => patch({ showBottom: !layout.showBottom })}>Кадры</button></>}
      <div className="workspace-presets">{inspector&&<select aria-label="Расположение свойств" value={layout.inspectorSide} onChange={event=>patch({inspectorSide:event.target.value})}><option value="right">Свойства справа</option><option value="left">Свойства слева</option></select>}<button onClick={focus}>Только холст / назад</button><select aria-label="Компоновка панелей" value="" onChange={event => { previous.current = null; setLayout(layoutPreset(event.target.value)); }}><option value="" disabled>Компоновка…</option><option value="default">Стандартная</option><option value="writing">Работа с текстом</option><option value="canvas">Большой холст</option></select><button onClick={() => { previous.current = null; setLayout({ ...DEFAULT_LAYOUT }); }}>Сбросить</button></div>
    </div>{children}{layout.showLeft && <PanelSplitter side="left" />}{layout.showRight && inspector && <PanelSplitter side="right" />}
  </div></LayoutContext.Provider>;
}
function PanelSplitter({ side }) {
  const { layout, patch, reverse } = useWorkspaceLayout(), drag = useRef(null);
  const direction=(side==='left'?1:-1)*(reverse?-1:1);
  return <div className={`dock-splitter dock-splitter-${side}`} role="separator" aria-label={side === 'left' ? 'Ширина панели проекта' : 'Ширина панели свойств'} aria-orientation="vertical" aria-valuemin={side === 'left' ? 180 : 260} aria-valuemax={side === 'left' ? 420 : 520} aria-valuenow={layout[side]} tabIndex={0}
    onDoubleClick={() => patch({ [side]: DEFAULT_LAYOUT[side] })}
    onKeyDown={event => { if (['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); patch({ [side]: layout[side] + (event.key === 'ArrowRight' ? 16 : -16) * direction }); } }}
    onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); drag.current = { x: event.clientX, value: layout[side] }; event.currentTarget.setPointerCapture(event.pointerId); }}
    onPointerMove={event => { if (drag.current) patch({ [side]: drag.current.value + (event.clientX - drag.current.x) * direction }); }}
    onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} />;
}
