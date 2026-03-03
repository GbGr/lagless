export * from './lib/rapier-types-3d.js';
export * from './lib/physics-config-3d.js';
export * from './lib/physics-world-manager-3d.js';
export * from './lib/physics-simulation-3d.js';
export * from './lib/physics-runner-3d.js';
export * from './lib/physics-step-sync-3d.js';
export * from './lib/collision-events-3d.js';

// Re-exports from @lagless/physics-shared (matching physics2d pattern)
export { BodyType, type BodyTypeValue, ColliderEntityMap, UNMAPPED_ENTITY, handleToIndex, CollisionLayers, CollisionEventsBase } from '@lagless/physics-shared';
export type { IPhysicsRefsComponent, IFilter, IPhysicsWorldManagerBase, IRapierEventQueue, IColliderSensorChecker } from '@lagless/physics-shared';

// Deprecated aliases (use ColliderEntityMap and CollisionLayers from @lagless/physics-shared directly)
export * from './lib/collider-entity-map-3d.js';
export * from './lib/collision-layers-3d.js';

// Deprecated unsuffixed type names (use suffixed names from rapier-types-3d.js)
export * from './lib/rapier-types.js';
