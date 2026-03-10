import { Spline } from '../../lib/math/spline.js';
import { MathOps } from '@lagless/math';

beforeAll(async () => {
  await MathOps.init();
});

describe('Spline', () => {
  const linearPoints = [
    { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }, { x: 300, y: 0 },
  ];

  it('should getPos(0) near first point', () => {
    const spline = new Spline(linearPoints, false);
    const pos = spline.getPos(0);
    expect(pos.x).toBeCloseTo(0, 0);
    expect(pos.y).toBeCloseTo(0, 0);
  });

  it('should getPos(1) near last point', () => {
    const spline = new Spline(linearPoints, false);
    const pos = spline.getPos(1);
    expect(pos.x).toBeCloseTo(300, 0);
    expect(pos.y).toBeCloseTo(0, 0);
  });

  it('should getNormal perpendicular to tangent', () => {
    const spline = new Spline(linearPoints, false);
    const tangent = spline.getTangent(0.5);
    const normal = spline.getNormal(0.5);
    // Dot product should be ~0 (perpendicular)
    const dot = tangent.x * normal.x + tangent.y * normal.y;
    expect(dot).toBeCloseTo(0, 3);
  });

  it('should have consistent arc-length functions', () => {
    const spline = new Spline(linearPoints, false);
    const halfLen = spline.totalArcLen / 2;
    const t = spline.getTfromArcLen(halfLen);
    const recovered = spline.getArcLen(t);
    expect(recovered).toBeCloseTo(halfLen, 0);
  });

  it('should find closest t to a point', () => {
    const spline = new Spline(linearPoints, false);
    const t = spline.getClosestTtoPoint({ x: 150, y: 10 });
    const pos = spline.getPos(t);
    expect(pos.x).toBeCloseTo(150, -1);
  });
});
