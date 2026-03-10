export type { ReadonlyVec2, AABB, Polygon, MapCollisionShape } from './geometry.js';
export { ShapeType } from './geometry.js';
export type { ISeededRandom } from './prng-interface.js';
export type { ICollisionProvider } from './collision-provider.js';
export type { IMapFeature, GenerationContext } from './feature.js';
export { FeatureId } from './feature.js';
export type { IGeneratedMap } from './generated-map.js';
export { TerrainZone } from './placed-object.js';
export type { PlacedObject } from './placed-object.js';
export { RenderLayer } from './object-def.js';
export type {
  MapObjectDef,
  MapColliderDef,
  MapVisualDef,
  ChildObjectDef,
  GroundPatchDef,
  MapDisplayDef,
  MapObjectRegistry,
} from './object-def.js';
export type { MapGeneratorConfig } from './map-generator-config.js';
export type { GeneratedRiver, GeneratedGroundPatch } from './generated-river.js';
export { PlacementKind } from './feature-configs.js';
export type {
  BiomeConfig,
  BiomeOutput,
  ShoreConfig,
  ShoreOutput,
  GrassConfig,
  GrassOutput,
  RiverConfig,
  RiverOutput,
  LakeConfig,
  LakeOutput,
  BridgeConfig,
  BridgeOutput,
  LocationStage,
  FixedStage,
  RandomStage,
  DensityStage,
  PlacementStage,
  ObjectPlacementConfig,
  ObjectPlacementOutput,
  GroundPatchConfig,
  GroundPatchOutput,
  PlacesConfig,
  PlacesOutput,
} from './feature-configs.js';
