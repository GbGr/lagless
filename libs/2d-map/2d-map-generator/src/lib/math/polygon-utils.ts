import type { ReadonlyVec2, AABB, Polygon } from '../types/geometry.js';

/**
 * Point-in-polygon test using ray casting algorithm.
 * Uses AABB pre-check for early exit.
 */
export function pointInPolygon(point: ReadonlyVec2, polygon: Polygon): boolean {
  const pts = polygon.points;
  const n = polygon.count;
  if (n < 3) return false;

  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = pts[i].x;
    const yi = pts[i].y;
    const xj = pts[j].x;
    const yj = pts[j].y;

    if (((yi > point.y) !== (yj > point.y)) &&
        (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Polygon area via shoelace formula. Returns absolute value (positive regardless of winding).
 */
export function polygonArea(points: readonly ReadonlyVec2[]): number {
  const n = points.length;
  if (n < 3) return 0;

  let area = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    area += (points[j].x + points[i].x) * (points[j].y - points[i].y);
  }
  return Math.abs(area) / 2;
}

/**
 * Squared distance from a point to a line segment.
 */
export function distToSegmentSq(
  point: ReadonlyVec2,
  segA: ReadonlyVec2,
  segB: ReadonlyVec2,
): number {
  const dx = segB.x - segA.x;
  const dy = segB.y - segA.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    // Degenerate segment (both points same)
    const px = point.x - segA.x;
    const py = point.y - segA.y;
    return px * px + py * py;
  }

  let t = ((point.x - segA.x) * dx + (point.y - segA.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projX = segA.x + t * dx;
  const projY = segA.y + t * dy;
  const ex = point.x - projX;
  const ey = point.y - projY;
  return ex * ex + ey * ey;
}

/**
 * Compute AABB bounds for a set of points.
 */
export function computePolygonBounds(points: readonly ReadonlyVec2[]): AABB {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  return {
    min: { x: minX, y: minY },
    max: { x: maxX, y: maxY },
  };
}
