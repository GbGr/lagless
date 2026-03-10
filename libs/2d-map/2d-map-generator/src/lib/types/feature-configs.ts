import type { ReadonlyVec2, Polygon, AABB } from './geometry.js';
import type { PlacedObject, TerrainZone } from './placed-object.js';
import type { MapObjectRegistry, GroundPatchDef } from './object-def.js';
import type { GeneratedRiver, GeneratedGroundPatch } from './generated-river.js';

// --- Biome ---

export interface BiomeConfig {
  background: number;
  water: number;
  waterRipple: number;
  beach: number;
  riverbank: number;
  grass: number;
  underground: number;
  custom?: Record<string, number>;
}

export type BiomeOutput = BiomeConfig;

// --- Shore ---

export interface ShoreConfig {
  inset: number;
  divisions: number;
  variation: number;
}

export interface ShoreOutput {
  readonly polygon: Polygon;
  readonly bounds: AABB;
}

// --- Grass ---

export interface GrassConfig {
  inset: number;
  variation: number;
}

export interface GrassOutput {
  readonly polygon: Polygon;
  readonly bounds: AABB;
  readonly area: number;
}

// --- River ---

export interface RiverConfig {
  weights: Array<{ weight: number; widths: number[] }>;
  subdivisionPasses: number;
  masks: Array<{ pos?: ReadonlyVec2; rad: number }>;
}

export interface RiverOutput {
  readonly rivers: ReadonlyArray<GeneratedRiver>;
  readonly normalRivers: ReadonlyArray<GeneratedRiver>;
}

// --- Lake ---

export interface LakeConfig {
  lakes: Array<{
    odds: number;
    innerRad: number;
    outerRad: number;
    spawnBound: { pos: ReadonlyVec2; rad: number };
  }>;
}

export interface LakeOutput {
  readonly lakes: ReadonlyArray<GeneratedRiver>;
}

// --- Bridge ---

export interface BridgeConfig {
  bridgeTypes: { medium: number; large: number; xlarge: number };
  maxPerSize: { medium: number; large: number; xlarge: number };
}

export interface BridgeOutput {
  readonly bridges: ReadonlyArray<PlacedObject>;
}

// --- Object Placement ---

export enum PlacementKind { Location = 0, Fixed = 1, Random = 2, Density = 3 }

export interface LocationStage {
  kind: PlacementKind.Location;
  typeId: number;
  pos: ReadonlyVec2;
  rad: number;
  optional: boolean;
  maxAttempts?: number;
}

export interface FixedStage {
  kind: PlacementKind.Fixed;
  typeId: number;
  count: number;
  important?: boolean;
  terrainZone?: TerrainZone;
}

export interface RandomStage {
  kind: PlacementKind.Random;
  spawns: number[];
  choose: number;
  terrainZone?: TerrainZone;
}

export interface DensityStage {
  kind: PlacementKind.Density;
  typeId: number;
  density: number;
  terrainZone?: TerrainZone;
}

export type PlacementStage = LocationStage | FixedStage | RandomStage | DensityStage;

export interface ObjectPlacementConfig {
  registry: MapObjectRegistry;
  stages: PlacementStage[];
}

export interface ObjectPlacementOutput {
  readonly objects: ReadonlyArray<PlacedObject>;
}

// --- Ground Patch ---

export interface GroundPatchConfig {
  registry?: MapObjectRegistry;
  extraPatches?: GroundPatchDef[];
}

export interface GroundPatchOutput {
  readonly patches: ReadonlyArray<GeneratedGroundPatch>;
}

// --- Places ---

export interface PlacesConfig {
  places: Array<{ name: string; pos: ReadonlyVec2 }>;
}

export interface PlacesOutput {
  readonly places: ReadonlyArray<{ name: string; x: number; y: number }>;
}
