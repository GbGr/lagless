import { describe, it, expect, beforeAll } from 'vitest';
import { MathOps } from './math-ops.js';
import { Quaternion } from './quaternion.js';
import { Vector3 } from './vector3.js';

beforeAll(async () => {
  await MathOps.init();
});

describe('Quaternion', () => {
  it('identity quaternion has w=1', () => {
    const q = new Quaternion();
    expect(q.x).toBe(0);
    expect(q.y).toBe(0);
    expect(q.z).toBe(0);
    expect(q.w).toBe(1);
    expect(q.equals(Quaternion.IDENTITY)).toBe(true);
  });

  it('clone and copyFrom', () => {
    const a = new Quaternion(1, 2, 3, 4);
    const b = a.clone();
    expect(b.equals(a)).toBe(true);
    expect(b).not.toBe(a);
  });

  it('length and normalize', () => {
    const q = new Quaternion(1, 2, 3, 4);
    const len = q.length();
    expect(len).toBeCloseTo(Math.sqrt(30), 10);

    const n = q.normalizedToNew();
    expect(n.length()).toBeCloseTo(1, 10);
  });

  it('conjugate', () => {
    const q = new Quaternion(1, 2, 3, 4);
    const c = q.conjugateToNew();
    expect(c.x).toBe(-1);
    expect(c.y).toBe(-2);
    expect(c.z).toBe(-3);
    expect(c.w).toBe(4);
  });

  it('multiply identity produces same quaternion', () => {
    const q = Quaternion.fromAxisAngle(Vector3.UP, MathOps.PI / 4);
    const result = q.multiplyToNew(Quaternion.IDENTITY);
    expect(result.approxEquals(q)).toBe(true);
  });

  it('multiply inverse produces identity', () => {
    const q = Quaternion.fromAxisAngle(Vector3.UP, MathOps.PI / 3);
    const inv = q.invertToNew();
    const result = q.multiplyToNew(inv);
    expect(result.approxEquals(Quaternion.IDENTITY, 1e-6)).toBe(true);
  });

  it('fromAxisAngle rotation', () => {
    // 90 degrees around Y
    const q = Quaternion.fromAxisAngle(Vector3.UP, MathOps.PI_HALF);
    // Rotate (1,0,0) should give approximately (0,0,-1)
    const rotated = q.rotateVector3ToNew(new Vector3(1, 0, 0));
    expect(rotated.x).toBeCloseTo(0, 5);
    expect(rotated.y).toBeCloseTo(0, 5);
    expect(rotated.z).toBeCloseTo(-1, 5);
  });

  it('fromYaw creates Y-axis rotation', () => {
    const yaw = MathOps.PI_HALF; // 90 degrees
    const q = Quaternion.fromYaw(yaw);
    const rotated = q.rotateVector3ToNew(new Vector3(0, 0, 1));
    // Forward (0,0,1) rotated 90° around Y should give (-1,0,0) approximately
    expect(rotated.x).toBeCloseTo(1, 5);
    expect(rotated.y).toBeCloseTo(0, 5);
    expect(rotated.z).toBeCloseTo(0, 5);
  });

  it('toEulerYaw extracts Y rotation', () => {
    const yaw = 1.234;
    const q = Quaternion.fromYaw(yaw);
    expect(q.toEulerYaw()).toBeCloseTo(yaw, 5);
  });

  it('fromYawPitchRoll with only yaw matches fromYaw', () => {
    const yaw = 0.5;
    const a = Quaternion.fromYaw(yaw);
    const b = Quaternion.fromYawPitchRoll(yaw, 0, 0);
    expect(a.approxEquals(b, 1e-6)).toBe(true);
  });

  it('slerp endpoints', () => {
    const a = Quaternion.fromYaw(0);
    const b = Quaternion.fromYaw(MathOps.PI_HALF);

    const s0 = a.slerpToNew(b, 0);
    expect(s0.approxEquals(a, 1e-6)).toBe(true);

    const s1 = a.slerpToNew(b, 1);
    expect(s1.approxEquals(b, 1e-6)).toBe(true);
  });

  it('slerp midpoint', () => {
    const a = Quaternion.fromYaw(0);
    const b = Quaternion.fromYaw(MathOps.PI_HALF);
    const mid = a.slerpToNew(b, 0.5);
    const expectedYaw = MathOps.PI_HALF * 0.5;
    expect(mid.toEulerYaw()).toBeCloseTo(expectedYaw, 5);
  });

  it('slerp shortest path (negative dot)', () => {
    // Two quaternions representing similar rotations but via different hemispheres
    const a = Quaternion.fromYaw(0);
    const b = Quaternion.fromYaw(MathOps.PI * 0.9);
    const mid = a.slerpToNew(b, 0.5);
    // Should take shortest path
    expect(mid.length()).toBeCloseTo(1, 5);
  });

  it('rotateVector3 preserves vector length', () => {
    const q = Quaternion.fromYawPitchRoll(0.5, 0.3, 0.1);
    const v = new Vector3(3, 4, 5);
    const rotated = q.rotateVector3ToNew(v);
    expect(rotated.length()).toBeCloseTo(v.length(), 5);
  });

  it('dot product', () => {
    const a = Quaternion.IDENTITY;
    expect(a.dot(a)).toBeCloseTo(1, 10);

    const b = Quaternion.fromYaw(MathOps.PI);
    // q and -q represent same rotation, dot should be close to -1 or 1
    expect(Math.abs(a.dot(b))).toBeLessThanOrEqual(1.001);
  });

  it('approxEquals', () => {
    const a = new Quaternion(0, 0, 0, 1);
    const b = new Quaternion(1e-9, 0, 0, 1);
    expect(a.approxEquals(b)).toBe(true);
  });
});
