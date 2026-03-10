/**
 * Immutable 2D vector for output types. Prevents accidental mutation
 * of shared polygon data between features.
 * Accepts IVector2Like from @lagless/math via structural typing.
 */
export type ReadonlyVec2 = { readonly x: number; readonly y: number };

export interface AABB {
  readonly min: ReadonlyVec2;
  readonly max: ReadonlyVec2;
}

export interface Polygon {
  readonly points: ReadonlyVec2[];
  readonly count: number;
}

export enum ShapeType { Circle = 0, Cuboid = 1 }

export type MapCollisionShape =
  | { type: ShapeType.Circle; radius: number }
  | { type: ShapeType.Cuboid; halfWidth: number; halfHeight: number };
