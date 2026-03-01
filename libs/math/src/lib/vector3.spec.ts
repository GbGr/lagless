import { describe, it, expect, beforeAll } from 'vitest';
import { MathOps } from './math-ops.js';
import { Vector3 } from './vector3.js';

beforeAll(async () => {
  await MathOps.init();
});

describe('Vector3', () => {
  it('constructor defaults to zero', () => {
    const v = new Vector3();
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
    expect(v.z).toBe(0);
  });

  it('setInPlace', () => {
    const v = new Vector3();
    v.setInPlace(1, 2, 3);
    expect(v.x).toBe(1);
    expect(v.y).toBe(2);
    expect(v.z).toBe(3);
  });

  it('clone and copyFrom', () => {
    const a = new Vector3(1, 2, 3);
    const b = a.clone();
    expect(b.equals(a)).toBe(true);
    expect(b).not.toBe(a);
    const c = new Vector3();
    c.copyFrom(a);
    expect(c.equals(a)).toBe(true);
  });

  it('add variants', () => {
    const a = new Vector3(1, 2, 3);
    const b = new Vector3(4, 5, 6);
    const c = a.addToNew(b);
    expect(c.equals(new Vector3(5, 7, 9))).toBe(true);
    expect(a.x).toBe(1); // not mutated

    const ref = new Vector3();
    a.addToRef(b, ref);
    expect(ref.equals(new Vector3(5, 7, 9))).toBe(true);

    a.addInPlace(b);
    expect(a.equals(new Vector3(5, 7, 9))).toBe(true);
  });

  it('sub variants', () => {
    const a = new Vector3(5, 7, 9);
    const b = new Vector3(1, 2, 3);
    expect(a.subToNew(b).equals(new Vector3(4, 5, 6))).toBe(true);
  });

  it('scale variants', () => {
    const a = new Vector3(1, 2, 3);
    expect(a.scaleToNew(2).equals(new Vector3(2, 4, 6))).toBe(true);
  });

  it('negate', () => {
    const a = new Vector3(1, -2, 3);
    expect(a.negateToNew().equals(new Vector3(-1, 2, -3))).toBe(true);
  });

  it('length and distance', () => {
    const a = new Vector3(3, 4, 0);
    expect(a.length()).toBeCloseTo(5, 10);
    expect(a.lengthSquared()).toBe(25);

    const b = new Vector3(0, 0, 0);
    expect(a.distanceTo(b)).toBeCloseTo(5, 10);
    expect(a.distanceSquaredTo(b)).toBe(25);
  });

  it('dot product', () => {
    const a = new Vector3(1, 0, 0);
    const b = new Vector3(0, 1, 0);
    expect(a.dot(b)).toBe(0);
    expect(a.dot(a)).toBe(1);
  });

  it('cross product', () => {
    const x = new Vector3(1, 0, 0);
    const y = new Vector3(0, 1, 0);
    const z = x.crossToNew(y);
    expect(z.equals(new Vector3(0, 0, 1))).toBe(true);

    // y × x = -z
    const nz = y.crossToNew(x);
    expect(nz.equals(new Vector3(0, 0, -1))).toBe(true);
  });

  it('normalize', () => {
    const a = new Vector3(3, 0, 4);
    const n = a.normalizedToNew();
    expect(n.length()).toBeCloseTo(1, 10);
    expect(n.x).toBeCloseTo(3 / 5, 10);
    expect(n.z).toBeCloseTo(4 / 5, 10);

    // zero vector normalizes to zero
    const zero = new Vector3(0, 0, 0);
    zero.normalizeInPlace();
    expect(zero.equals(new Vector3(0, 0, 0))).toBe(true);
  });

  it('lerp', () => {
    const a = new Vector3(0, 0, 0);
    const b = new Vector3(10, 20, 30);
    const mid = a.lerpToNew(b, 0.5);
    expect(mid.equals(new Vector3(5, 10, 15))).toBe(true);
  });

  it('clampLength', () => {
    const a = new Vector3(10, 0, 0);
    a.clampLengthInPlace(0, 5);
    expect(a.length()).toBeCloseTo(5, 10);
    expect(a.x).toBeCloseTo(5, 10);
  });

  it('projectOnto', () => {
    const a = new Vector3(3, 4, 0);
    const normal = new Vector3(1, 0, 0);
    const proj = a.projectOntoToNew(normal);
    expect(proj.x).toBeCloseTo(3, 10);
    expect(proj.y).toBeCloseTo(0, 10);
    expect(proj.z).toBeCloseTo(0, 10);
  });

  it('reflect', () => {
    // Reflect (1, -1, 0) across floor normal (0, 1, 0)
    // r = v - 2*(v.n)*n => (1,-1,0) - 2*(-1)*(0,1,0) = (1,1,0)
    const incoming = new Vector3(1, -1, 0);
    const normal = new Vector3(0, 1, 0);
    const reflected = incoming.reflectToNew(normal);
    expect(reflected.x).toBeCloseTo(1, 10);
    expect(reflected.y).toBeCloseTo(1, 10);
    expect(reflected.z).toBeCloseTo(0, 10);
  });

  it('approxEquals', () => {
    const a = new Vector3(1, 2, 3);
    const b = new Vector3(1 + 1e-9, 2, 3);
    expect(a.approxEquals(b)).toBe(true);
    expect(a.approxEquals(new Vector3(2, 2, 3))).toBe(false);
  });

  it('toArray / fromArray', () => {
    const a = new Vector3(1, 2, 3);
    const arr = a.toArray();
    expect(arr).toEqual([1, 2, 3]);
    const b = Vector3.fromArray(arr);
    expect(b.equals(a)).toBe(true);
  });

  it('static constants are frozen', () => {
    expect(Vector3.ZERO.x).toBe(0);
    expect(Vector3.UP.y).toBe(1);
    expect(Vector3.FORWARD.z).toBe(1);
  });
});
