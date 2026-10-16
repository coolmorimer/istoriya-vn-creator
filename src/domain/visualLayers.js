// Route edits to the action that produced the currently displayed property.
// Editor locks are metadata; opacity is also honoured by the exported game.
export function visualLayerEdits(layer, patch) {
  const grouped = new Map();
  for (const [key, value] of Object.entries(patch)) {
    const actionId = key === 'spriteId' ? layer.spriteActionId ?? layer.sourceActionId
      : ['x','y'].includes(key) ? layer.transformActionId ?? layer.sourceActionId : layer.sourceActionId;
    if (!grouped.has(actionId)) grouped.set(actionId, {});
    grouped.get(actionId)[key] = key==='scale'?value/(layer.animationScaleMultiplier??1):value;
  }
  return [...grouped].map(([actionId, values]) => ({ actionId, patch: values }));
}
