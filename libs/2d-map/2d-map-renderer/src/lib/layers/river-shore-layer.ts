import { Graphics } from 'pixi.js';
import type { GeneratedRiver } from '@lagless/2d-map-generator';
import { drawPolygon } from '../utils/polygon-draw.js';

export function createRiverShoreLayer(rivers: readonly GeneratedRiver[], color: number): Graphics {
  const g = new Graphics();
  for (const river of rivers) {
    drawPolygon(g, river.shorePoly.points);
    g.fill({ color });
  }
  return g;
}
