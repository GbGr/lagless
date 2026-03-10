import { Graphics } from 'pixi.js';
import type { GeneratedGroundPatch } from '@lagless/2d-map-generator';

export function createGroundPatchLayer(patches: readonly GeneratedGroundPatch[]): Graphics {
  const g = new Graphics();
  for (const patch of patches) {
    const w = patch.maxX - patch.minX;
    const h = patch.maxY - patch.minY;
    g.rect(patch.minX, patch.minY, w, h).fill({ color: patch.color });
  }
  return g;
}
