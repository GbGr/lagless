import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import RAPIER from '@dimforge/rapier3d-deterministic-compat';
import { PhysicsWorldManager3d } from '../physics-world-manager-3d.js';
import { PhysicsConfig3d } from '../physics-config-3d.js';
import type { RapierModule3d } from '../rapier-types-3d.js';

let rapier: RapierModule3d;

beforeAll(async () => {
  await RAPIER.init();
  rapier = RAPIER as unknown as RapierModule3d;
});

const FRAME_LENGTH_MS = 1000 / 60; // 60fps

function createManager(config?: Partial<PhysicsConfig3d>) {
  return new PhysicsWorldManager3d(rapier, new PhysicsConfig3d(config), FRAME_LENGTH_MS);
}

describe('PhysicsWorldManager3d', () => {
  let manager: PhysicsWorldManager3d;

  afterEach(() => {
    manager?.dispose();
    manager = undefined!;
  });

  it('should create world with gravity', () => {
    manager = createManager({ gravityY: -20 });
    expect(manager.world).toBeDefined();
  });

  it('should create dynamic body', () => {
    manager = createManager();
    const body = manager.createDynamicBody();
    expect(body.handle).toBeTypeOf('number');
    expect(body.isDynamic()).toBe(true);
  });

  it('should create fixed body', () => {
    manager = createManager();
    const body = manager.createFixedBody();
    expect(body.handle).toBeTypeOf('number');
    expect(body.isFixed()).toBe(true);
  });

  it('should create kinematic body', () => {
    manager = createManager();
    const body = manager.createKinematicPositionBody();
    expect(body.handle).toBeTypeOf('number');
    expect(body.isKinematic()).toBe(true);
  });

  it('should create ball collider attached to body', () => {
    manager = createManager();
    const body = manager.createDynamicBody();
    const collider = manager.createBallCollider(1.0, body);
    expect(collider.handle).toBeTypeOf('number');
    expect(collider.parent()?.handle).toBe(body.handle);
  });

  it('should create cuboid collider', () => {
    manager = createManager();
    const body = manager.createDynamicBody();
    const collider = manager.createCuboidCollider(1, 2, 3, body);
    expect(collider.handle).toBeTypeOf('number');
  });

  it('should create capsule collider', () => {
    manager = createManager();
    const body = manager.createDynamicBody();
    const collider = manager.createCapsuleCollider(0.5, 0.25, body);
    expect(collider.handle).toBeTypeOf('number');
  });

  it('should create cylinder collider', () => {
    manager = createManager();
    const body = manager.createDynamicBody();
    const collider = manager.createCylinderCollider(1.0, 0.5, body);
    expect(collider.handle).toBeTypeOf('number');
    expect(collider.parent()?.handle).toBe(body.handle);
  });

  it('should create cone collider', () => {
    manager = createManager();
    const body = manager.createDynamicBody();
    const collider = manager.createConeCollider(1.0, 0.5, body);
    expect(collider.handle).toBeTypeOf('number');
    expect(collider.parent()?.handle).toBe(body.handle);
  });

  it('should create convex hull collider', () => {
    manager = createManager();
    const body = manager.createDynamicBody();
    // A simple tetrahedron
    const points = new Float32Array([
      0, 0, 0,
      1, 0, 0,
      0, 1, 0,
      0, 0, 1,
    ]);
    const collider = manager.createConvexHullCollider(points, body);
    expect(collider).not.toBeNull();
    expect(collider!.handle).toBeTypeOf('number');
    expect(collider!.parent()?.handle).toBe(body.handle);
  });

  it('should take non-empty snapshot', () => {
    manager = createManager();
    manager.createDynamicBody();
    const snapshot = manager.takeSnapshot();
    expect(snapshot).toBeInstanceOf(Uint8Array);
    expect(snapshot.byteLength).toBeGreaterThan(0);
  });

  it('should restore snapshot with correct body positions', () => {
    manager = createManager();
    const body = manager.createDynamicBody();
    body.setTranslation({ x: 5, y: 10, z: 15 }, true);

    const snapshot = manager.takeSnapshot();

    // Move body elsewhere
    body.setTranslation({ x: 100, y: 200, z: 300 }, true);

    // Restore
    manager.restoreSnapshot(snapshot);

    // After restore, get the body back (same handle)
    const restored = manager.getBody(body.handle);
    const pos = restored.translation();
    expect(pos.x).toBeCloseTo(5);
    expect(pos.y).toBeCloseTo(10);
    expect(pos.z).toBeCloseTo(15);
  });

  it('should remove body from world', () => {
    manager = createManager();
    const body = manager.createDynamicBody();

    // Create a second body to verify it survives removal of the first
    const body2 = manager.createDynamicBody();
    body2.setTranslation({ x: 99, y: 99, z: 99 }, true);

    manager.removeBody(body.handle);

    // The second body should still be accessible
    const restored = manager.getBody(body2.handle);
    expect(restored.translation().x).toBeCloseTo(99);
  });

  it('should step the physics world', () => {
    manager = createManager({ gravityY: -9.81 });
    const body = manager.createDynamicBody();
    body.setTranslation({ x: 0, y: 10, z: 0 }, true);
    manager.createBallCollider(0.5, body);

    const initialY = body.translation().y;
    manager.step();
    const afterStepY = manager.getBody(body.handle).translation().y;

    // Body should have fallen due to gravity
    expect(afterStepY).toBeLessThan(initialY);
  });

  it('should expose substeps count', () => {
    manager = createManager({ substeps: 4 });
    expect(manager.substeps).toBe(4);
  });

  it('should default to 1 substep', () => {
    manager = createManager();
    expect(manager.substeps).toBe(1);
  });

  it('should produce more accurate results with more substeps', () => {
    // With more substeps, the semi-implicit Euler integration is more accurate.
    // A falling body should accumulate slightly different displacement
    // due to the finer time discretization.

    // 1 substep
    const m1 = new PhysicsWorldManager3d(rapier, new PhysicsConfig3d({ gravityY: -9.81, substeps: 1 }), FRAME_LENGTH_MS);
    const b1 = m1.createDynamicBody();
    b1.setTranslation({ x: 0, y: 100, z: 0 }, true);
    m1.createBallCollider(0.5, b1);

    // 8 substeps
    const m8 = new PhysicsWorldManager3d(rapier, new PhysicsConfig3d({ gravityY: -9.81, substeps: 8 }), FRAME_LENGTH_MS);
    const b8 = m8.createDynamicBody();
    b8.setTranslation({ x: 0, y: 100, z: 0 }, true);
    m8.createBallCollider(0.5, b8);

    // Step both for 60 frames (1 second)
    for (let i = 0; i < 60; i++) {
      m1.step();
      m8.step();
    }

    const y1 = m1.getBody(b1.handle).translation().y;
    const y8 = m8.getBody(b8.handle).translation().y;

    // Both should have fallen significantly
    expect(y1).toBeLessThan(100);
    expect(y8).toBeLessThan(100);

    // They should produce different results (different integration accuracy)
    expect(y1).not.toBeCloseTo(y8, 3);

    m1.dispose();
    m8.dispose();
  });

  it('should produce deterministic results with substeps', () => {
    const config = new PhysicsConfig3d({ gravityY: -9.81, substeps: 4 });

    const m1 = new PhysicsWorldManager3d(rapier, config, FRAME_LENGTH_MS);
    const b1 = m1.createDynamicBody();
    b1.setTranslation({ x: 0, y: 10, z: 0 }, true);
    m1.createBallCollider(0.5, b1);

    const m2 = new PhysicsWorldManager3d(rapier, config, FRAME_LENGTH_MS);
    const b2 = m2.createDynamicBody();
    b2.setTranslation({ x: 0, y: 10, z: 0 }, true);
    m2.createBallCollider(0.5, b2);

    for (let i = 0; i < 30; i++) {
      m1.step();
      m2.step();
    }

    const snap1 = m1.takeSnapshot();
    const snap2 = m2.takeSnapshot();

    expect(snap1.byteLength).toBe(snap2.byteLength);
    expect(Buffer.from(snap1).equals(Buffer.from(snap2))).toBe(true);

    m1.dispose();
    m2.dispose();
  });
});
