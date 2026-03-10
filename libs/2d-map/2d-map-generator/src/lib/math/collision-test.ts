/**
 * Test circle vs circle overlap.
 */
export function testCircleCircle(
  ax: number, ay: number, ar: number,
  bx: number, by: number, br: number,
): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const distSq = dx * dx + dy * dy;
  const rSum = ar + br;
  return distSq <= rSum * rSum;
}

/**
 * Test circle vs AABB overlap.
 * AABB defined by (minX, minY) to (maxX, maxY).
 */
export function testCircleAabb(
  cx: number, cy: number, cr: number,
  minX: number, minY: number, maxX: number, maxY: number,
): boolean {
  // Find closest point on AABB to circle center
  const closestX = Math.max(minX, Math.min(cx, maxX));
  const closestY = Math.max(minY, Math.min(cy, maxY));

  const dx = cx - closestX;
  const dy = cy - closestY;
  return (dx * dx + dy * dy) <= cr * cr;
}

/**
 * Test AABB vs AABB overlap.
 */
export function testAabbAabb(
  aMinX: number, aMinY: number, aMaxX: number, aMaxY: number,
  bMinX: number, bMinY: number, bMaxX: number, bMaxY: number,
): boolean {
  return aMinX <= bMaxX && aMaxX >= bMinX &&
         aMinY <= bMaxY && aMaxY >= bMinY;
}
