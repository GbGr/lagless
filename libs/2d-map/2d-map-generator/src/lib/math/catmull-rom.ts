import type { ReadonlyVec2 } from '../types/geometry.js';

export function catmullRom(t: number, p0: number, p1: number, p2: number, p3: number): number {
  return 0.5 * (
    2.0 * p1 +
    t * (-p0 + p2) +
    t * t * (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) +
    t * t * t * (-p0 + 3.0 * p1 - 3.0 * p2 + p3)
  );
}

export function catmullRomDerivative(t: number, p0: number, p1: number, p2: number, p3: number): number {
  return 0.5 * (
    -p0 + p2 +
    2.0 * t * (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) +
    3.0 * t * t * (-p0 + 3.0 * p1 - 3.0 * p2 + p3)
  );
}

export interface ControlPointResult {
  pt: number;
  p0: ReadonlyVec2;
  p1: ReadonlyVec2;
  p2: ReadonlyVec2;
  p3: ReadonlyVec2;
}

export function getControlPoints(t: number, points: readonly ReadonlyVec2[], looped: boolean): ControlPointResult {
  const count = points.length;
  let i: number;
  let i0: number;
  let i1: number;
  let i2: number;
  let i3: number;

  if (looped) {
    t = ((t % 1.0) + 1.0) % 1.0; // fmod that handles negatives
    i = ~~(t * (count - 1));
    i1 = i;
    i2 = (i1 + 1) % (count - 1);
    i0 = i1 > 0 ? i1 - 1 : count - 2;
    i3 = (i2 + 1) % (count - 1);
  } else {
    t = Math.max(0, Math.min(1, t));
    i = ~~(t * (count - 1));
    i1 = i === count - 1 ? i - 1 : i;
    i2 = i1 + 1;
    i0 = i1 > 0 ? i1 - 1 : i1;
    i3 = i2 < count - 1 ? i2 + 1 : i2;
  }

  return {
    pt: t * (count - 1) - i1,
    p0: points[i0],
    p1: points[i1],
    p2: points[i2],
    p3: points[i3],
  };
}
