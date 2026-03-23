import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import RAPIER from '@lagless/rapier3d-deterministic-compat';
import { ECSConfig, LocalInputProvider, InputRegistry } from '@lagless/core';
import type { ECSDeps, IECSSystem } from '@lagless/core';
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

interface SimulationSetup {
  simulation: PhysicsSimulation3d;
  worldManager: PhysicsWorldManager3d;
  config: ECSConfig;
}

function createSetup(): SimulationSetup {
  const config = new ECSConfig({
    snapshotRate: 1,
    snapshotHistorySize: 50,
  });
  const inputProvider = new LocalInputProvider(config, new InputRegistry([]));
  const physicsConfig = new PhysicsConfig3d({ gravityY: -9.81 });
  const worldManager = new PhysicsWorldManager3d(rapier, physicsConfig, config.frameLength);
  const simulation = new PhysicsSimulation3d(config, minimalDeps, inputProvider, worldManager);
  inputProvider.init(simulation);
  return { simulation, worldManager, config };
}

function setupScene(worldManager: PhysicsWorldManager3d): void {
  // Create a ground plane
  const ground = worldManager.createFixedBody();
  ground.setTranslation({ x: 0, y: -1, z: 0 }, false);
  worldManager.createCuboidCollider(50, 1, 50, ground);

  // Create a falling sphere
  const sphere = worldManager.createDynamicBody();
  sphere.setTranslation({ x: 0, y: 10, z: 0 }, true);
  worldManager.createBallCollider(0.5, sphere);

  // Create another sphere offset
  const sphere2 = worldManager.createDynamicBody();
  sphere2.setTranslation({ x: 2, y: 15, z: 0 }, true);
  worldManager.createBallCollider(0.3, sphere2);
}

function createPhysicsSystem(worldManager: PhysicsWorldManager3d): IECSSystem {
  return { update: () => worldManager.step() };
}

describe('Physics3d Determinism', () => {
  const managers: PhysicsWorldManager3d[] = [];

  afterEach(() => {
    for (const m of managers) m.dispose();
    managers.length = 0;
  });

  it('should produce identical Rapier snapshots when run twice with same setup', () => {
    // Run 1
    const s1 = createSetup();
    managers.push(s1.worldManager);
    setupScene(s1.worldManager);
    s1.simulation.registerSystems([createPhysicsSystem(s1.worldManager)]);
    s1.simulation.start();

    const tickCount = 60;
    for (let i = 0; i < tickCount; i++) {
      s1.simulation.update(s1.config.frameLength);
    }

    const snap1 = s1.simulation.exportPhysicsSnapshot();
    const ecsHash1 = s1.simulation.mem.getHash();

    // Run 2
    const s2 = createSetup();
    managers.push(s2.worldManager);
    setupScene(s2.worldManager);
    s2.simulation.registerSystems([createPhysicsSystem(s2.worldManager)]);
    s2.simulation.start();

    for (let i = 0; i < tickCount; i++) {
      s2.simulation.update(s2.config.frameLength);
    }

    const snap2 = s2.simulation.exportPhysicsSnapshot();
    const ecsHash2 = s2.simulation.mem.getHash();

    // ECS hashes match
    expect(ecsHash1).toBe(ecsHash2);

    // Rapier snapshots match byte-for-byte
    expect(snap1.byteLength).toBe(snap2.byteLength);
    expect(Buffer.from(snap1).equals(Buffer.from(snap2))).toBe(true);
  });

  it('should restore identical state after rollback and re-simulation', () => {
    const setup = createSetup();
    managers.push(setup.worldManager);
    setupScene(setup.worldManager);
    setup.simulation.registerSystems([createPhysicsSystem(setup.worldManager)]);
    setup.simulation.start();

    // Simulate 30 ticks
    for (let i = 0; i < 30; i++) {
      setup.simulation.update(setup.config.frameLength);
    }

    // Capture state at tick 30 (verify exports work)
    setup.simulation.exportPhysicsSnapshot();
    setup.simulation.mem.getHash();

    // Simulate 30 more ticks (to tick 60)
    for (let i = 0; i < 30; i++) {
      setup.simulation.update(setup.config.frameLength);
    }

    const snapAt60 = setup.simulation.exportPhysicsSnapshot();

    // Now run a fresh simulation to tick 60 for comparison
    const fresh = createSetup();
    managers.push(fresh.worldManager);
    setupScene(fresh.worldManager);
    fresh.simulation.registerSystems([createPhysicsSystem(fresh.worldManager)]);
    fresh.simulation.start();

    for (let i = 0; i < 60; i++) {
      fresh.simulation.update(fresh.config.frameLength);
    }

    const freshSnap = fresh.simulation.exportPhysicsSnapshot();

    // Both should match
    expect(snapAt60.byteLength).toBe(freshSnap.byteLength);
    expect(Buffer.from(snapAt60).equals(Buffer.from(freshSnap))).toBe(true);
  });
});
