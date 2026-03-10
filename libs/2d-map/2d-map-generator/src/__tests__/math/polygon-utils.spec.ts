import { pointInPolygon, polygonArea, distToSegmentSq, computePolygonBounds } from '../../lib/math/polygon-utils.js';
import type { Polygon, ReadonlyVec2 } from '../../lib/types/geometry.js';

function makePoly(points: ReadonlyVec2[]): Polygon {
  return { points, count: points.length };
}

describe('pointInPolygon', () => {
  // Unit square
  const square = makePoly([
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ]);

  it('should return true for point inside convex polygon', () => {
    expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true);
  });

  it('should return false for point outside convex polygon', () => {
    expect(pointInPolygon({ x: 15, y: 5 }, square)).toBe(false);
    expect(pointInPolygon({ x: -1, y: -1 }, square)).toBe(false);
  });

  it('should work with concave polygon (L-shape)', () => {
    const lShape = makePoly([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 5 },
      { x: 5, y: 5 },
      { x: 5, y: 10 },
      { x: 0, y: 10 },
    ]);

    expect(pointInPolygon({ x: 2, y: 2 }, lShape)).toBe(true);   // inside lower part
    expect(pointInPolygon({ x: 2, y: 8 }, lShape)).toBe(true);   // inside upper-left
    expect(pointInPolygon({ x: 8, y: 8 }, lShape)).toBe(false);  // outside concavity
    expect(pointInPolygon({ x: 8, y: 2 }, lShape)).toBe(true);   // inside lower-right
  });
});

describe('polygonArea', () => {
  it('should return correct area for a square', () => {
    const points: ReadonlyVec2[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(polygonArea(points)).toBeCloseTo(100, 5);
  });

  it('should return correct area for a triangle', () => {
    const points: ReadonlyVec2[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 10 },
    ];
    expect(polygonArea(points)).toBeCloseTo(50, 5);
  });

  it('should handle counter-clockwise winding', () => {
    const points: ReadonlyVec2[] = [
      { x: 0, y: 0 },
      { x: 0, y: 10 },
      { x: 10, y: 10 },
      { x: 10, y: 0 },
    ];
    // Area should be positive regardless of winding
    expect(polygonArea(points)).toBeCloseTo(100, 5);
  });
});

describe('distToSegmentSq', () => {
  it('should return 0 when point is on segment', () => {
    expect(distToSegmentSq({ x: 5, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(0, 5);
  });

  it('should return perpendicular distance squared', () => {
    expect(distToSegmentSq({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(9, 5);
  });

  it('should return distance to closest endpoint', () => {
    // Point past the end of segment
    expect(distToSegmentSq({ x: 15, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(25, 5);
  });
});

describe('computePolygonBounds', () => {
  it('should compute correct AABB for polygon', () => {
    const points: ReadonlyVec2[] = [
      { x: 2, y: 3 },
      { x: 8, y: 1 },
      { x: 5, y: 9 },
    ];
    const bounds = computePolygonBounds(points);

    expect(bounds.min).toEqual({ x: 2, y: 1 });
    expect(bounds.max).toEqual({ x: 8, y: 9 });
  });
});
