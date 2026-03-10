import type { ReadonlyVec2, AABB, Polygon } from './geometry.js';

export interface GeneratedRiver {
  readonly splinePoints: ReadonlyVec2[];
  readonly waterWidth: number;
  readonly shoreWidth: number;
  readonly looped: boolean;
  readonly center: ReadonlyVec2;
  readonly waterPoly: Polygon;
  readonly shorePoly: Polygon;
  readonly aabb: AABB;
}

export interface GeneratedGroundPatch {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly color: number;
  readonly roughness: number;
  readonly offsetDist: number;
  readonly order: 0 | 1;
  readonly useAsMapShape: boolean;
}
