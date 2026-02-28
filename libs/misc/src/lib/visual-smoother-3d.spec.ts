import { describe, it, expect, beforeAll, vi, beforeEach, afterEach } from 'vitest';
import { MathOps } from '@lagless/math';
import { VisualSmoother3d } from './visual-smoother-3d.js';

beforeAll(async () => {
  await MathOps.init();
});

describe('VisualSmoother3d', () => {
  beforeEach(() => {
    vi.spyOn(performance, 'now').mockReturnValue(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('first update initializes output to interpolated position', () => {
    const s = new VisualSmoother3d();
    s.update(0, 0, 0, 10, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0.5);
    expect(s.x).toBeCloseTo(5, 5);
    expect(s.y).toBeCloseTo(0, 5);
    expect(s.z).toBeCloseTo(0, 5);
    expect(s.rotW).toBeCloseTo(1, 5);
  });

  it('interpolates position linearly', () => {
    const s = new VisualSmoother3d();
    // Frame 1: init
    s.update(0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0);
    // Frame 2: sim moved to (10, 0, 0), interp at 0.5
    vi.spyOn(performance, 'now').mockReturnValue(16);
    s.update(0, 0, 0, 10, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0.5);
    expect(s.x).toBeCloseTo(5, 5);
  });

  it('absorbs position jump (rollback smoothing)', () => {
    const s = new VisualSmoother3d({ positionJumpThreshold: 5 });
    // Frame 1: at (0,0,0)
    s.update(0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 1);
    // Frame 2: sudden jump to (20, 0, 0) — should absorb into offset
    vi.spyOn(performance, 'now').mockReturnValue(16);
    s.update(20, 0, 0, 20, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 1);
    // Output should be close to 0 (offset absorbed the jump), with small decay
    expect(Math.abs(s.x)).toBeLessThan(5);
  });

  it('teleport snaps instantly', () => {
    const s = new VisualSmoother3d({ teleportThreshold: 100, positionJumpThreshold: 5 });
    // Frame 1: at (0,0,0)
    s.update(0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 1);
    // Frame 2: teleport to (200, 0, 0)
    vi.spyOn(performance, 'now').mockReturnValue(16);
    s.update(200, 0, 0, 200, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 1);
    // Should snap to new position
    expect(s.x).toBeCloseTo(200, 5);
  });

  it('reset clears state', () => {
    const s = new VisualSmoother3d();
    s.update(0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0);
    s.reset();
    expect(s.isSmoothing).toBe(false);
  });

  it('isSmoothing is false when no offset', () => {
    const s = new VisualSmoother3d();
    s.update(0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0);
    expect(s.isSmoothing).toBe(false);
  });
});
