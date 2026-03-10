import { Graphics } from 'pixi.js';
import type { GeneratedRiver } from '@lagless/2d-map-generator';
import { drawPolygon } from '../utils/polygon-draw.js';

export function createRiverWaterLayer(rivers: readonly GeneratedRiver[], color: number): Graphics {
  const g = new Graphics();
  for (const river of rivers) {
    drawPolygon(g, river.waterPoly.points);
    g.fill({ color });
  }
  return g;
}
