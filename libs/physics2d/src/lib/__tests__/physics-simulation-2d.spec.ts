import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import RAPIER from '@lagless/rapier2d-deterministic-compat';
import { ECSConfig, LocalInputProvider, InputRegistry } from '@lagless/core';
import type { ECSDeps } from '@lagless/core';
import { PhysicsSimulation2d } from '../physics-simulation-2d.js';
import { PhysicsWorldManager2d } from '../physics-world-manager-2d.js';
import { PhysicsConfig2d } from '../physics-config-2d.js';
import type { RapierModule2d } from '../rapier-types-2d.js';

let rapier: RapierModule2d;

beforeAll(async () => {
  await RAPIER.init();
  rapier = RAPIER as unknown as RapierModule2d;
});

const minimalDeps: ECSDeps = {
  components: [],
  singletons: [],
  filters: [],
  inputs: [],
  playerResources: [],
};

function createTestSimulation(opts?: Partial<ECSConfig>) {
  const config = new ECSConfig({
    snapshotRate: 1,
    snapshotHistorySize: 50,
    ...opts,
  });
  const inputProvider = new LocalInputProvider(config, new InputRegistry([]));
  const physicsConfig = new PhysicsConfig2d({ gravityY: -9.81 });
  const worldManager = new PhysicsWorldManager2d(rapier, physicsConfig, config.frameLength);
  const simulation = new PhysicsSimulation2d(config, minimalDeps, inputProvider, worldManager);
  inputProvider.init(simulation);
  return { simulation, config, inputProvider, worldManager };
}

describe('PhysicsSimulation2d', () => {
  let simulation: PhysicsSimulation2d;
  let worldManager: PhysicsWorldManager2d;

  afterEach(() => {
    worldManager?.dispose();
  });

  it('should create simulation with physics world', () => {
    const test = createTestSimulation();
    simulation = test.simulation;
    worldManager = test.worldManager;

    expect(simulation).toBeInstanceOf(PhysicsSimulation2d);
    expect(simulation.tick).toBe(0);
  });

  it('should export physics snapshot', () => {
    const test = createTestSimulation();
    simulation = test.simulation;
    worldManager = test.worldManager;

    worldManager.createDynamicBody();
    const snapshot = simulation.exportPhysicsSnapshot();
    expect(snapshot).toBeInstanceOf(Uint8Array);
    expect(snapshot.byteLength).toBeGreaterThan(0);
  });

  it('should apply external physics state', () => {
    const test = createTestSimulation();
    simulation = test.simulation;
    worldManager = test.worldManager;

    const body = worldManager.createDynamicBody();
    body.setTranslation({ x: 42, y: 0 }, true);

    const snapshot = simulation.exportPhysicsSnapshot();

    // Move body
    body.setTranslation({ x: 999, y: 999 }, true);

    // Apply external state
    simulation.applyExternalPhysicsState(snapshot, 100);

    // Body should be restored
    const restored = worldManager.getBody(body.handle);
    expect(restored.translation().x).toBeCloseTo(42);
  });

  it('should apply external ECS state and reset physics history', () => {
    const test = createTestSimulation();
    simulation = test.simulation;
    worldManager = test.worldManager;

    const ecsState = simulation.mem.exportSnapshot();

    // This should not throw
    simulation.applyExternalState(ecsState, 500);
    expect(simulation.tick).toBe(500);
  });

  it('should not throw "Ticks must be non-decreasing" when applyExternalState to earlier tick', () => {
    const test = createTestSimulation();
    simulation = test.simulation;
    worldManager = test.worldManager;

    // Advance simulation to a high tick so snapshot history has entries
    simulation.registerSystems([{ update: () => worldManager.step() }]);
    simulation.start();
    simulation.update(test.config.frameLength * 500);
    expect(simulation.tick).toBeGreaterThanOrEqual(400);

    // Export state and apply at a much lower tick — this used to crash
    const state = simulation.mem.exportSnapshot();
    expect(() => simulation.applyExternalState(state, 100)).not.toThrow();
    expect(simulation.tick).toBe(100);
  });

  describe('exportStateForTransfer / applyStateFromTransfer', () => {
    it('should roundtrip ECS + Rapier state through combined blob', () => {
      const test = createTestSimulation();
      simulation = test.simulation;
      worldManager = test.worldManager;

      // Create a body at a known position
      const body = worldManager.createDynamicBody();
      body.setTranslation({ x: 7, y: 13 }, true);
      worldManager.createBallCollider(0.5, body);

      // Advance simulation a few ticks
      simulation.registerSystems([{ update: () => worldManager.step() }]);
      simulation.start();
      simulation.update(test.config.frameLength * 5);
      const tickBefore = simulation.tick;

      // Export combined blob
      const blob = simulation.exportStateForTransfer();
      expect(blob.byteLength).toBeGreaterThan(simulation.mem.exportSnapshot().byteLength);

      // Create a fresh simulation and apply the blob
      const test2 = createTestSimulation();
      const sim2 = test2.simulation;
      const wm2 = test2.worldManager;

      sim2.applyStateFromTransfer(blob, tickBefore);

      expect(sim2.tick).toBe(tickBefore);

      // Rapier world should have the body — verify by checking snapshot size
      const emptySnapshotSize = new PhysicsWorldManager2d(
        rapier, new PhysicsConfig2d({ gravityY: -9.81 }), test.config.frameLength,
      ).takeSnapshot().byteLength;
      const restoredSnapshotSize = wm2.takeSnapshot().byteLength;
      expect(restoredSnapshotSize).toBeGreaterThan(emptySnapshotSize);

      wm2.dispose();
    });

    it('should fire state transfer handler', () => {
      const test = createTestSimulation();
      simulation = test.simulation;
      worldManager = test.worldManager;

      const blob = simulation.exportStateForTransfer();

      let handlerTick: number | undefined;
      simulation.addStateTransferHandler((tick) => { handlerTick = tick; });

      simulation.applyStateFromTransfer(blob, 77);
      expect(handlerTick).toBe(77);
    });
  });

  describe('capturePreStartState', () => {
    it('should preserve pre-start bodies when rollback falls through to initial snapshot', () => {
      const test = createTestSimulation();
      simulation = test.simulation;
      worldManager = test.worldManager;

      // Create static bodies AFTER construction (simulating tree colliders)
      const treeBody = worldManager.createFixedBody();
      treeBody.setTranslation({ x: 100, y: 200 }, false);
      worldManager.createBallCollider(5, treeBody);

      // Re-capture initial state so it includes the tree body
      simulation.capturePreStartState();

      // Register a minimal system and start
      simulation.registerSystems([{ update: () => worldManager.step() }]);
      simulation.start();

      // Advance a few ticks so snapshot history has entries at ticks 1..5
      simulation.update(test.config.frameLength * 5);
      expect(simulation.tick).toBeGreaterThanOrEqual(4);

      // Force a rollback to tick 1 — getNearest(1) throws (no snapshot with tick < 1)
      // This uses _initialRapierSnapshot as fallback
      // @ts-expect-error — accessing protected method for testing
      simulation.rollback(1);

      // The tree body should still exist in the Rapier world
      const restored = worldManager.getBody(treeBody.handle);
      expect(restored).toBeDefined();
      expect(restored.translation().x).toBeCloseTo(100);
      expect(restored.translation().y).toBeCloseTo(200);
    });

    it('should lose pre-start bodies without capturePreStartState', () => {
      const test = createTestSimulation();
      simulation = test.simulation;
      worldManager = test.worldManager;

      // Create static bodies AFTER construction but do NOT call capturePreStartState
      const treeBody = worldManager.createFixedBody();
      treeBody.setTranslation({ x: 100, y: 200 }, false);
      worldManager.createBallCollider(5, treeBody);

      // Register a minimal system and start
      simulation.registerSystems([{ update: () => worldManager.step() }]);
      simulation.start();

      // Advance
      simulation.update(test.config.frameLength * 5);

      // Force rollback to tick 1 — falls through to initial snapshot (no tree)
      // @ts-expect-error — accessing protected method for testing
      simulation.rollback(1);

      // The tree body should NOT exist — the initial snapshot had no bodies
      const emptySnap = worldManager.takeSnapshot();
      const freshEmptyWm = new PhysicsWorldManager2d(
        rapier, new PhysicsConfig2d({ gravityY: -9.81 }), test.config.frameLength,
      );
      const freshEmptySnap = freshEmptyWm.takeSnapshot();
      expect(emptySnap.byteLength).toBe(freshEmptySnap.byteLength);
      freshEmptyWm.dispose();
    });
  });

  describe('snapshot and rollback', () => {
    it('should save both ECS and Rapier snapshots on update', () => {
      const test = createTestSimulation();
      simulation = test.simulation;
      worldManager = test.worldManager;

      // Create a body that will move
      const body = worldManager.createDynamicBody();
      body.setTranslation({ x: 0, y: 10 }, true);
      worldManager.createBallCollider(0.5, body);

      // Register a system that steps physics
      simulation.registerSystems([
        { update: () => worldManager.step() },
      ]);

      const config = test.config;
      simulation.start();
      simulation.update(config.frameLength * 5);

      expect(simulation.tick).toBeGreaterThanOrEqual(4);

      // The physics snapshot is taken internally — verify by checking export
      const snap = simulation.exportPhysicsSnapshot();
      expect(snap.byteLength).toBeGreaterThan(0);
    });
  });
});
