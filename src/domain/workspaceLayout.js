export const LAYOUT_KEY = 'istoriya-workspace-v1';
export const DEFAULT_LAYOUT = Object.freeze({ left: 248, right: 320, ratio: 58, showLeft: true, showRight: true, showBottom: true, inspectorSide: 'right', floating:{project:null,inspector:null,storyboard:null} });
const clamp = (value, min, max, fallback) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : fallback;
export function normalizeLayout(value = {}) {
  if (!value || typeof value !== 'object') value = {};
  return { left: clamp(value.left, 180, 420, DEFAULT_LAYOUT.left), right: clamp(value.right, 260, 520, DEFAULT_LAYOUT.right), ratio: clamp(value.ratio, 25, 80, DEFAULT_LAYOUT.ratio), inspectorSide: value.inspectorSide==='left'?'left':'right',
    floating:Object.fromEntries(['project','inspector','storyboard'].map(key=>[key,value.floating?.[key]?panelRect(value.floating[key]):null])),
    ...Object.fromEntries(['showLeft', 'showRight', 'showBottom'].map(key => [key, typeof value[key] === 'boolean' ? value[key] : DEFAULT_LAYOUT[key]])) };
}
export function panelRect(value={},viewport={width:100000,height:100000}){const width=clamp(value.width,240,Math.max(240,viewport.width-16),360),height=clamp(value.height,200,Math.max(200,viewport.height-110),500);return {x:clamp(value.x,8,Math.max(8,viewport.width-width-8),64),y:clamp(value.y,94,Math.max(94,viewport.height-height-8),120),width,height};}
export function readLayout(storage) { try { return normalizeLayout(JSON.parse(storage.getItem(LAYOUT_KEY))); } catch { return { ...DEFAULT_LAYOUT }; } }
export function saveLayout(storage, layout) { try { storage.setItem(LAYOUT_KEY, JSON.stringify(normalizeLayout(layout))); return true; } catch { return false; } }
export function layoutWidths(layout, width, inspector = true) {
  const available = Math.max(0, width - 374);
  let left = layout.showLeft&&!layout.floating?.project ? layout.left : 0, right = layout.showRight && inspector&&!layout.floating?.inspector ? layout.right : 0;
  const total = left + right;
  if (total > available) { const factor = available / total; left *= factor; right *= factor; }
  return { left: Math.round(left), right: Math.round(right) };
}
export function layoutPreset(name) {
  if (name === 'canvas') return { ...DEFAULT_LAYOUT, showLeft: false, showRight: false, showBottom: false };
  if (name === 'writing') return { ...DEFAULT_LAYOUT, showLeft: false, ratio: 30, right: 360 };
  return { ...DEFAULT_LAYOUT };
}
