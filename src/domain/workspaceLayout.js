export const LAYOUT_KEY = 'istoriya-workspace-v1';
export const DEFAULT_LAYOUT = Object.freeze({ left: 248, right: 320, ratio: 58, showLeft: true, showRight: true, showBottom: true, inspectorSide: 'right' });
const clamp = (value, min, max, fallback) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : fallback;
export function normalizeLayout(value = {}) {
  if (!value || typeof value !== 'object') value = {};
  return { left: clamp(value.left, 180, 420, DEFAULT_LAYOUT.left), right: clamp(value.right, 260, 520, DEFAULT_LAYOUT.right), ratio: clamp(value.ratio, 25, 80, DEFAULT_LAYOUT.ratio), inspectorSide: value.inspectorSide==='left'?'left':'right',
    ...Object.fromEntries(['showLeft', 'showRight', 'showBottom'].map(key => [key, typeof value[key] === 'boolean' ? value[key] : DEFAULT_LAYOUT[key]])) };
}
export function readLayout(storage) { try { return normalizeLayout(JSON.parse(storage.getItem(LAYOUT_KEY))); } catch { return { ...DEFAULT_LAYOUT }; } }
export function saveLayout(storage, layout) { try { storage.setItem(LAYOUT_KEY, JSON.stringify(normalizeLayout(layout))); return true; } catch { return false; } }
export function layoutWidths(layout, width, inspector = true) {
  const available = Math.max(0, width - 374);
  let left = layout.showLeft ? layout.left : 0, right = layout.showRight && inspector ? layout.right : 0;
  const total = left + right;
  if (total > available) { const factor = available / total; left *= factor; right *= factor; }
  return { left: Math.round(left), right: Math.round(right) };
}
export function layoutPreset(name) {
  if (name === 'canvas') return { ...DEFAULT_LAYOUT, showLeft: false, showRight: false, showBottom: false };
  if (name === 'writing') return { ...DEFAULT_LAYOUT, showLeft: false, ratio: 30, right: 360 };
  return { ...DEFAULT_LAYOUT };
}
