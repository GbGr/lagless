/**
 * Targeted test: Does Rapier snapshot/restore introduce drift over many cycles?
 *
 * Hypothesis: Rapier's World.restoreSnapshot() does not perfectly preserve all
 * internal state (solver warm-starting, island graph, broad-phase BVH).
 * Over many rollback cycles, tiny errors accumulate and cause visible position
 * divergence — matching the real-world desync observed in 2d-map-test.
 *
 * This test creates a scenario close to the real game:
 * - Dynamic body with linear damping
 * - Static obstacle bodies (trees)
 * - Velocity set every few ticks (MoveInput pattern)
 * - Body collides with static obstacles
 * - Many rollback cycles (300+)
 *
 * If this test FAILS, it proves Rapier snapshot/restore is not bit-exact.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import RAPIER from '@lagless/rapier2d-deterministic-compat';
import type { RapierModule2d, RapierWorld2d } from '../rapier-types-2d.js';

let rapier: RapierModule2d;

beforeAll(async () => {
  await RAPIER.init();
  rapier = RAPIER as unknown as RapierModule2d;
});

function createWorld(): RapierWorld2d {
  const world = new rapier.World({ x: 0, y: 0 });
  world.timestep = 1 / 60;
  return world;
}

function addStaticObstacles(world: RapierWorld2d, count: number) {
  for (let i = 0; i < count; i++) {
    const bodyDesc = rapier.RigidBodyDesc.fixed()
      .setTranslation(50 + i * 40, 50 + (i % 3) * 30);
    const body = world.createRigidBody(bodyDesc);
    const colliderDesc = rapier.ColliderDesc.ball(10);
    world.createCollider(colliderDesc, body);
  }
}

function addDynamicBody(world: RapierWorld2d, x: number, y: number) {
  const bodyDesc = rapier.RigidBodyDesc.dynamic()
    .setTranslation(x, y);
  const body = world.createRigidBody(bodyDesc);
  body.setLinearDamping(0.1);
  const colliderDesc = rapier.ColliderDesc.ball(20);
  colliderDesc.setFriction(0);
  colliderDesc.setRestitution(1);
  world.createCollider(colliderDesc, body);
  return body.handle;
}

describe('Rapier snapshot/restore drift', () => {
  it('single restore cycle should produce identical step result', () => {
    // Create world, add bodies, step for a while
    const world = createWorld();
    addStaticObstacles(world, 20);
    const handle = addDynamicBody(world, 200, 200);

    // Step with varying velocity (simulating MoveInput)
    for (let tick = 0; tick < 100; tick++) {
      const body = world.getRigidBody(handle);
      if (tick % 3 === 0) {
        const vx = Math.fround(Math.sin(tick * 0.5) * 100);
        const vy = Math.fround(Math.cos(tick * 0.5) * 100);
        body.setLinvel({ x: vx, y: vy }, true);
      }
      world.step();
    }

    // Take snapshot
    const snapshot = world.takeSnapshot();

    // Step one more tick (reference)
    const body = world.getRigidBody(handle);
    body.setLinvel({ x: 50, y: -30 }, true);
    world.step();
    const refPos = world.getRigidBody(handle).translation();
    const refVel = world.getRigidBody(handle).linvel();

    // Restore and step the same tick
    world.free();
    const restored = rapier.World.restoreSnapshot(snapshot)!;
    expect(restored).not.toBeNull();

    const body2 = restored.getRigidBody(handle);
    body2.setLinvel({ x: 50, y: -30 }, true);
    restored.step();
    const restoredPos = restored.getRigidBody(handle).translation();
    const restoredVel = restored.getRigidBody(handle).linvel();

    expect(restoredPos.x).toBe(refPos.x);
    expect(restoredPos.y).toBe(refPos.y);
    expect(restoredVel.x).toBe(refVel.x);
    expect(restoredVel.y).toBe(refVel.y);

    restored.free();
  });

  it('multiple restore cycles should not accumulate drift', () => {
    // This is the key test: restore from a snapshot many times,
    // step once, and verify the result is always identical.
    const world = createWorld();
    addStaticObstacles(world, 20);
    const handle = addDynamicBody(world, 200, 200);

    // Run to a state where body is near obstacles (likely in contact)
    for (let tick = 0; tick < 200; tick++) {
      const body = world.getRigidBody(handle);
      // Push body toward obstacles
      const vx = Math.fround(Math.sin(tick * 0.3) * 80);
      const vy = Math.fround(Math.cos(tick * 0.3) * 80);
      body.setLinvel({ x: vx, y: vy }, true);
      world.step();
    }

    // Take snapshot at this interesting state
    const snapshot = world.takeSnapshot();

    // Get reference: step once from this state
    world.step();
    const refSnapshot = world.takeSnapshot();
    const refBody = world.getRigidBody(handle);
    const refPos = { x: refBody.translation().x, y: refBody.translation().y };

    // Now restore and step 100 times, checking each time
    let driftDetected = false;
    for (let cycle = 0; cycle < 100; cycle++) {
      const restored = rapier.World.restoreSnapshot(snapshot)!;
      restored.step();
      const body = restored.getRigidBody(handle);
      const pos = body.translation();

      if (pos.x !== refPos.x || pos.y !== refPos.y) {
        console.log(`Drift detected at cycle ${cycle}: ref=(${refPos.x}, ${refPos.y}) got=(${pos.x}, ${pos.y})`);
        driftDetected = true;
        restored.free();
        break;
      }

      // Also check if the snapshot bytes are identical
      const cycleSnapshot = restored.takeSnapshot();
      if (cycleSnapshot.byteLength !== refSnapshot.byteLength) {
        console.log(`Snapshot size mismatch at cycle ${cycle}: ref=${refSnapshot.byteLength} got=${cycleSnapshot.byteLength}`);
        driftDetected = true;
        restored.free();
        break;
      }

      let snapshotMatch = true;
      for (let i = 0; i < cycleSnapshot.byteLength; i++) {
        if (cycleSnapshot[i] !== refSnapshot[i]) {
          snapshotMatch = false;
          break;
        }
      }

      if (!snapshotMatch) {
        console.log(`Snapshot bytes differ at cycle ${cycle} (positions match but internal state differs)`);
        // This is a warning — internal state difference might not affect positions yet
        // but could accumulate over time
      }

      restored.free();
    }

    world.free();
    expect(driftDetected).toBe(false);
  });

  it('chained restore-step-snapshot cycles should not accumulate drift', () => {
    // Simulates the real rollback scenario:
    // restore → step N ticks → take snapshot → restore THAT snapshot → step N ticks → ...
    // Each cycle uses the PREVIOUS cycle's snapshot as the starting point.
    // This is what happens in the real game when rollback creates a snapshot gap.

    const world = createWorld();
    addStaticObstacles(world, 20);
    const handle = addDynamicBody(world, 200, 200);

    // Run to interesting state
    for (let tick = 0; tick < 100; tick++) {
      const body = world.getRigidBody(handle);
      const vx = Math.fround(Math.sin(tick * 0.3) * 100);
      const vy = Math.fround(Math.cos(tick * 0.3) * 100);
      body.setLinvel({ x: vx, y: vy }, true);
      world.step();
    }

    // Reference: run 500 more ticks linearly
    const linearWorld = rapier.World.restoreSnapshot(world.takeSnapshot())!;
    for (let tick = 100; tick < 600; tick++) {
      const body = linearWorld.getRigidBody(handle);
      if (tick % 5 === 0) {
        const vx = Math.fround(Math.sin(tick * 0.3) * 100);
        const vy = Math.fround(Math.cos(tick * 0.3) * 100);
        body.setLinvel({ x: vx, y: vy }, true);
      }
      linearWorld.step();
    }
    const refPos = linearWorld.getRigidBody(handle).translation();

    // Rollback simulation: restore every 10 ticks (simulating frequent rollbacks)
    let currentSnapshot = world.takeSnapshot();
    world.free();

    for (let tick = 100; tick < 600; tick++) {
      const w = rapier.World.restoreSnapshot(currentSnapshot)!;

      // Step 10 ticks (or remaining)
      const batchEnd = Math.min(tick + 10, 600);
      for (let t = tick; t < batchEnd; t++) {
        const body = w.getRigidBody(handle);
        if (t % 5 === 0) {
          const vx = Math.fround(Math.sin(t * 0.3) * 100);
          const vy = Math.fround(Math.cos(t * 0.3) * 100);
          body.setLinvel({ x: vx, y: vy }, true);
        }
        w.step();
      }

      currentSnapshot = w.takeSnapshot();
      tick = batchEnd - 1; // will be incremented by loop
      w.free();
    }

    // Compare final state
    const finalWorld = rapier.World.restoreSnapshot(currentSnapshot)!;
    const finalPos = finalWorld.getRigidBody(handle).translation();

    console.log(`Linear:   (${refPos.x}, ${refPos.y})`);
    console.log(`Rollback: (${finalPos.x}, ${finalPos.y})`);

    expect(finalPos.x).toBe(refPos.x);
    expect(finalPos.y).toBe(refPos.y);

    linearWorld.free();
    finalWorld.free();
  });

  it('restore-step-snapshot with collision interactions over 2000 ticks', () => {
    // Most realistic test — matches the 2d-map-test desync scenario:
    // - 2000 ticks
    // - ~300 rollback cycles
    // - Dynamic body interacts with static obstacles
    // - Velocity set frequently (player movement pattern)

    const TOTAL_TICKS = 2000;
    const ROLLBACK_INTERVAL = 6; // rollback every ~6 ticks (matches real pattern)

    // ── Linear reference ──
    const refWorld = createWorld();
    addStaticObstacles(refWorld, 30);
    const refHandle = addDynamicBody(refWorld, 150, 150);

    for (let tick = 1; tick <= TOTAL_TICKS; tick++) {
      const body = refWorld.getRigidBody(refHandle);
      if (tick % 2 === 0) {
        const vx = Math.fround(Math.sin(tick * 0.2) * 100);
        const vy = Math.fround(Math.cos(tick * 0.2) * 100);
        body.setLinvel({ x: vx, y: vy }, true);
      }
      refWorld.step();
    }

    const refBody = refWorld.getRigidBody(refHandle);
    const refPos = { x: refBody.translation().x, y: refBody.translation().y };
    const refVel = { x: refBody.linvel().x, y: refBody.linvel().y };
    const refWorldSnapshot = refWorld.takeSnapshot();

    // ── Rollback simulation ──
    // Simulates what happens in the real game:
    // Run some ticks → take snapshot → rollback to earlier snapshot → resimulate
    const rbWorld = createWorld();
    addStaticObstacles(rbWorld, 30);
    const rbHandle = addDynamicBody(rbWorld, 150, 150);

    // Snapshot history (simplified ring buffer)
    const snapshots = new Map<number, Uint8Array>();
    snapshots.set(0, rbWorld.takeSnapshot());

    let currentTick = 0;
    let rollbackCount = 0;
    let currentWorld = rbWorld;

    while (currentTick < TOTAL_TICKS) {
      // Simulate a batch of ticks
      const batchSize = ROLLBACK_INTERVAL + Math.floor(Math.sin(currentTick) * 2);
      const batchEnd = Math.min(currentTick + Math.max(batchSize, 3), TOTAL_TICKS);

      for (let tick = currentTick + 1; tick <= batchEnd; tick++) {
        const body = currentWorld.getRigidBody(rbHandle);
        if (tick % 2 === 0) {
          const vx = Math.fround(Math.sin(tick * 0.2) * 100);
          const vy = Math.fround(Math.cos(tick * 0.2) * 100);
          body.setLinvel({ x: vx, y: vy }, true);
        }
        currentWorld.step();
        snapshots.set(tick, currentWorld.takeSnapshot());
      }

      currentTick = batchEnd;

      // Simulate a rollback (if not at end)
      if (currentTick < TOTAL_TICKS) {
        const rollbackTo = Math.max(1, currentTick - 3);
        const restoreFrom = rollbackTo - 1;

        const snap = snapshots.get(restoreFrom);
        if (snap) {
          currentWorld.free();

          // Drop snapshots >= restoreFrom (matching the real SnapshotHistory.rollback behavior)
          for (const [t] of snapshots) {
            if (t >= restoreFrom) snapshots.delete(t);
          }

          currentWorld = rapier.World.restoreSnapshot(snap)!;
          currentTick = restoreFrom;
          rollbackCount++;
        }
      }
    }

    const rbBody = currentWorld.getRigidBody(rbHandle);
    const rbPos = { x: rbBody.translation().x, y: rbBody.translation().y };
    const rbVel = { x: rbBody.linvel().x, y: rbBody.linvel().y };
    const rbWorldSnapshot = currentWorld.takeSnapshot();

    console.log(`Total rollbacks: ${rollbackCount}`);
    console.log(`Linear ref:  pos=(${refPos.x}, ${refPos.y}) vel=(${refVel.x}, ${refVel.y})`);
    console.log(`With rollbacks: pos=(${rbPos.x}, ${rbPos.y}) vel=(${rbVel.x}, ${rbVel.y})`);

    // Check positions match
    expect(rbPos.x).toBe(refPos.x);
    expect(rbPos.y).toBe(refPos.y);
    expect(rbVel.x).toBe(refVel.x);
    expect(rbVel.y).toBe(refVel.y);

    // Check full world snapshot matches
    let snapshotsMatch = true;
    if (rbWorldSnapshot.byteLength !== refWorldSnapshot.byteLength) {
      snapshotsMatch = false;
    } else {
      for (let i = 0; i < rbWorldSnapshot.byteLength; i++) {
        if (rbWorldSnapshot[i] !== refWorldSnapshot[i]) {
          snapshotsMatch = false;
          break;
        }
      }
    }
    if (!snapshotsMatch) {
      console.log('WARNING: World snapshots differ even though positions match');
    }

    currentWorld.free();
    refWorld.free();
  });
});
