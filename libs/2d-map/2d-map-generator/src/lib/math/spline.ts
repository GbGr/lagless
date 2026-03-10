import { MathOps } from '@lagless/math';
import type { ReadonlyVec2 } from '../types/geometry.js';
import { catmullRom, catmullRomDerivative, getControlPoints } from './catmull-rom.js';
import { distToSegmentSq } from './polygon-utils.js';

export class Spline {
  readonly points: ReadonlyVec2[];
  readonly arcLens: number[];
  readonly totalArcLen: number;
  readonly looped: boolean;

  constructor(points: readonly ReadonlyVec2[], looped: boolean) {
    this.looped = looped;
    this.points = points.map(p => ({ x: p.x, y: p.y }));

    const arcLenSamples = points.length * 4;
    this.arcLens = [];
    let curX = this.points[0].x;
    let curY = this.points[0].y;

    for (let i = 0; i <= arcLenSamples; i++) {
      const t = i / arcLenSamples;
      const next = this.getPos(t);
      const dx = next.x - curX;
      const dy = next.y - curY;
      const prevLen = i === 0 ? 0 : this.arcLens[i - 1];
      this.arcLens[i] = prevLen + MathOps.sqrt(dx * dx + dy * dy);
      curX = next.x;
      curY = next.y;
    }
    this.totalArcLen = this.arcLens[this.arcLens.length - 1];
  }

  getPos(t: number): ReadonlyVec2 {
    const { pt, p0, p1, p2, p3 } = getControlPoints(t, this.points, this.looped);
    return {
      x: catmullRom(pt, p0.x, p1.x, p2.x, p3.x),
      y: catmullRom(pt, p0.y, p1.y, p2.y, p3.y),
    };
  }

  getTangent(t: number): ReadonlyVec2 {
    const { pt, p0, p1, p2, p3 } = getControlPoints(t, this.points, this.looped);
    return {
      x: catmullRomDerivative(pt, p0.x, p1.x, p2.x, p3.x),
      y: catmullRomDerivative(pt, p0.y, p1.y, p2.y, p3.y),
    };
  }

  getNormal(t: number): ReadonlyVec2 {
    const tangent = this.getTangent(t);
    const len = MathOps.sqrt(tangent.x * tangent.x + tangent.y * tangent.y);
    if (len === 0) return { x: 0, y: 1 };
    const nx = tangent.x / len;
    const ny = tangent.y / len;
    return { x: -ny, y: nx };
  }

  getClosestTtoPoint(pos: ReadonlyVec2): number {
    let closestDistSq = Number.MAX_VALUE;
    let closestSegIdx = 0;
    for (let i = 0; i < this.points.length - 1; i++) {
      const dSq = distToSegmentSq(pos, this.points[i], this.points[i + 1]);
      if (dSq < closestDistSq) {
        closestDistSq = dSq;
        closestSegIdx = i;
      }
    }

    const s0 = this.points[closestSegIdx];
    const s1 = this.points[closestSegIdx + 1];
    const segX = s1.x - s0.x;
    const segY = s1.y - s0.y;
    const segDot = segX * segX + segY * segY;
    const proj = segDot > 0
      ? Math.max(0, Math.min(1, ((pos.x - s0.x) * segX + (pos.y - s0.y) * segY) / segDot))
      : 0;

    const len = this.points.length - 1;
    const tMin = Math.max(0, Math.min(1, (closestSegIdx + proj - 0.1) / len));
    const tMax = Math.max(0, Math.min(1, (closestSegIdx + proj + 0.1) / len));

    let nearestT = (closestSegIdx + proj) / len;
    let nearestDistSq = Number.MAX_VALUE;

    for (let i = 0; i <= 8; i++) {
      const testT = tMin + (i / 8) * (tMax - tMin);
      const testPos = this.getPos(testT);
      const dx = testPos.x - pos.x;
      const dy = testPos.y - pos.y;
      const dSq = dx * dx + dy * dy;
      if (dSq < nearestDistSq) {
        nearestT = testT;
        nearestDistSq = dSq;
      }
    }

    const tangent = this.getTangent(nearestT);
    const tanLen = MathOps.sqrt(tangent.x * tangent.x + tangent.y * tangent.y);
    if (tanLen > 0) {
      const nearest = this.getPos(nearestT);
      const offset = (tangent.x * (pos.x - nearest.x) + tangent.y * (pos.y - nearest.y)) / tanLen;
      const offsetT = nearestT + offset / (tanLen * len);
      const offPos = this.getPos(offsetT);
      const offDx = pos.x - offPos.x;
      const offDy = pos.y - offPos.y;
      const nDx = pos.x - nearest.x;
      const nDy = pos.y - nearest.y;
      if (offDx * offDx + offDy * offDy < nDx * nDx + nDy * nDy) {
        nearestT = offsetT;
      }
    }

    return nearestT;
  }

  getTfromArcLen(arcLen: number): number {
    arcLen = Math.max(0, Math.min(this.totalArcLen, arcLen));
    let idx = 0;
    while (idx < this.arcLens.length && arcLen > this.arcLens[idx]) {
      idx++;
    }
    if (idx === 0) return 0;

    const prev = this.arcLens[idx - 1];
    const curr = this.arcLens[idx];
    const arcT = curr !== prev ? (arcLen - prev) / (curr - prev) : 0;
    const arcCount = this.arcLens.length - 1;
    const t0 = (idx - 1) / arcCount;
    const t1 = idx / arcCount;
    return t0 + arcT * (t1 - t0);
  }

  getArcLen(t: number): number {
    t = Math.max(0, Math.min(1, t));
    const arcCount = this.arcLens.length - 1;
    const idx0 = Math.floor(t * arcCount);
    const idx1 = idx0 < arcCount ? idx0 + 1 : idx0;
    const segLen = 1.0 / arcCount;
    const arcT = segLen > 0 ? ((t % segLen) / segLen) : 0;
    return this.arcLens[idx0] + arcT * (this.arcLens[idx1] - this.arcLens[idx0]);
  }
}
