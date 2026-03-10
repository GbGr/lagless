/**
 * Minimal type abstractions for Rapier 2D API.
 * Works with @lagless/rapier2d-deterministic-compat.
 * The consumer project injects the actual RAPIER module at runtime.
 */

export interface RapierVector2 {
  x: number;
  y: number;
}

export interface RapierRigidBody2d {
  handle: number;
  translation(): RapierVector2;
  rotation(): number;
  linvel(): RapierVector2;
  angvel(): number;
  setTranslation(translation: RapierVector2, wakeUp: boolean): void;
  setRotation(angle: number, wakeUp: boolean): void;
  setLinvel(linvel: RapierVector2, wakeUp: boolean): void;
  setAngvel(angvel: number, wakeUp: boolean): void;
  setLinearDamping(damping: number): void;
  setAngularDamping(damping: number): void;
  setAdditionalMass(mass: number): void;
  isKinematic(): boolean;
  isDynamic(): boolean;
  isFixed(): boolean;
  setNextKinematicTranslation(translation: RapierVector2): void;
  setNextKinematicRotation(angle: number): void;
}

export interface RapierCollider2d {
  handle: number;
  parent(): RapierRigidBody2d | null;
  isSensor(): boolean;
  collisionGroups(): number;
  setCollisionGroups(groups: number): void;
  setActiveEvents(events: number): void;
  setSensor(isSensor: boolean): void;
}

export interface RapierRigidBodyDesc2d {
  setTranslation(x: number, y: number): RapierRigidBodyDesc2d;
  setRotation(angle: number): RapierRigidBodyDesc2d;
  setLinearDamping(damping: number): RapierRigidBodyDesc2d;
  setAngularDamping(damping: number): RapierRigidBodyDesc2d;
  setAdditionalMass(mass: number): RapierRigidBodyDesc2d;
}

export interface RapierColliderDesc2d {
  setTranslation(x: number, y: number): RapierColliderDesc2d;
  setRotation(angle: number): RapierColliderDesc2d;
  setRestitution(restitution: number): RapierColliderDesc2d;
  setFriction(friction: number): RapierColliderDesc2d;
  setDensity(density: number): RapierColliderDesc2d;
  setMass(mass: number): RapierColliderDesc2d;
  setSensor(isSensor: boolean): RapierColliderDesc2d;
  setCollisionGroups(groups: number): RapierColliderDesc2d;
  setActiveEvents(events: number): RapierColliderDesc2d;
}

export interface RapierEventQueue {
  free(): void;
  drainCollisionEvents(f: (h1: number, h2: number, started: boolean) => void): void;
  drainContactForceEvents(f: (event: RapierTempContactForceEvent2d) => void): void;
  clear(): void;
}

export interface RapierTempContactForceEvent2d {
  collider1(): number;
  collider2(): number;
  totalForceMagnitude(): number;
  maxForceMagnitude(): number;
  maxForceDirection(): RapierVector2;
}

export interface DebugRenderBuffers {
  vertices: Float32Array;
  colors: Float32Array;
}

export interface RapierIntegrationParameters {
  warmstartCoefficient: number;
}

export interface RapierWorld2d {
  timestep: number;
  integrationParameters: RapierIntegrationParameters;
  step(eventQueue?: RapierEventQueue): void;
  free(): void;
  takeSnapshot(): Uint8Array;
  debugRender(): DebugRenderBuffers;
  getRigidBody(handle: number): RapierRigidBody2d;
  getCollider(handle: number): RapierCollider2d;
  createRigidBody(desc: RapierRigidBodyDesc2d): RapierRigidBody2d;
  createCollider(desc: RapierColliderDesc2d, parent?: RapierRigidBody2d): RapierCollider2d;
  removeRigidBody(body: RapierRigidBody2d): void;
  removeCollider(collider: RapierCollider2d, wakeUp: boolean): void;
  createCharacterController(offset: number): RapierKinematicCharacterController2d;
}

// ─── Kinematic Character Controller (2D) ────────────────────────

export interface RapierCharacterCollision2d {
  toi: number;
  witness1: RapierVector2;
  witness2: RapierVector2;
  normal1: RapierVector2;
  normal2: RapierVector2;
  translationDeltaApplied: RapierVector2;
  translationDeltaRemaining: RapierVector2;
}

export interface RapierKinematicCharacterController2d {
  setUp(up: RapierVector2): void;
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
    collider: RapierCollider2d,
    desiredTranslation: RapierVector2,
    filterFlags?: number,
    filterGroups?: number,
  ): void;
  computedMovement(): RapierVector2;
  computedGrounded(): boolean;
  numComputedCollisions(): number;
  computedCollision(index: number): RapierCharacterCollision2d | null;
  free(): void;
}

export interface RapierModule2d {
  World: {
    new (gravity: RapierVector2): RapierWorld2d;
    restoreSnapshot(data: Uint8Array): RapierWorld2d | null;
  };
  RigidBodyDesc: {
    dynamic(): RapierRigidBodyDesc2d;
    fixed(): RapierRigidBodyDesc2d;
    kinematicPositionBased(): RapierRigidBodyDesc2d;
    kinematicVelocityBased(): RapierRigidBodyDesc2d;
  };
  ColliderDesc: {
    ball(radius: number): RapierColliderDesc2d;
    cuboid(hx: number, hy: number): RapierColliderDesc2d;
    capsule(halfHeight: number, radius: number): RapierColliderDesc2d;
    trimesh(vertices: Float32Array, indices: Uint32Array): RapierColliderDesc2d;
    convexHull(points: Float32Array): RapierColliderDesc2d | null;
  };
  EventQueue: {
    new (autoDrain: boolean): RapierEventQueue;
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
