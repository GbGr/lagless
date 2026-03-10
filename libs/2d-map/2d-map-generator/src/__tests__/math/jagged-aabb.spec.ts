import { generateJaggedAabbPoints } from '../../lib/math/jagged-aabb.js';
import { createMockRandom } from '../helpers/mock-random.js';
import type { AABB } from '../../lib/types/geometry.js';

describe('generateJaggedAabbPoints', () => {
  const aabb: AABB = {
    min: { x: 48, y: 48 },
    max: { x: 464, y: 464 },
  };

  it('should produce correct point count: 4 corners + 4 * divisions', () => {
    const random = createMockRandom();
    const divisions = 8;
    const points = generateJaggedAabbPoints(aabb, divisions, divisions, 3, random);

    // 4 corners + 4 * divisions intermediate points
    expect(points.length).toBe(4 + 4 * divisions);
  });

  it('should place corner points at exact AABB corners (no offset)', () => {
    const random = createMockRandom();
    const divisions = 4;
    const points = generateJaggedAabbPoints(aabb, divisions, divisions, 3, random);

    // Corners: ll=0, lr=divisions+1, ur=2*(divisions+1), ul=3*(divisions+1)
    const stride = divisions + 1;
    expect(points[0]).toEqual({ x: 48, y: 48 });         // lower-left
    expect(points[stride]).toEqual({ x: 464, y: 48 });    // lower-right
    expect(points[stride * 2]).toEqual({ x: 464, y: 464 }); // upper-right
    expect(points[stride * 3]).toEqual({ x: 48, y: 464 }); // upper-left
  });

  it('should keep intermediate points within variation range', () => {
    const random = createMockRandom();
    const variation = 5;
    const divisions = 16;
    const points = generateJaggedAabbPoints(aabb, divisions, divisions, variation, random);

    // Check bottom edge (between corner 0 and corner at divisions+1)
    for (let i = 1; i <= divisions; i++) {
      // Y offset should be within [-variation, +variation] of aabb.min.y
      expect(points[i].y).toBeGreaterThanOrEqual(aabb.min.y - variation);
      expect(points[i].y).toBeLessThanOrEqual(aabb.min.y + variation);
    }
  });

  it('should generate points in counter-clockwise winding', () => {
    const random = createMockRandom();
    const divisions = 4;
    const points = generateJaggedAabbPoints(aabb, divisions, divisions, 0, random);

    // With 0 variation, points should trace: bottom (left→right), right (bottom→top),
    // top (right→left), left (top→bottom)
    const stride = divisions + 1;

    // Bottom edge: x increases
    for (let i = 0; i < stride - 1; i++) {
      expect(points[i].x).toBeLessThan(points[i + 1].x);
    }

    // Right edge: y increases
    for (let i = stride; i < stride * 2 - 1; i++) {
      expect(points[i].y).toBeLessThan(points[i + 1].y);
    }

    // Top edge: x decreases
    for (let i = stride * 2; i < stride * 3 - 1; i++) {
      expect(points[i].x).toBeGreaterThan(points[i + 1].x);
    }

    // Left edge: y decreases
    for (let i = stride * 3; i < stride * 4 - 1; i++) {
      expect(points[i].y).toBeGreaterThan(points[i + 1].y);
    }
  });

  it('should produce deterministic output for same seed', () => {
    const points1 = generateJaggedAabbPoints(aabb, 8, 8, 3, createMockRandom(42));
    const points2 = generateJaggedAabbPoints(aabb, 8, 8, 3, createMockRandom(42));

    expect(points1).toEqual(points2);
  });
});
