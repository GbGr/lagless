import { Graphics } from 'pixi.js';
import type { AABB } from '@lagless/2d-map-generator';
import { generateJaggedAabbPoints } from '@lagless/2d-map-generator';
import type { ISeededRandom } from '@lagless/2d-map-generator';
import { drawPolygon } from './polygon-draw.js';

export function drawJaggedAabb(
  g: Graphics,
  aabb: AABB,
  roughness: number,
  offsetDist: number,
  color: number,
  random: ISeededRandom,
): Graphics {
  const w = aabb.max.x - aabb.min.x;
  const h = aabb.max.y - aabb.min.y;
  const divisionsX = Math.max(2, Math.round(w * roughness / Math.max(1, offsetDist)));
  const divisionsY = Math.max(2, Math.round(h * roughness / Math.max(1, offsetDist)));

  const points = generateJaggedAabbPoints(aabb, divisionsX, divisionsY, offsetDist, random);
  drawPolygon(g, points);
  g.fill({ color });
  return g;
}
