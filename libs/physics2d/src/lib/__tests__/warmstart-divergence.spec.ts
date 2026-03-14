/**
 * Verifies that Rapier snapshot restore is deterministic regardless of
 * warmstartCoefficient setting and restore cycle frequency.
 *
 * Since @lagless/rapier2d-deterministic-compat@0.19.4, BVH optimization state
 * (rebuild_frame_index, rebuild_start_index) is properly serialized in parry,
 * eliminating the BroadPhase divergence that previously caused desync.
 * See: https://github.com/dimforge/rapier/issues/910
 */
import { describe, it, expect, beforeAll } from 'vitest';
import RAPIER from '@lagless/rapier2d-deterministic-compat';
import type { RapierModule2d, RapierWorld2d } from '../rapier-types-2d.js';

let rapier: RapierModule2d;

beforeAll(async () => {
  await RAPIER.init();
  rapier = RAPIER as unknown as RapierModule2d;
});

const TIMESTEP = 1 / 60;

function createWorld(warmstartCoefficient: number): RapierWorld2d {
  const world = new rapier.World({ x: 0, y: 0 });
  world.timestep = TIMESTEP;
  (world as any).integrationParameters.warmstartCoefficient = warmstartCoefficient;
  return world;
}

/** Dense obstacle grid with high-restitution dynamic body bouncing through. */
function setupDenseScene(world: RapierWorld2d): number {
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 5; col++) {
      const bodyDesc = rapier.RigidBodyDesc.fixed()
        .setTranslation(60 + col * 35, 60 + row * 35);
      const body = world.createRigidBody(bodyDesc);
      world.createCollider(rapier.ColliderDesc.ball(8), body);
    }
  }

  const playerDesc = rapier.RigidBodyDesc.dynamic()
    .setTranslation(100, 150);
  const player = world.createRigidBody(playerDesc);
  player.setLinearDamping(0.05);
  const desc = rapier.ColliderDesc.ball(12);
  desc.setFriction(0);
  desc.setRestitution(1.0);
  world.createCollider(desc, player);

  return player.handle;
}

function applyInput(world: RapierWorld2d, handle: number, tick: number): void {
  const body = world.getRigidBody(handle);
  const vx = Math.fround(Math.sin(tick * 0.25) * 150);
  const vy = Math.fround(Math.cos(tick * 0.18) * 150);
  body.setLinvel({ x: vx, y: vy }, true);
}

function snapshotsIdentical(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function countDifferentBytes(a: Uint8Array, b: Uint8Array): number {
  let count = 0;
  const len = Math.min(a.byteLength, b.byteLength);
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) count++;
  }
  return count + Math.abs(a.byteLength - b.byteLength);
}

describe('Warm-start divergence', () => {
  it('should produce identical snapshots with warmstartCoefficient=1 (linear vs restore-cycle)', () => {
    const TICKS = 500;

    // ── Linear: step continuously ──
    const linearWorld = createWorld(1);
    const linearHandle = setupDenseScene(linearWorld);
    for (let tick = 1; tick <= TICKS; tick++) {
      applyInput(linearWorld, linearHandle, tick);
      linearWorld.step();
    }
    const linearSnapshot = linearWorld.takeSnapshot();

    // ── Restore-cycle: save→restore every 10 ticks ──
    let rcWorld = createWorld(1) as RapierWorld2d;
    const rcHandle = setupDenseScene(rcWorld);
    for (let tick = 1; tick <= TICKS; tick++) {
      applyInput(rcWorld, rcHandle, tick);
      rcWorld.step();
      if (tick % 10 === 0) {
        const snap = rcWorld.takeSnapshot();
        rcWorld.free();
        rcWorld = rapier.World.restoreSnapshot(snap)! as unknown as RapierWorld2d;
        (rcWorld as any).integrationParameters.warmstartCoefficient = 1;
      }
    }
    const rcSnapshot = rcWorld.takeSnapshot();

    const diffBytes = countDifferentBytes(linearSnapshot, rcSnapshot);
    console.log(`warmstartCoefficient=1: ${diffBytes} bytes differ out of ${linearSnapshot.byteLength}`);

    // With BVH fix (parry#403), snapshots are byte-identical regardless of restore cycles
    expect(snapshotsIdentical(linearSnapshot, rcSnapshot)).toBe(true);
    expect(diffBytes).toBe(0);

    linearWorld.free();
    rcWorld.free();
  });

  it('should produce identical positions with warmstartCoefficient=0 regardless of restore cycles', () => {
    const TICKS = 2000;

    // ── Linear: no restore cycles ──
    const linearWorld = createWorld(0);
    const linearHandle = setupDenseScene(linearWorld);
    for (let tick = 1; tick <= TICKS; tick++) {
      applyInput(linearWorld, linearHandle, tick);
      linearWorld.step();
    }
    const linearBody = linearWorld.getRigidBody(linearHandle);
    const linearPos = { x: linearBody.translation().x, y: linearBody.translation().y };
    const linearVel = { x: linearBody.linvel().x, y: linearBody.linvel().y };

    // ── Restore-cycle: save→restore every 10 ticks ──
    let rcWorld = createWorld(0) as RapierWorld2d;
    const rcHandle = setupDenseScene(rcWorld);
    for (let tick = 1; tick <= TICKS; tick++) {
      applyInput(rcWorld, rcHandle, tick);
      rcWorld.step();
      if (tick % 10 === 0) {
        const snap = rcWorld.takeSnapshot();
        rcWorld.free();
        rcWorld = rapier.World.restoreSnapshot(snap)! as unknown as RapierWorld2d;
        (rcWorld as any).integrationParameters.warmstartCoefficient = 0;
      }
    }
    const rcBody = rcWorld.getRigidBody(rcHandle);
    const rcPos = { x: rcBody.translation().x, y: rcBody.translation().y };
    const rcVel = { x: rcBody.linvel().x, y: rcBody.linvel().y };

    console.log(`warmstartCoefficient=0 (${TICKS} ticks):`);
    console.log(`  Linear:        pos=(${linearPos.x}, ${linearPos.y})`);
    console.log(`  Restore-cycle: pos=(${rcPos.x}, ${rcPos.y})`);

    // Positions and velocities must be bit-identical.
    // With warm-starting disabled, the solver always starts from zero impulses,
    // so restore cycles cannot create divergent solver convergence paths.
    expect(rcPos.x).toBe(linearPos.x);
    expect(rcPos.y).toBe(linearPos.y);
    expect(rcVel.x).toBe(linearVel.x);
    expect(rcVel.y).toBe(linearVel.y);

    linearWorld.free();
    rcWorld.free();
  });

  it('should produce identical positions with warmstartCoefficient=0 even with asymmetric rollback patterns', () => {
    // Simulates the real multiplayer scenario:
    // Client A: rarely rolls back (every 50 ticks)
    // Client B: frequently rolls back (every 3 ticks)
    // Both process identical inputs — final state must match.
    const TICKS = 1000;

    function runSim(restoreInterval: number) {
      let world = createWorld(0) as RapierWorld2d;
      const handle = setupDenseScene(world);
      let restoreCount = 0;

      for (let tick = 1; tick <= TICKS; tick++) {
        applyInput(world, handle, tick);
        world.step();
        if (restoreInterval > 0 && tick % restoreInterval === 0) {
          const snap = world.takeSnapshot();
          world.free();
          world = rapier.World.restoreSnapshot(snap)! as unknown as RapierWorld2d;
          (world as any).integrationParameters.warmstartCoefficient = 0;
          restoreCount++;
        }
      }

      const body = world.getRigidBody(handle);
      const pos = { x: body.translation().x, y: body.translation().y };
      world.free();
      return { pos, restoreCount };
    }

    const clientA = runSim(50);  // rare rollbacks
    const clientB = runSim(3);   // frequent rollbacks
    const clientC = runSim(0);   // no rollbacks (pure linear)

    console.log(`Asymmetric rollback (warmstartCoefficient=0):`);
    console.log(`  Client A (${clientA.restoreCount} restores): pos=(${clientA.pos.x}, ${clientA.pos.y})`);
    console.log(`  Client B (${clientB.restoreCount} restores): pos=(${clientB.pos.x}, ${clientB.pos.y})`);
    console.log(`  Client C (linear):                          pos=(${clientC.pos.x}, ${clientC.pos.y})`);

    // All three must produce identical positions
    expect(clientA.pos.x).toBe(clientC.pos.x);
    expect(clientA.pos.y).toBe(clientC.pos.y);
    expect(clientB.pos.x).toBe(clientC.pos.x);
    expect(clientB.pos.y).toBe(clientC.pos.y);
  });
});
