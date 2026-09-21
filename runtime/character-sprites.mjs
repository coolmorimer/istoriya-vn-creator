// Shared by the editor and compiler: an explicit state wins, then the main sprite.
export function resolveCharacterSprite(character, spriteId, resources = []) {
  const sourceOf = sprite => resources.find(r => r.id === sprite?.resourceId)?.source || sprite?.source;
  const sprites = character?.sprites ?? [];
  const sprite = [sprites.find(s => s.id === spriteId), sprites.find(s => s.id === character?.defaultSpriteId), ...sprites].find(s => sourceOf(s));
  return { sprite, source: sourceOf(sprite) || resources.find(r => r.id === character?.portraitResourceId)?.source || character?.portrait || null };
}
