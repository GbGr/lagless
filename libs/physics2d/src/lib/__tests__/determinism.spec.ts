import { describe, it, expect, beforeAll } from 'vitest';
import RAPIER from '@lagless/rapier2d-deterministic-compat';
import { ECSConfig, LocalInputProvider, InputRegistry } from '@lagless/core';
import type { ECSDeps } from '@lagless/core';
import { PhysicsSimulation2d } from '../physics-simulation-2d.js';
import { PhysicsWorldManager2d } from '../physics-world-manager-2d.js';
import { PhysicsConfig2d } from '../physics-config-2d.js';
import type { RapierModule2d, RapierRigidBody2d } from '../rapier-types-2d.js';

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

// --- Helpers ---

function createSim(opts?: Partial<ECSConfig>) {
  const config = new ECSConfig({
    snapshotRate: 1,
    snapshotHistorySize: 100,
    ...opts,
  });
  const inputProvider = new LocalInputProvider(config, new InputRegistry([]));
  const physicsConfig = new PhysicsConfig2d({ gravityX: 0, gravityY: 0 });
  const wm = new PhysicsWorldManager2d(rapier, physicsConfig, config.frameLength);
  const sim = new PhysicsSimulation2d(config, minimalDeps, inputProvider, wm);
  inputProvider.init(sim);
  return { sim, config, inputProvider, wm };
}

/** Add N static "tree" bodies at deterministic positions. */
function addTreeBodies(wm: PhysicsWorldManager2d, count: number) {
  for (let i = 0; i < count; i++) {
    const body = wm.createFixedBody();
    body.setTranslation({ x: 100 + i * 50, y: 200 + i * 30 }, false);
    wm.createBallCollider(5, body);
  }
}

/** Compare two Uint8Arrays byte-by-byte. */
function arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// =============================================================================
// 1. Rapier-level determinism tests
// =============================================================================

describe('Rapier snapshot determinism', () => {
  it('should preserve world.timestep after snapshot/restore', () => {
    const customTimestep = 0.005;
    const world = new rapier.World({ x: 0, y: 0 });
    world.timestep = customTimestep;

    // Read back the stored value (may have f32 precision)
    const storedTimestep = world.timestep;

    const snapshot = world.takeSnapshot();
    world.free();

    const restored = rapier.World.restoreSnapshot(snapshot)!;
    expect(restored).not.toBeNull();

    // The restored timestep should match what Rapier stored (f32 precision)
    expect(restored.timestep).toBe(storedTimestep);

    restored.free();
  });

  it('should produce identical handle allocation after snapshot/restore', () => {
    const world = new rapier.World({ x: 0, y: 0 });
    for (let i = 0; i < 5; i++) {
      const desc = rapier.RigidBodyDesc.fixed().setTranslation(i * 10, 0);
      const body = world.createRigidBody(desc);
      world.createCollider(rapier.ColliderDesc.ball(1), body);
    }

    const snapshot = world.takeSnapshot();

    // Create a body in the original world and record handles
    const origBody = world.createRigidBody(rapier.RigidBodyDesc.dynamic());
    const origCollider = world.createCollider(rapier.ColliderDesc.ball(2), origBody);
    const origBodyHandle = origBody.handle;
    const origColliderHandle = origCollider.handle;

    // Restore to pre-creation state and create the same body
    world.free();
    const restored = rapier.World.restoreSnapshot(snapshot)!;
    const newBody = restored.createRigidBody(rapier.RigidBodyDesc.dynamic());
    const newCollider = restored.createCollider(rapier.ColliderDesc.ball(2), newBody);

    expect(newBody.handle).toBe(origBodyHandle);
    expect(newCollider.handle).toBe(origColliderHandle);

    restored.free();
  });

  it('should produce byte-identical snapshots after restore roundtrip', () => {
    const world = new rapier.World({ x: 0, y: 0 });
    world.timestep = 1 / 60;

    const body = world.createRigidBody(rapier.RigidBodyDesc.dynamic().setTranslation(10, 20));
    body.setLinvel({ x: 5, y: -3 }, true);
    world.createCollider(rapier.ColliderDesc.ball(1), body);

    const fixedBody = world.createRigidBody(rapier.RigidBodyDesc.fixed().setTranslation(50, 50));
    world.createCollider(rapier.ColliderDesc.ball(5), fixedBody);

    for (let i = 0; i < 10; i++) world.step();

    const snap1 = world.takeSnapshot();
    world.free();

    const restored = rapier.World.restoreSnapshot(snap1)!;
    const snap2 = restored.takeSnapshot();

    expect(arraysEqual(snap1, snap2)).toBe(true);
    restored.free();
  });

  it('should produce identical physics after snapshot/restore vs continuous', () => {
    // World A: continuous simulation
    const worldA = new rapier.World({ x: 0, y: 0 });
    worldA.timestep = 1 / 60;
    const bodyA = worldA.createRigidBody(rapier.RigidBodyDesc.dynamic().setTranslation(10, 20));
    bodyA.setLinvel({ x: 50, y: -30 }, true);
    bodyA.setLinearDamping(0.1);
    worldA.createCollider(rapier.ColliderDesc.ball(5), bodyA);
    const fixA = worldA.createRigidBody(rapier.RigidBodyDesc.fixed().setTranslation(100, 20));
    worldA.createCollider(rapier.ColliderDesc.ball(10), fixA);

    // Step to tick 5
    for (let i = 0; i < 5; i++) worldA.step();
    const snapAt5 = worldA.takeSnapshot();

    // Continue to tick 20
    for (let i = 5; i < 20; i++) worldA.step();

    // World B: restore from tick 5, continue to tick 20
    const worldB = rapier.World.restoreSnapshot(snapAt5)!;
    for (let i = 5; i < 20; i++) worldB.step();

    const posA = worldA.getRigidBody(bodyA.handle).translation();
    const posB = worldB.getRigidBody(bodyA.handle).translation();
    expect(posB.x).toBe(posA.x);
    expect(posB.y).toBe(posA.y);

    // Snapshot bytes must be identical
    expect(arraysEqual(worldA.takeSnapshot(), worldB.takeSnapshot())).toBe(true);

    worldA.free();
    worldB.free();
  });
});

// =============================================================================
// 2. Simulation-level determinism tests
// =============================================================================

describe('Simulation rollback determinism', () => {
  it('should produce identical ECS hash when two simulations run in parallel', () => {
    const t1 = createSim();
    const t2 = createSim();

    addTreeBodies(t1.wm, 5);
    addTreeBodies(t2.wm, 5);
    t1.sim.capturePreStartState();
    t2.sim.capturePreStartState();

    // Systems that create a body at tick 1 and step physics
    let body1: RapierRigidBody2d | undefined;
    let body2: RapierRigidBody2d | undefined;
    t1.sim.registerSystems([{
      update: () => {
        if (t1.sim.tick === 1 && !body1) {
          const b = t1.wm.createDynamicBody();
          b.setTranslation({ x: 50, y: 50 }, true);
          b.setLinvel({ x: 100, y: -50 }, true);
          b.setLinearDamping(0.1);
          t1.wm.createBallCollider(20, b);
          body1 = b;
        }
        t1.wm.step();
      },
    }]);
    t2.sim.registerSystems([{
      update: () => {
        if (t2.sim.tick === 1 && !body2) {
          const b = t2.wm.createDynamicBody();
          b.setTranslation({ x: 50, y: 50 }, true);
          b.setLinvel({ x: 100, y: -50 }, true);
          b.setLinearDamping(0.1);
          t2.wm.createBallCollider(20, b);
          body2 = b;
        }
        t2.wm.step();
      },
    }]);

    t1.sim.start();
    t2.sim.start();

    for (let i = 0; i < 20; i++) {
      t1.sim.update(t1.config.frameLength);
      t2.sim.update(t2.config.frameLength);
      expect(t1.sim.tick).toBe(t2.sim.tick);
      expect(t1.sim.mem.getHash()).toBe(t2.sim.mem.getHash());
    }

    expect(arraysEqual(t1.wm.takeSnapshot(), t2.wm.takeSnapshot())).toBe(true);

    t1.wm.dispose();
    t2.wm.dispose();
  });

  it('should produce identical state after rollback to initial snapshot', () => {
    // Both sims create a body at tick 1 via system, step physics.
    // Sim A: continuous to tick 10.
    // Sim B: continuous to tick 10, then rollback to tick 1, re-simulate to tick 10.
    // Compare at tick 10.

    function makeSystem(wm: PhysicsWorldManager2d, sim: PhysicsSimulation2d) {
      let body: RapierRigidBody2d | undefined;
      return {
        update: () => {
          if (sim.tick === 1 && !body) {
            body = wm.createDynamicBody();
            body.setTranslation({ x: 50, y: 50 }, true);
            body.setLinvel({ x: 80, y: -40 }, true);
            body.setLinearDamping(0.1);
            wm.createBallCollider(20, body);
          }
          wm.step();
        },
        reset: () => { body = undefined; },
      };
    }

    const tA = createSim();
    addTreeBodies(tA.wm, 3);
    tA.sim.capturePreStartState();
    const sysA = makeSystem(tA.wm, tA.sim);
    tA.sim.registerSystems([sysA]);
    tA.sim.start();

    // Run A to tick 10
    tA.sim.update(tA.config.frameLength * 10);
    expect(tA.sim.tick).toBe(10);

    const tB = createSim();
    addTreeBodies(tB.wm, 3);
    tB.sim.capturePreStartState();
    const sysB = makeSystem(tB.wm, tB.sim);
    tB.sim.registerSystems([sysB]);
    tB.sim.start();

    // Run B to tick 10
    tB.sim.update(tB.config.frameLength * 10);
    expect(tB.sim.tick).toBe(10);

    // Rollback B to tick 1 (falls through to initial snapshot, tick 0)
    sysB.reset(); // clear the body reference so it gets re-created
    // @ts-expect-error — accessing protected method for testing
    tB.sim.rollback(1);
    expect(tB.sim.tick).toBe(0);

    // Re-simulate B: clock still at 10 * frameLength, so update(0) re-runs 0→10
    tB.sim.update(0);
    expect(tB.sim.tick).toBe(10);

    // Both should be identical
    expect(tB.sim.mem.getHash()).toBe(tA.sim.mem.getHash());
    expect(arraysEqual(tB.wm.takeSnapshot(), tA.wm.takeSnapshot())).toBe(true);

    tA.wm.dispose();
    tB.wm.dispose();
  });

  it('should produce identical state after rollback to mid-simulation snapshot', () => {
    function makeSystem(wm: PhysicsWorldManager2d, sim: PhysicsSimulation2d) {
      let body: RapierRigidBody2d | undefined;
      return {
        update: () => {
          if (sim.tick === 1 && !body) {
            body = wm.createDynamicBody();
            body.setTranslation({ x: 50, y: 50 }, true);
            body.setLinvel({ x: 80, y: -40 }, true);
            body.setLinearDamping(0.1);
            wm.createBallCollider(20, body);
          }
          wm.step();
        },
      };
    }

    const tA = createSim();
    addTreeBodies(tA.wm, 3);
    tA.sim.capturePreStartState();
    tA.sim.registerSystems([makeSystem(tA.wm, tA.sim)]);
    tA.sim.start();
    tA.sim.update(tA.config.frameLength * 20);
    expect(tA.sim.tick).toBe(20);

    const tB = createSim();
    addTreeBodies(tB.wm, 3);
    tB.sim.capturePreStartState();
    tB.sim.registerSystems([makeSystem(tB.wm, tB.sim)]);
    tB.sim.start();
    tB.sim.update(tB.config.frameLength * 20);
    expect(tB.sim.tick).toBe(20);

    // Rollback B to tick 10 — getNearest(10) finds snapshot at tick 9
    // @ts-expect-error — accessing protected method for testing
    tB.sim.rollback(10);
    expect(tB.sim.tick).toBe(9);

    // Re-simulate: clock at 20 * fl, so update(0) re-runs 9→20
    tB.sim.update(0);
    expect(tB.sim.tick).toBe(20);

    expect(tB.sim.mem.getHash()).toBe(tA.sim.mem.getHash());
    expect(arraysEqual(tB.wm.takeSnapshot(), tA.wm.takeSnapshot())).toBe(true);

    tA.wm.dispose();
    tB.wm.dispose();
  });

  it('should produce identical state in multi-player rollback scenario', () => {
    // Reproduces the exact multiplayer desync scenario:
    // Sim A: simulates tick 1-5 with Player A only.
    //        Then "PlayerB joined at tick 1" → rollback, re-simulate 1-10 with both.
    // Sim B: has both players from tick 1, runs straight to tick 10.

    function makeSystem(
      wm: PhysicsWorldManager2d,
      sim: PhysicsSimulation2d,
      shouldCreatePlayerB: () => boolean,
    ) {
      let playerA: RapierRigidBody2d | undefined;
      let playerB: RapierRigidBody2d | undefined;
      return {
        update: () => {
          if (sim.tick === 1) {
            if (!playerA) {
              playerA = wm.createDynamicBody();
              playerA.setTranslation({ x: 200, y: 300 }, true);
              playerA.setLinvel({ x: 50, y: 0 }, true);
              playerA.setLinearDamping(0.1);
              wm.createBallCollider(20, playerA);
            }
            if (shouldCreatePlayerB() && !playerB) {
              playerB = wm.createDynamicBody();
              playerB.setTranslation({ x: 300, y: 300 }, true);
              playerB.setLinvel({ x: -50, y: 0 }, true);
              playerB.setLinearDamping(0.1);
              wm.createBallCollider(20, playerB);
            }
          }
          wm.step();
        },
        reset: () => { playerA = undefined; playerB = undefined; },
      };
    }

    // --- Sim A ---
    let playerBJoinedA = false;
    const tA = createSim();
    addTreeBodies(tA.wm, 5);
    tA.sim.capturePreStartState();
    const sysA = makeSystem(tA.wm, tA.sim, () => playerBJoinedA);
    tA.sim.registerSystems([sysA]);
    tA.sim.start();

    // Phase 1: Run 5 ticks with Player A only
    tA.sim.update(tA.config.frameLength * 5);
    expect(tA.sim.tick).toBe(5);

    // Phase 2: "Player B joined at tick 1" — rollback and re-simulate
    playerBJoinedA = true;
    sysA.reset();
    // @ts-expect-error — accessing protected method for testing
    tA.sim.rollback(1);
    expect(tA.sim.tick).toBe(0);

    // Re-simulate to tick 5 (clock still at 5*fl), then advance to tick 10
    tA.sim.update(0); // re-simulates 0→5
    expect(tA.sim.tick).toBe(5);
    tA.sim.update(tA.config.frameLength * 5); // advances to tick 10
    expect(tA.sim.tick).toBe(10);

    // --- Sim B: both players from the start ---
    const tB = createSim();
    addTreeBodies(tB.wm, 5);
    tB.sim.capturePreStartState();
    tB.sim.registerSystems([makeSystem(tB.wm, tB.sim, () => true)]);
    tB.sim.start();
    tB.sim.update(tB.config.frameLength * 10);
    expect(tB.sim.tick).toBe(10);

    // --- Compare ---
    expect(tA.sim.mem.getHash()).toBe(tB.sim.mem.getHash());
    expect(arraysEqual(tA.wm.takeSnapshot(), tB.wm.takeSnapshot())).toBe(true);

    tA.wm.dispose();
    tB.wm.dispose();
  });

  it('should produce identical state after state transfer', () => {
    function makeSystem(wm: PhysicsWorldManager2d, sim: PhysicsSimulation2d) {
      let body: RapierRigidBody2d | undefined;
      return {
        update: () => {
          if (sim.tick === 1 && !body) {
            body = wm.createDynamicBody();
            body.setTranslation({ x: 50, y: 50 }, true);
            body.setLinvel({ x: 80, y: -40 }, true);
            body.setLinearDamping(0.1);
            wm.createBallCollider(20, body);
          }
          wm.step();
        },
      };
    }

    // Sim A runs to tick 15, exports state
    const tA = createSim();
    addTreeBodies(tA.wm, 3);
    tA.sim.capturePreStartState();
    tA.sim.registerSystems([makeSystem(tA.wm, tA.sim)]);
    tA.sim.start();
    tA.sim.update(tA.config.frameLength * 15);
    const tickAtTransfer = tA.sim.tick;

    const blob = tA.sim.exportStateForTransfer();

    // Sim B receives state transfer
    const tB = createSim();
    tB.sim.registerSystems([makeSystem(tB.wm, tB.sim)]);
    tB.sim.applyStateFromTransfer(blob, tickAtTransfer);

    // Both continue for 10 more ticks
    tA.sim.update(tA.config.frameLength * 10);
    tB.sim.update(tB.config.frameLength * 10);

    expect(tA.sim.tick).toBe(tB.sim.tick);
    expect(tA.sim.mem.getHash()).toBe(tB.sim.mem.getHash());
    expect(arraysEqual(tA.wm.takeSnapshot(), tB.wm.takeSnapshot())).toBe(true);

    tA.wm.dispose();
    tB.wm.dispose();
  });
});
