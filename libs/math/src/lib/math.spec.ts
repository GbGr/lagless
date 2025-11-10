import { describe, expect } from 'vitest';
import { MathOps } from './math-ops.js';
import { Vector2 } from './vector2.js';

describe('Math Library', () => {
  it('should work', async () => {
    await MathOps.init();

    expect(MathOps.sin(0.2345)).toBeCloseTo(Math.sin(0.2345), 10);
    expect(MathOps.cos(0.2345)).toBeCloseTo(Math.cos(0.2345), 10);
    expect(MathOps.atan2(0.5, 0.5)).toBeCloseTo(Math.atan2(0.5, 0.5), 10);
    expect(MathOps.sqrt(2)).toBeCloseTo(Math.sqrt(2), 10);
    const testVector = new Vector2(3, 4);
    expect(testVector.length()).toBeCloseTo(Math.hypot(testVector.x, testVector.y), 10);
  });
});
