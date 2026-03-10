import { generateRiverPolygon } from '../../lib/math/river-polygon.js';
import { MathOps } from '@lagless/math';

beforeAll(async () => {
  await MathOps.init();
});

describe('generateRiverPolygon', () => {
  it('should generate a valid polygon with water and shore', () => {
    const result = generateRiverPolygon({
      splinePoints: [
        { x: 100, y: 200 },
        { x: 200, y: 200 },
        { x: 300, y: 200 },
        { x: 400, y: 200 },
      ],
      waterWidth: 8,
      shoreWidth: 4,
      looped: false,
      mapWidth: 500,
      mapHeight: 500,
    });

    expect(result.waterPoly.points.length).toBeGreaterThan(0);
    expect(result.shorePoly.points.length).toBeGreaterThan(0);
    expect(result.waterPoly.count).toBe(result.waterPoly.points.length);
    expect(result.shorePoly.count).toBe(result.shorePoly.points.length);
  });

  it('should align endpoints to map edge when river starts at x=0', () => {
    const result = generateRiverPolygon({
      splinePoints: [
        { x: 0, y: 250 },
        { x: 100, y: 250 },
        { x: 200, y: 250 },
        { x: 300, y: 250 },
      ],
      waterWidth: 8,
      shoreWidth: 4,
      looped: false,
      mapWidth: 500,
      mapHeight: 500,
    });

    // The first point of the river starts at x=0 (left edge).
    // getMapEdgeNormal returns {x:0, y:1} for left edge,
    // so the water polygon's first and last (reversed right) endpoints
    // should have x=0 and be spread along y-axis.
    const firstWater = result.waterPoly.points[0];
    expect(firstWater.x).toBeCloseTo(0, 0);
  });

  it('should align endpoints to map edge when river ends at x=mapWidth', () => {
    const result = generateRiverPolygon({
      splinePoints: [
        { x: 100, y: 250 },
        { x: 200, y: 250 },
        { x: 300, y: 250 },
        { x: 500, y: 250 },
      ],
      waterWidth: 8,
      shoreWidth: 4,
      looped: false,
      mapWidth: 500,
      mapHeight: 500,
    });

    // Last sample point is at x=500 (right edge).
    // Water polygon is [...left, ...right.reverse()], so the last left point
    // is the endpoint, and it should be at x=500.
    const waterPoints = result.waterPoly.points;
    const halfIdx = Math.floor(waterPoints.length / 2);
    // The point just before the reversed right side starts is the last left point
    const lastLeftPoint = waterPoints[halfIdx - 1];
    expect(lastLeftPoint.x).toBeCloseTo(500, 0);
  });

  it('should produce a looped polygon when looped=true', () => {
    const result = generateRiverPolygon({
      splinePoints: [
        { x: 100, y: 100 },
        { x: 200, y: 100 },
        { x: 200, y: 200 },
        { x: 100, y: 200 },
      ],
      waterWidth: 8,
      shoreWidth: 4,
      looped: true,
      mapWidth: 500,
      mapHeight: 500,
    });

    expect(result.looped).toBe(true);
    expect(result.waterPoly.points.length).toBeGreaterThan(0);
  });
});
