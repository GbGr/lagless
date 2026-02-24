import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import RAPIER from '@dimforge/rapier2d-compat';
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
