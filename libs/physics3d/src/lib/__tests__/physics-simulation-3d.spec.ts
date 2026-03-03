import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import RAPIER from '@dimforge/rapier3d-deterministic-compat';
import { ECSConfig, LocalInputProvider, InputRegistry } from '@lagless/core';
import type { ECSDeps } from '@lagless/core';
import { PhysicsSimulation3d } from '../physics-simulation-3d.js';
import { PhysicsWorldManager3d } from '../physics-world-manager-3d.js';
import { PhysicsConfig3d } from '../physics-config-3d.js';
import type { RapierModule3d } from '../rapier-types-3d.js';

let rapier: RapierModule3d;

beforeAll(async () => {
  await RAPIER.init();
  rapier = RAPIER as unknown as RapierModule3d;
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
  const physicsConfig = new PhysicsConfig3d({ gravityY: -9.81 });
  const worldManager = new PhysicsWorldManager3d(rapier, physicsConfig, config.frameLength);
  const simulation = new PhysicsSimulation3d(config, minimalDeps, inputProvider, worldManager);
  inputProvider.init(simulation);
  return { simulation, config, inputProvider, worldManager };
}

describe('PhysicsSimulation3d', () => {
  let simulation: PhysicsSimulation3d;
  let worldManager: PhysicsWorldManager3d;

  afterEach(() => {
    worldManager?.dispose();
  });

  it('should create simulation with physics world', () => {
    const test = createTestSimulation();
    simulation = test.simulation;
    worldManager = test.worldManager;

    expect(simulation).toBeInstanceOf(PhysicsSimulation3d);
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
    body.setTranslation({ x: 42, y: 0, z: 0 }, true);

    const snapshot = simulation.exportPhysicsSnapshot();

    // Move body
    body.setTranslation({ x: 999, y: 999, z: 999 }, true);

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
      body.setTranslation({ x: 7, y: 13, z: -3 }, true);
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
      // (a world with bodies produces a larger snapshot than an empty world)
      const emptySnapshotSize = new PhysicsWorldManager3d(
        rapier, new PhysicsConfig3d({ gravityY: -9.81 }), test.config.frameLength,
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

  describe('snapshot and rollback', () => {
    it('should save both ECS and Rapier snapshots on update', () => {
      const test = createTestSimulation();
      simulation = test.simulation;
      worldManager = test.worldManager;

      // Create a body that will move
      const body = worldManager.createDynamicBody();
      body.setTranslation({ x: 0, y: 10, z: 0 }, true);
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
