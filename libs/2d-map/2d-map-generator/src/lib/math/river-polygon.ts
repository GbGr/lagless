import type { ReadonlyVec2, Polygon } from '../types/geometry.js';
import type { GeneratedRiver } from '../types/generated-river.js';
import { Spline } from './spline.js';
import { computePolygonBounds } from './polygon-utils.js';

export interface RiverPolygonOptions {
  splinePoints: ReadonlyVec2[];
  waterWidth: number;
  shoreWidth: number;
  looped: boolean;
  mapWidth: number;
  mapHeight: number;
}

export function generateRiverPolygon(opts: RiverPolygonOptions): GeneratedRiver {
  const { splinePoints, waterWidth, shoreWidth, looped, mapWidth, mapHeight } = opts;
  const spline = new Spline(splinePoints, looped);
  const numSamples = Math.max(splinePoints.length * 4, 20);

  const waterLeft: ReadonlyVec2[] = [];
  const waterRight: ReadonlyVec2[] = [];
  const shoreLeft: ReadonlyVec2[] = [];
  const shoreRight: ReadonlyVec2[] = [];

  for (let i = 0; i <= numSamples; i++) {
    const t = i / numSamples;
    const pos = spline.getPos(t);
    const normal = spline.getNormal(t);

    let ww = waterWidth;
    let sw = shoreWidth;

    if (!looped) {
      // Endpoint widening: (1 + end^3 * 1.5) * width
      const end = 1 - Math.min(t, 1 - t) * 2; // 1 at endpoints, 0 at center
      const endFactor = Math.max(0, end);
      const widening = 1 + endFactor * endFactor * endFactor * 1.5;
      ww *= widening;
      sw *= widening;

      // Map edge normal adjustment for flush ends
      if (i === 0 || i === numSamples) {
        const edgeNormal = getMapEdgeNormal(pos, mapWidth, mapHeight);
        if (edgeNormal) {
          // Use edge normal instead of spline normal for flush alignment
          waterLeft.push({ x: pos.x + edgeNormal.x * ww, y: pos.y + edgeNormal.y * ww });
          waterRight.push({ x: pos.x - edgeNormal.x * ww, y: pos.y - edgeNormal.y * ww });
          shoreLeft.push({ x: pos.x + edgeNormal.x * (ww + sw), y: pos.y + edgeNormal.y * (ww + sw) });
          shoreRight.push({ x: pos.x - edgeNormal.x * (ww + sw), y: pos.y - edgeNormal.y * (ww + sw) });
          continue;
        }
      }
    }

    waterLeft.push({ x: pos.x + normal.x * ww, y: pos.y + normal.y * ww });
    waterRight.push({ x: pos.x - normal.x * ww, y: pos.y - normal.y * ww });
    shoreLeft.push({ x: pos.x + normal.x * (ww + sw), y: pos.y + normal.y * (ww + sw) });
    shoreRight.push({ x: pos.x - normal.x * (ww + sw), y: pos.y - normal.y * (ww + sw) });
  }

  // For looped shapes (lakes), the spline winds CW in screen coords.
  // The normal points inward, so waterRight/shoreRight are the outward boundaries.
  const waterPoints = looped
    ? [...waterRight, ...waterRight.slice(0, 1)]
    : [...waterLeft, ...waterRight.reverse()];
  const shorePoints = looped
    ? [...shoreRight, ...shoreRight.slice(0, 1)]
    : [...shoreLeft, ...shoreRight.reverse()];

  const waterPoly: Polygon = { points: waterPoints, count: waterPoints.length };
  const shorePoly: Polygon = { points: shorePoints, count: shorePoints.length };

  // Compute center
  let cx = 0, cy = 0;
  for (const p of splinePoints) { cx += p.x; cy += p.y; }
  cx /= splinePoints.length;
  cy /= splinePoints.length;

  const allPoints = [...waterPoints, ...shorePoints];
  const aabb = computePolygonBounds(allPoints);

  return {
    splinePoints,
    waterWidth,
    shoreWidth,
    looped,
    center: { x: cx, y: cy },
    waterPoly,
    shorePoly,
    aabb,
  };
}

function getMapEdgeNormal(pos: ReadonlyVec2, mapWidth: number, mapHeight: number): ReadonlyVec2 | null {
  const edgeThreshold = 5;
  if (pos.x <= edgeThreshold) return { x: 0, y: 1 };
  if (pos.x >= mapWidth - edgeThreshold) return { x: 0, y: 1 };
  if (pos.y <= edgeThreshold) return { x: 1, y: 0 };
  if (pos.y >= mapHeight - edgeThreshold) return { x: 1, y: 0 };
  return null;
}
