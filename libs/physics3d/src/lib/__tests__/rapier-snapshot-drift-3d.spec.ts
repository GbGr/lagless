/**
 * Targeted test: Does Rapier 3D snapshot/restore introduce drift over many cycles?
 *
 * Same BVH optimization state serialization bug exists in parry3d as in parry2d —
 * the BVH incremental optimization counters (rebuild_frame_index, rebuild_start_index)
 * were stored in a transient workspace, not serialized in snapshots.
 * After restore, the BVH optimizer restarts from index 0, producing different
 * broad-phase BVH state after enough ticks.
 *
 * The snapshot byte equality tests will FAIL against
 * @dimforge/rapier3d-deterministic-compat (unfixed) and PASS against
 * @lagless/rapier3d-deterministic-compat (with parry BVH fix).
 *
 * Position-level divergence depends on collision patterns and may not trigger
 * in every scenario. The snapshot byte tests are the definitive correctness check.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import RAPIER from '@lagless/rapier3d-deterministic-compat';
import type { RapierModule3d, RapierWorld3d } from '../rapier-types-3d.js';

let rapier: RapierModule3d;

beforeAll(async () => {
  await RAPIER.init();
  rapier = RAPIER as unknown as RapierModule3d;
});

function createWorld(): RapierWorld3d {
  const world = new rapier.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = 1 / 60;
  return world;
}

/**
 * Create a dense 3D grid of static obstacles.
 * Many colliders = large BVH = more incremental optimization work.
 */
function addStaticObstacleGrid(world: RapierWorld3d, gridSize: number, spacing: number): void {
  for (let x = 0; x < gridSize; x++) {
    for (let z = 0; z < gridSize; z++) {
      const desc = rapier.RigidBodyDesc.fixed()
        .setTranslation(x * spacing, 0, z * spacing);
      const body = world.createRigidBody(desc);
      world.createCollider(rapier.ColliderDesc.ball(spacing * 0.3), body);
    }
  }
}

function addDynamicBody(world: RapierWorld3d, x: number, y: number, z: number): number {
  const desc = rapier.RigidBodyDesc.dynamic()
    .setTranslation(x, y, z);
  const body = world.createRigidBody(desc);
  body.setLinearDamping(0.1);
  const colliderDesc = rapier.ColliderDesc.ball(2);
  colliderDesc.setFriction(0);
  colliderDesc.setRestitution(1);
  world.createCollider(colliderDesc, body);
  return body.handle;
}

function addGround(world: RapierWorld3d): void {
  const desc = rapier.RigidBodyDesc.fixed()
    .setTranslation(0, -1, 0);
  const body = world.createRigidBody(desc);
  world.createCollider(rapier.ColliderDesc.cuboid(500, 1, 500), body);
}

/**
 * Compare two Uint8Array snapshots byte-by-byte.
 * Returns the index of the first differing byte, or -1 if identical.
 */
function findFirstSnapshotDiff(a: Uint8Array, b: Uint8Array): number {
  if (a.byteLength !== b.byteLength) return 0;
  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] !== b[i]) return i;
  }
  return -1;
}

describe('Rapier 3D snapshot/restore drift', () => {
  it('single restore cycle should produce identical step result', () => {
    const world = createWorld();
    addGround(world);
    addStaticObstacleGrid(world, 5, 20);
    const handle = addDynamicBody(world, 50, 10, 50);

    for (let tick = 0; tick < 100; tick++) {
      const body = world.getRigidBody(handle);
      if (tick % 3 === 0) {
        const vx = Math.fround(Math.sin(tick * 0.5) * 50);
        const vy = Math.fround(5);
        const vz = Math.fround(Math.cos(tick * 0.5) * 50);
        body.setLinvel({ x: vx, y: vy, z: vz }, true);
      }
      world.step();
    }

    const snapshot = world.takeSnapshot();

    // Reference step
    const body = world.getRigidBody(handle);
    body.setLinvel({ x: 50, y: -5, z: -30 }, true);
    world.step();
    const refPos = world.getRigidBody(handle).translation();
    const refVel = world.getRigidBody(handle).linvel();
    const refSnap = world.takeSnapshot();

    // Restore and step
    world.free();
    const restored = rapier.World.restoreSnapshot(snapshot)!;
    expect(restored).not.toBeNull();

    const body2 = restored.getRigidBody(handle);
    body2.setLinvel({ x: 50, y: -5, z: -30 }, true);
    restored.step();
    const restoredPos = restored.getRigidBody(handle).translation();
    const restoredVel = restored.getRigidBody(handle).linvel();
    const restoredSnap = restored.takeSnapshot();

    // Position equality
    expect(restoredPos.x).toBe(refPos.x);
    expect(restoredPos.y).toBe(refPos.y);
    expect(restoredPos.z).toBe(refPos.z);
    expect(restoredVel.x).toBe(refVel.x);
    expect(restoredVel.y).toBe(refVel.y);
    expect(restoredVel.z).toBe(refVel.z);

    // Snapshot byte equality
    expect(findFirstSnapshotDiff(refSnap, restoredSnap)).toBe(-1);

    restored.free();
  });

  it('BVH optimization state must be preserved in snapshots (fundamental test)', () => {
    // This test isolates the BVH serialization issue:
    // 1. Create world with many colliders (big BVH)
    // 2. Step N ticks (BVH optimization advances counters)
    // 3. Take snapshot S1
    // 4. Restore from S1, step 1 tick, take snapshot S2
    // 5. Step original world 1 tick, take snapshot S3
    // 6. S2 must equal S3 (byte-for-byte)
    //
    // Without the fix, the BVH optimization counters reset on restore,
    // so S2 will differ from S3 in the BVH region.

    const world = createWorld();
    addGround(world);
    // Many obstacles: 8x8 grid = 64 colliders + ground = 65 total
    addStaticObstacleGrid(world, 8, 15);
    const handle = addDynamicBody(world, 60, 10, 60);

    // Step enough ticks for BVH optimization to advance its counters significantly
    for (let tick = 0; tick < 300; tick++) {
      const body = world.getRigidBody(handle);
      if (tick % 2 === 0) {
        const vx = Math.fround(Math.sin(tick * 0.2) * 60);
        const vy = Math.fround(3);
        const vz = Math.fround(Math.cos(tick * 0.2) * 60);
        body.setLinvel({ x: vx, y: vy, z: vz }, true);
      }
      world.step();
    }

    // Take checkpoint
    const checkpoint = world.takeSnapshot();

    // Path A: continue stepping the original world
    world.step();
    const snapA = world.takeSnapshot();

    // Path B: restore from checkpoint, step once
    const restored = rapier.World.restoreSnapshot(checkpoint)!;
    restored.step();
    const snapB = restored.takeSnapshot();

    const diffIdx = findFirstSnapshotDiff(snapA, snapB);
    if (diffIdx >= 0) {
      console.log(`Snapshot bytes differ at offset ${diffIdx} (BVH optimization state not preserved)`);
      console.log(`  Path A byte: ${snapA[diffIdx]}`);
      console.log(`  Path B byte: ${snapB[diffIdx]}`);
    }

    expect(diffIdx).toBe(-1);

    world.free();
    restored.free();
  });

  it('linear vs save/restore every 4 ticks — snapshot byte equality over 2000 ticks', () => {
    // World A: pure linear, never save/restore (like client with no rollbacks)
    // World B: save/restore every 4 ticks (like client with frequent rollbacks)
    // Both apply identical inputs.
    // After N ticks: compare world snapshots byte-by-byte.
    const TOTAL_TICKS = 2000;
    const RESTORE_INTERVAL = 4;
    const GRID_SIZE = 6; // 6x6 = 36 static obstacles

    const worldA = createWorld();
    addGround(worldA);
    addStaticObstacleGrid(worldA, GRID_SIZE, 15);
    const handleA = addDynamicBody(worldA, 45, 10, 45);

    let worldB = createWorld() as RapierWorld3d;
    addGround(worldB);
    addStaticObstacleGrid(worldB, GRID_SIZE, 15);
    const handleB = addDynamicBody(worldB, 45, 10, 45);

    let firstPositionDiv = -1;
    let firstSnapshotDiv = -1;

    for (let tick = 1; tick <= TOTAL_TICKS; tick++) {
      // Apply identical input to both worlds
      if (tick % 3 === 0 || tick % 3 === 1) {
        const vx = Math.fround(Math.sin(tick * 0.15) * 60);
        const vy = Math.fround(3);
        const vz = Math.fround(Math.cos(tick * 0.15) * 60);
        worldA.getRigidBody(handleA).setLinvel({ x: vx, y: vy, z: vz }, true);
        worldB.getRigidBody(handleB).setLinvel({ x: vx, y: vy, z: vz }, true);
      }

      worldA.step();
      worldB.step();

      // Save/restore on world B (simulates rollback)
      if (tick % RESTORE_INTERVAL === 0) {
        const snap = worldB.takeSnapshot();
        worldB.free();
        worldB = rapier.World.restoreSnapshot(snap)! as unknown as RapierWorld3d;
      }

      // Check position divergence
      if (firstPositionDiv < 0) {
        const posA = worldA.getRigidBody(handleA).translation();
        const posB = worldB.getRigidBody(handleB).translation();
        if (posA.x !== posB.x || posA.y !== posB.y || posA.z !== posB.z) {
          firstPositionDiv = tick;
          console.log(`Position divergence at tick ${tick}:`);
          console.log(`  A: (${posA.x}, ${posA.y}, ${posA.z})`);
          console.log(`  B: (${posB.x}, ${posB.y}, ${posB.z})`);
        }
      }

      // Check snapshot byte divergence (every 100 ticks to avoid perf overhead)
      if (firstSnapshotDiv < 0 && tick % 100 === 0) {
        const snapA = worldA.takeSnapshot();
        const snapB = worldB.takeSnapshot();
        const diff = findFirstSnapshotDiff(snapA, snapB);
        if (diff >= 0) {
          firstSnapshotDiv = tick;
          console.log(`Snapshot byte divergence at tick ${tick}, offset ${diff}`);
        }
      }
    }

    const finalSnapA = worldA.takeSnapshot();
    const finalSnapB = worldB.takeSnapshot();
    const finalDiff = findFirstSnapshotDiff(finalSnapA, finalSnapB);

    const finalA = worldA.getRigidBody(handleA).translation();
    const finalB = worldB.getRigidBody(handleB).translation();
    console.log(`First position divergence: tick ${firstPositionDiv}`);
    console.log(`First snapshot divergence: tick ${firstSnapshotDiv}`);
    console.log(`Final A: (${finalA.x}, ${finalA.y}, ${finalA.z})`);
    console.log(`Final B: (${finalB.x}, ${finalB.y}, ${finalB.z})`);
    console.log(`Final snapshot diff offset: ${finalDiff}`);

    // Position equality (the user-facing correctness guarantee)
    expect(finalA.x).toBe(finalB.x);
    expect(finalA.y).toBe(finalB.y);
    expect(finalA.z).toBe(finalB.z);

    // Snapshot byte equality (the definitive internal state test)
    expect(finalDiff).toBe(-1);

    worldA.free();
    worldB.free();
  });

  it('chained restore-step-snapshot cycles should not accumulate drift', () => {
    // Simulates the real rollback scenario:
    // restore → step N ticks → take snapshot → restore THAT snapshot → step N ticks → ...
    const world = createWorld();
    addGround(world);
    addStaticObstacleGrid(world, 6, 15);
    const handle = addDynamicBody(world, 45, 10, 45);

    // Run to interesting state
    for (let tick = 0; tick < 100; tick++) {
      const body = world.getRigidBody(handle);
      const vx = Math.fround(Math.sin(tick * 0.3) * 50);
      const vy = Math.fround(3);
      const vz = Math.fround(Math.cos(tick * 0.3) * 50);
      body.setLinvel({ x: vx, y: vy, z: vz }, true);
      world.step();
    }

    // Reference: run 500 more ticks linearly
    const linearWorld = rapier.World.restoreSnapshot(world.takeSnapshot())!;
    for (let tick = 100; tick < 600; tick++) {
      const body = linearWorld.getRigidBody(handle);
      if (tick % 5 === 0) {
        const vx = Math.fround(Math.sin(tick * 0.3) * 50);
        const vy = Math.fround(3);
        const vz = Math.fround(Math.cos(tick * 0.3) * 50);
        body.setLinvel({ x: vx, y: vy, z: vz }, true);
      }
      linearWorld.step();
    }
    const refPos = linearWorld.getRigidBody(handle).translation();
    const refSnap = linearWorld.takeSnapshot();

    // Rollback simulation: restore every 10 ticks
    let currentSnapshot = world.takeSnapshot();
    world.free();

    for (let tick = 100; tick < 600; tick++) {
      const w = rapier.World.restoreSnapshot(currentSnapshot)!;

      const batchEnd = Math.min(tick + 10, 600);
      for (let t = tick; t < batchEnd; t++) {
        const body = w.getRigidBody(handle);
        if (t % 5 === 0) {
          const vx = Math.fround(Math.sin(t * 0.3) * 50);
          const vy = Math.fround(3);
          const vz = Math.fround(Math.cos(t * 0.3) * 50);
          body.setLinvel({ x: vx, y: vy, z: vz }, true);
        }
        w.step();
      }

      currentSnapshot = w.takeSnapshot();
      tick = batchEnd - 1;
      w.free();
    }

    const finalWorld = rapier.World.restoreSnapshot(currentSnapshot)!;
    const finalPos = finalWorld.getRigidBody(handle).translation();
    const finalSnap = finalWorld.takeSnapshot();

    console.log(`Linear:   (${refPos.x}, ${refPos.y}, ${refPos.z})`);
    console.log(`Rollback: (${finalPos.x}, ${finalPos.y}, ${finalPos.z})`);

    // Position equality
    expect(finalPos.x).toBe(refPos.x);
    expect(finalPos.y).toBe(refPos.y);
    expect(finalPos.z).toBe(refPos.z);

    // Snapshot byte equality
    const diff = findFirstSnapshotDiff(refSnap, finalSnap);
    if (diff >= 0) {
      console.log(`Snapshot bytes differ at offset ${diff}`);
    }
    expect(diff).toBe(-1);

    linearWorld.free();
    finalWorld.free();
  });

  it('restore-step-snapshot with collision interactions over 2000 ticks', () => {
    // Most realistic test — matches real netcode rollback:
    // - 2000 ticks with ~300 rollbacks
    // - Dynamic body interacts with dense static obstacle grid + ground
    // - Velocity set frequently (player movement pattern)
    const TOTAL_TICKS = 2000;
    const ROLLBACK_INTERVAL = 6;

    // ── Linear reference ──
    const refWorld = createWorld();
    addGround(refWorld);
    addStaticObstacleGrid(refWorld, 7, 12);
    const refHandle = addDynamicBody(refWorld, 42, 10, 42);

    for (let tick = 1; tick <= TOTAL_TICKS; tick++) {
      const body = refWorld.getRigidBody(refHandle);
      if (tick % 2 === 0) {
        const vx = Math.fround(Math.sin(tick * 0.2) * 60);
        const vy = Math.fround(3);
        const vz = Math.fround(Math.cos(tick * 0.2) * 60);
        body.setLinvel({ x: vx, y: vy, z: vz }, true);
      }
      refWorld.step();
    }

    const refBody = refWorld.getRigidBody(refHandle);
    const refPos = { x: refBody.translation().x, y: refBody.translation().y, z: refBody.translation().z };
    const refVel = { x: refBody.linvel().x, y: refBody.linvel().y, z: refBody.linvel().z };
    const refWorldSnapshot = refWorld.takeSnapshot();

    // ── Rollback simulation ──
    const rbWorld = createWorld();
    addGround(rbWorld);
    addStaticObstacleGrid(rbWorld, 7, 12);
    const rbHandle = addDynamicBody(rbWorld, 42, 10, 42);

    const snapshots = new Map<number, Uint8Array>();
    snapshots.set(0, rbWorld.takeSnapshot());

    let currentTick = 0;
    let rollbackCount = 0;
    let currentWorld = rbWorld;

    while (currentTick < TOTAL_TICKS) {
      const batchSize = ROLLBACK_INTERVAL + Math.floor(Math.sin(currentTick) * 2);
      const batchEnd = Math.min(currentTick + Math.max(batchSize, 3), TOTAL_TICKS);

      for (let tick = currentTick + 1; tick <= batchEnd; tick++) {
        const body = currentWorld.getRigidBody(rbHandle);
        if (tick % 2 === 0) {
          const vx = Math.fround(Math.sin(tick * 0.2) * 60);
          const vy = Math.fround(3);
          const vz = Math.fround(Math.cos(tick * 0.2) * 60);
          body.setLinvel({ x: vx, y: vy, z: vz }, true);
        }
        currentWorld.step();
        snapshots.set(tick, currentWorld.takeSnapshot());
      }

      currentTick = batchEnd;

      if (currentTick < TOTAL_TICKS) {
        const rollbackTo = Math.max(1, currentTick - 3);
        const restoreFrom = rollbackTo - 1;

        const snap = snapshots.get(restoreFrom);
        if (snap) {
          currentWorld.free();

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
    const rbPos = { x: rbBody.translation().x, y: rbBody.translation().y, z: rbBody.translation().z };
    const rbVel = { x: rbBody.linvel().x, y: rbBody.linvel().y, z: rbBody.linvel().z };
    const rbWorldSnapshot = currentWorld.takeSnapshot();

    console.log(`Total rollbacks: ${rollbackCount}`);
    console.log(`Linear ref:     pos=(${refPos.x}, ${refPos.y}, ${refPos.z}) vel=(${refVel.x}, ${refVel.y}, ${refVel.z})`);
    console.log(`With rollbacks: pos=(${rbPos.x}, ${rbPos.y}, ${rbPos.z}) vel=(${rbVel.x}, ${rbVel.y}, ${rbVel.z})`);

    // Position equality
    expect(rbPos.x).toBe(refPos.x);
    expect(rbPos.y).toBe(refPos.y);
    expect(rbPos.z).toBe(refPos.z);
    expect(rbVel.x).toBe(refVel.x);
    expect(rbVel.y).toBe(refVel.y);
    expect(rbVel.z).toBe(refVel.z);

    // Full world snapshot byte equality
    const snapDiff = findFirstSnapshotDiff(rbWorldSnapshot, refWorldSnapshot);
    if (snapDiff >= 0) {
      console.log(`World snapshot bytes differ at offset ${snapDiff}`);
    }
    expect(snapDiff).toBe(-1);

    currentWorld.free();
    refWorld.free();
  });
});
