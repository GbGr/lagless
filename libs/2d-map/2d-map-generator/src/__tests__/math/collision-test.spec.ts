import { testCircleCircle, testCircleAabb, testAabbAabb } from '../../lib/math/collision-test.js';

describe('testCircleCircle', () => {
  it('should detect overlapping circles', () => {
    expect(testCircleCircle(0, 0, 5, 3, 0, 5)).toBe(true);
  });

  it('should detect non-overlapping circles', () => {
    expect(testCircleCircle(0, 0, 5, 20, 0, 5)).toBe(false);
  });

  it('should detect touching circles', () => {
    expect(testCircleCircle(0, 0, 5, 10, 0, 5)).toBe(true);
  });
});

describe('testCircleAabb', () => {
  it('should detect circle inside AABB', () => {
    expect(testCircleAabb(5, 5, 2, 0, 0, 10, 10)).toBe(true);
  });

  it('should detect circle overlapping AABB edge', () => {
    expect(testCircleAabb(11, 5, 2, 0, 0, 10, 10)).toBe(true);
  });

  it('should detect circle outside AABB', () => {
    expect(testCircleAabb(20, 20, 2, 0, 0, 10, 10)).toBe(false);
  });

  it('should detect circle near corner', () => {
    // Circle at (12, 12) with radius 3, AABB (0,0)-(10,10)
    // Distance to corner (10,10) = sqrt(8) ≈ 2.83 < 3
    expect(testCircleAabb(12, 12, 3, 0, 0, 10, 10)).toBe(true);
  });
});

describe('testAabbAabb', () => {
  it('should detect overlapping AABBs', () => {
    expect(testAabbAabb(0, 0, 10, 10, 5, 5, 15, 15)).toBe(true);
  });

  it('should detect non-overlapping AABBs', () => {
    expect(testAabbAabb(0, 0, 10, 10, 20, 20, 30, 30)).toBe(false);
  });

  it('should detect touching AABBs', () => {
    expect(testAabbAabb(0, 0, 10, 10, 10, 0, 20, 10)).toBe(true);
  });
});
