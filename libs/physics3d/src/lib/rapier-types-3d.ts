/**
 * Minimal type abstractions for Rapier 3D API.
 * Works with both @dimforge/rapier3d-deterministic and @dimforge/rapier3d-deterministic-compat.
 * The consumer project injects the actual RAPIER module at runtime.
 */

export interface RapierVector3 {
  x: number;
  y: number;
  z: number;
}

export interface RapierQuaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface RapierRigidBody3d {
  handle: number;
  translation(): RapierVector3;
  rotation(): RapierQuaternion;
  linvel(): RapierVector3;
  angvel(): RapierVector3;
  setTranslation(translation: RapierVector3, wakeUp: boolean): void;
  setRotation(rotation: RapierQuaternion, wakeUp: boolean): void;
  setLinvel(linvel: RapierVector3, wakeUp: boolean): void;
  setAngvel(angvel: RapierVector3, wakeUp: boolean): void;
  setLinearDamping(damping: number): void;
  setAngularDamping(damping: number): void;
  setAdditionalMass(mass: number): void;
  isKinematic(): boolean;
  isDynamic(): boolean;
  isFixed(): boolean;
  setNextKinematicTranslation(translation: RapierVector3): void;
  setNextKinematicRotation(rotation: RapierQuaternion): void;
}

export interface RapierCollider3d {
  handle: number;
  parent(): RapierRigidBody3d | null;
  isSensor(): boolean;
  collisionGroups(): number;
  setCollisionGroups(groups: number): void;
  setActiveEvents(events: number): void;
  setSensor(isSensor: boolean): void;
}

export interface RapierRigidBodyDesc3d {
  setTranslation(x: number, y: number, z: number): RapierRigidBodyDesc3d;
  setRotation(rotation: RapierQuaternion): RapierRigidBodyDesc3d;
  setLinearDamping(damping: number): RapierRigidBodyDesc3d;
  setAngularDamping(damping: number): RapierRigidBodyDesc3d;
  setAdditionalMass(mass: number): RapierRigidBodyDesc3d;
}

export interface RapierColliderDesc3d {
  setTranslation(x: number, y: number, z: number): RapierColliderDesc3d;
  setRotation(rotation: RapierQuaternion): RapierColliderDesc3d;
  setRestitution(restitution: number): RapierColliderDesc3d;
  setFriction(friction: number): RapierColliderDesc3d;
  setDensity(density: number): RapierColliderDesc3d;
  setMass(mass: number): RapierColliderDesc3d;
  setSensor(isSensor: boolean): RapierColliderDesc3d;
  setCollisionGroups(groups: number): RapierColliderDesc3d;
  setActiveEvents(events: number): RapierColliderDesc3d;
}

export interface RapierEventQueue3d {
  free(): void;
  drainCollisionEvents(f: (h1: number, h2: number, started: boolean) => void): void;
  drainContactForceEvents(f: (event: RapierTempContactForceEvent3d) => void): void;
  clear(): void;
}

export interface RapierTempContactForceEvent3d {
  collider1(): number;
  collider2(): number;
  totalForceMagnitude(): number;
  maxForceMagnitude(): number;
  maxForceDirection(): RapierVector3;
}

export interface RapierWorld3d {
  timestep: number;
  step(eventQueue?: RapierEventQueue3d): void;
  free(): void;
  takeSnapshot(): Uint8Array;
  getRigidBody(handle: number): RapierRigidBody3d;
  getCollider(handle: number): RapierCollider3d;
  createRigidBody(desc: RapierRigidBodyDesc3d): RapierRigidBody3d;
  createCollider(desc: RapierColliderDesc3d, parent?: RapierRigidBody3d): RapierCollider3d;
  removeRigidBody(body: RapierRigidBody3d): void;
  removeCollider(collider: RapierCollider3d, wakeUp: boolean): void;
  createCharacterController(offset: number): RapierKinematicCharacterController;
}

// ─── Kinematic Character Controller ────────────────────────

export interface RapierCharacterCollision {
  toi: number;
  witness1: RapierVector3;
  witness2: RapierVector3;
  normal1: RapierVector3;
  normal2: RapierVector3;
  translationDeltaApplied: RapierVector3;
  translationDeltaRemaining: RapierVector3;
}

export interface RapierKinematicCharacterController {
  setUp(up: RapierVector3): void;
  setMaxSlopeClimbAngle(angle: number): void;
  setMinSlopeSlideAngle(angle: number): void;
  enableAutostep(maxHeight: number, minWidth: number, includeDynamicBodies: boolean): void;
  disableAutostep(): void;
  enableSnapToGround(distance: number): void;
  disableSnapToGround(): void;
  setSlideEnabled(enabled: boolean): void;
  setCharacterMass(mass: number): void;
  setApplyImpulsesToDynamicBodies(apply: boolean): void;
  computeColliderMovement(
    collider: RapierCollider3d,
    desiredTranslation: RapierVector3,
    filterFlags?: number,
    filterGroups?: number,
  ): void;
  computedMovement(): RapierVector3;
  computedGrounded(): boolean;
  numComputedCollisions(): number;
  computedCollision(index: number): RapierCharacterCollision | null;
  free(): void;
}

export interface RapierModule3d {
  World: {
    new (gravity: RapierVector3): RapierWorld3d;
    restoreSnapshot(data: Uint8Array): RapierWorld3d | null;
  };
  RigidBodyDesc: {
    dynamic(): RapierRigidBodyDesc3d;
    fixed(): RapierRigidBodyDesc3d;
    kinematicPositionBased(): RapierRigidBodyDesc3d;
    kinematicVelocityBased(): RapierRigidBodyDesc3d;
  };
  ColliderDesc: {
    ball(radius: number): RapierColliderDesc3d;
    cuboid(hx: number, hy: number, hz: number): RapierColliderDesc3d;
    capsule(halfHeight: number, radius: number): RapierColliderDesc3d;
    trimesh(vertices: Float32Array, indices: Uint32Array): RapierColliderDesc3d;
    cylinder(halfHeight: number, radius: number): RapierColliderDesc3d;
    cone(halfHeight: number, radius: number): RapierColliderDesc3d;
    convexHull(points: Float32Array): RapierColliderDesc3d | null;
  };
  EventQueue: {
    new (autoDrain: boolean): RapierEventQueue3d;
  };
  ActiveEvents: {
    NONE: number;
    COLLISION_EVENTS: number;
    CONTACT_FORCE_EVENTS: number;
  };
  QueryFilterFlags: {
    ONLY_DYNAMIC: number;
    ONLY_KINEMATIC: number;
    ONLY_FIXED: number;
    EXCLUDE_DYNAMIC: number;
    EXCLUDE_KINEMATIC: number;
    EXCLUDE_FIXED: number;
    EXCLUDE_SENSORS: number;
    EXCLUDE_SOLIDS: number;
  };
}
