import type { IVector2Like } from '@lagless/math';
import type { AABB } from '../types/geometry.js';
import type { ISeededRandom } from '../types/prng-interface.js';

/**
 * Generates jagged polygon points around an AABB border.
 * Counter-clockwise winding: bottom→right→top→left.
 * Corner points are NOT offset. Intermediate points are offset by random variation.
 *
 * Port of survev/shared/utils/terrainGen.ts:15-56.
 */
export function generateJaggedAabbPoints(
  aabb: AABB,
  divisionsX: number,
  divisionsY: number,
  variation: number,
  random: ISeededRandom,
): IVector2Like[] {
  const llX = aabb.min.x;
  const llY = aabb.min.y;
  const lrX = aabb.max.x;
  const lrY = aabb.min.y;
  const ulX = aabb.min.x;
  const ulY = aabb.max.y;
  const urX = aabb.max.x;
  const urY = aabb.max.y;

  const distanceX = lrX - llX;
  const distanceY = ulY - llY;
  const spanX = distanceX / (divisionsX + 1);
  const spanY = distanceY / (divisionsY + 1);

  const points: IVector2Like[] = [];

  // Bottom edge: left → right
  points.push({ x: llX, y: llY });
  for (let i = 1; i <= divisionsX; i++) {
    const vari = variation > 0 ? (random.getFloat() * 2 - 1) * variation : 0;
    points.push({ x: llX + spanX * i, y: llY + vari });
  }

  // Right edge: bottom → top
  points.push({ x: lrX, y: lrY });
  for (let i = 1; i <= divisionsY; i++) {
    const vari = variation > 0 ? (random.getFloat() * 2 - 1) * variation : 0;
    points.push({ x: lrX + vari, y: lrY + spanY * i });
  }

  // Top edge: right → left
  points.push({ x: urX, y: urY });
  for (let i = 1; i <= divisionsX; i++) {
    const vari = variation > 0 ? (random.getFloat() * 2 - 1) * variation : 0;
    points.push({ x: urX - spanX * i, y: urY + vari });
  }

  // Left edge: top → bottom
  points.push({ x: ulX, y: ulY });
  for (let i = 1; i <= divisionsY; i++) {
    const vari = variation > 0 ? (random.getFloat() * 2 - 1) * variation : 0;
    points.push({ x: ulX + vari, y: ulY - spanY * i });
  }

  return points;
}
