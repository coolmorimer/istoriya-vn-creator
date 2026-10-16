const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
export function canvasTransform(gesture, clientX, clientY) {
  if (gesture.mode === 'resize') {
    const distance = Math.hypot(clientX - gesture.anchorX, clientY - gesture.anchorY);
    return { x: gesture.x, y: gesture.y, scale: Math.round(clamp(gesture.scale * distance / Math.max(1, gesture.distance), 10, 400)) };
  }
  return { x: Math.round((gesture.x + (clientX - gesture.clientX) / gesture.width * 100) * 10) / 10,
    y: Math.round((gesture.y + (clientY - gesture.clientY) / gesture.height * 100) * 10) / 10, scale: gesture.scale };
}
