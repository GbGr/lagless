/**
 * @deprecated Import from `./rapier-types-3d.js` and use suffixed names
 * (e.g. `RapierRigidBodyDesc3d` instead of `RapierRigidBodyDesc`).
 */

// Re-export suffixed names as the old unsuffixed names for backward compatibility
export type { RapierRigidBodyDesc3d as RapierRigidBodyDesc } from './rapier-types-3d.js';
export type { RapierColliderDesc3d as RapierColliderDesc } from './rapier-types-3d.js';
export type { RapierTempContactForceEvent3d as RapierTempContactForceEvent } from './rapier-types-3d.js';
export type { RapierEventQueue3d as RapierEventQueue } from './rapier-types-3d.js';

// Forward all other exports unchanged (already have correct names)
export type {
  RapierVector3,
  RapierQuaternion,
  RapierRigidBody3d,
  RapierCollider3d,
  RapierWorld3d,
  RapierModule3d,
  RapierCharacterCollision,
  RapierKinematicCharacterController,
} from './rapier-types-3d.js';
