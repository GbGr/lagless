import { Graphics } from 'pixi.js';
import type { ShoreOutput } from '@lagless/2d-map-generator';
import { drawPolygon } from '../utils/polygon-draw.js';

export function createOceanLayer(
  width: number,
  height: number,
  shore: ShoreOutput,
  color: number,
): Graphics {
  const g = new Graphics();
  g.rect(0, 0, width, height).fill({ color });
  drawPolygon(g, shore.polygon.points);
  g.cut();
  return g;
}
