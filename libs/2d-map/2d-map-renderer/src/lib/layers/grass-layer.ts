import { Graphics } from 'pixi.js';
import type { GrassOutput } from '@lagless/2d-map-generator';
import { drawPolygon } from '../utils/polygon-draw.js';

export function createGrassLayer(grass: GrassOutput, color: number): Graphics {
  const g = new Graphics();
  drawPolygon(g, grass.polygon.points);
  g.fill({ color });
  return g;
}
