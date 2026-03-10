import type { ReadonlyVec2, MapCollisionShape } from './geometry.js';

export enum RenderLayer { Ground = 0, Canopy = 1 }

export interface MapColliderDef {
  shape: MapCollisionShape;
  offsetX?: number;
  offsetY?: number;
  isSensor?: boolean;
  tag?: number;
  collisionGroup?: number;
}

export interface MapVisualDef {
  texture: string;
  layer: RenderLayer;
  offsetX?: number;
  offsetY?: number;
  anchorX?: number;
  anchorY?: number;
}

export interface MapObjectDef {
  typeId: number;
  colliders: MapColliderDef[];
  visuals: MapVisualDef[];
  scaleRange: [number, number];
  orientations?: number[];
  groundPatches?: GroundPatchDef[];
  mapDisplay?: MapDisplayDef;
  children?: ChildObjectDef[];
  /** When true, sensor colliders are included in placement AABB computation. */
  includeSensorsInBounds?: boolean;
}

export interface ChildObjectDef {
  typeId: number;
  offset: ReadonlyVec2;
  scale: number;
  ori: number;
  inheritOri?: boolean;
}

export interface GroundPatchDef {
  offset: ReadonlyVec2;
  halfExtents: ReadonlyVec2;
  color: number;
  roughness: number;
  offsetDist: number;
  order: 0 | 1;
  useAsMapShape: boolean;
}

export interface MapDisplayDef {
  shapes: Array<{ collider: MapCollisionShape; color: number; scale: number }>;
}

export type MapObjectRegistry = ReadonlyMap<number, MapObjectDef>;
