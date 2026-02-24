/**
 * Minimal type abstractions for Rapier 3D API.
 * Works with both @dimforge/rapier3d and @dimforge/rapier3d-compat.
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
}

export interface RapierRigidBodyDesc {
  setTranslation(x: number, y: number, z: number): RapierRigidBodyDesc;
  setRotation(rotation: RapierQuaternion): RapierRigidBodyDesc;
  setLinearDamping(damping: number): RapierRigidBodyDesc;
  setAngularDamping(damping: number): RapierRigidBodyDesc;
  setAdditionalMass(mass: number): RapierRigidBodyDesc;
}

export interface RapierColliderDesc {
  setTranslation(x: number, y: number, z: number): RapierColliderDesc;
  setRotation(rotation: RapierQuaternion): RapierColliderDesc;
  setRestitution(restitution: number): RapierColliderDesc;
  setFriction(friction: number): RapierColliderDesc;
  setDensity(density: number): RapierColliderDesc;
  setMass(mass: number): RapierColliderDesc;
  setSensor(isSensor: boolean): RapierColliderDesc;
}

export interface RapierWorld3d {
  timestep: number;
  step(): void;
  free(): void;
  takeSnapshot(): Uint8Array;
  getRigidBody(handle: number): RapierRigidBody3d;
  getCollider(handle: number): RapierCollider3d;
  createRigidBody(desc: RapierRigidBodyDesc): RapierRigidBody3d;
  createCollider(desc: RapierColliderDesc, parent?: RapierRigidBody3d): RapierCollider3d;
  removeRigidBody(body: RapierRigidBody3d): void;
  removeCollider(collider: RapierCollider3d, wakeUp: boolean): void;
}

export interface RapierModule3d {
  World: {
    new (gravity: RapierVector3): RapierWorld3d;
    restoreSnapshot(data: Uint8Array): RapierWorld3d | null;
  };
  RigidBodyDesc: {
    dynamic(): RapierRigidBodyDesc;
    fixed(): RapierRigidBodyDesc;
    kinematicPositionBased(): RapierRigidBodyDesc;
    kinematicVelocityBased(): RapierRigidBodyDesc;
  };
  ColliderDesc: {
    ball(radius: number): RapierColliderDesc;
    cuboid(hx: number, hy: number, hz: number): RapierColliderDesc;
    capsule(halfHeight: number, radius: number): RapierColliderDesc;
    trimesh(vertices: Float32Array, indices: Uint32Array): RapierColliderDesc;
    cylinder(halfHeight: number, radius: number): RapierColliderDesc;
    cone(halfHeight: number, radius: number): RapierColliderDesc;
  };
}
