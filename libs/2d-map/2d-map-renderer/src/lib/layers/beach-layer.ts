import { Graphics } from 'pixi.js';
import type { ShoreOutput, GrassOutput } from '@lagless/2d-map-generator';
import { drawPolygon } from '../utils/polygon-draw.js';

export function createBeachLayer(shore: ShoreOutput, grass: GrassOutput, color: number): Graphics {
  const g = new Graphics();
  drawPolygon(g, shore.polygon.points);
  g.fill({ color });
  drawPolygon(g, grass.polygon.points);
  g.cut();
  return g;
}
