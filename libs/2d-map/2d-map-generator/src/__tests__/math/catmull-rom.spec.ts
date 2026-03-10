import { catmullRom, catmullRomDerivative, getControlPoints } from '../../lib/math/catmull-rom.js';

describe('catmullRom', () => {
  it('should return p1 at t=0', () => {
    expect(catmullRom(0, 0, 10, 20, 30)).toBeCloseTo(10, 5);
  });

  it('should return p2 at t=1', () => {
    expect(catmullRom(1, 0, 10, 20, 30)).toBeCloseTo(20, 5);
  });

  it('should interpolate between p1 and p2 at t=0.5', () => {
    const result = catmullRom(0.5, 0, 10, 20, 30);
    expect(result).toBeGreaterThan(10);
    expect(result).toBeLessThan(20);
  });
});

describe('catmullRomDerivative', () => {
  it('should return non-zero derivative for non-constant curve', () => {
    expect(catmullRomDerivative(0.5, 0, 10, 20, 30)).not.toBe(0);
  });
});

describe('getControlPoints', () => {
  const points = [
    { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 },
    { x: 30, y: 0 }, { x: 40, y: 0 },
  ];

  it('should return valid control points for non-looped', () => {
    const cp = getControlPoints(0.5, points, false);
    expect(cp.p0).toBeDefined();
    expect(cp.p1).toBeDefined();
    expect(cp.p2).toBeDefined();
    expect(cp.p3).toBeDefined();
    expect(cp.pt).toBeGreaterThanOrEqual(0);
    expect(cp.pt).toBeLessThanOrEqual(1);
  });

  it('should clamp t for non-looped', () => {
    const cp0 = getControlPoints(0, points, false);
    expect(cp0.p1).toBe(points[0]);

    const cp1 = getControlPoints(1, points, false);
    expect(cp1.p2).toBe(points[4]);
  });
});
