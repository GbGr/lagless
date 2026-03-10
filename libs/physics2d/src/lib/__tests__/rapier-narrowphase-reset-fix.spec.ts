/**
 * Proof-of-concept: test different approaches to eliminate warm-starting divergence.
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
const MOVE_SPEED = 100;

function createWorld(): RapierWorld2d {
  const world = new rapier.World({ x: 0, y: 0 });
  world.timestep = TIMESTEP;
  return world;
}

function setupBodies(world: RapierWorld2d) {
  for (let i = 0; i < 20; i++) {
    const bodyDesc = rapier.RigidBodyDesc.fixed()
      .setTranslation(100 + i * 40, 200 + (i % 5) * 30);
    const body = world.createRigidBody(bodyDesc);
    const desc = rapier.ColliderDesc.ball(8);
    world.createCollider(desc, body);
  }

  const playerDesc = rapier.RigidBodyDesc.dynamic()
    .setTranslation(200, 200);
  const player = world.createRigidBody(playerDesc);
  player.setLinearDamping(0.1);
  const colliderDesc = rapier.ColliderDesc.ball(20);
  colliderDesc.setFriction(0);
  colliderDesc.setRestitution(1);
  world.createCollider(colliderDesc, player);

  return player.handle;
}

function getInputForTick(tick: number): { dirX: number; dirY: number } | null {
  if (tick % 3 === 0 || tick % 3 === 1) {
    const dirX = Math.fround(Math.sin(tick * 0.15) * 0.7);
    const dirY = Math.fround(Math.cos(tick * 0.15) * 0.7);
    return { dirX, dirY };
  }
  return null;
}

function applyInputAndStep(
  world: RapierWorld2d,
  handle: number,
  tick: number,
  hasInput: boolean,
) {
  if (hasInput) {
    const input = getInputForTick(tick);
    if (input) {
      const body = world.getRigidBody(handle);
      body.setLinvel(
        { x: input.dirX * MOVE_SPEED, y: input.dirY * MOVE_SPEED },
        true,
      );
    }
  }
  world.step();
}

describe('NarrowPhase reset fix exploration', () => {
  it('should check if NarrowPhase constructor is accessible', () => {
    const R = RAPIER as any;
    console.log('NarrowPhase available:', typeof R.NarrowPhase);
    console.log('BroadPhase available:', typeof R.BroadPhase);
    console.log('IslandManager available:', typeof R.IslandManager);

    // Check what's on a world instance
    const world = createWorld();
    const w = world as any;
    console.log('world.narrowPhase type:', typeof w.narrowPhase);
    console.log('world.narrowPhase constructor:', w.narrowPhase?.constructor?.name);
    console.log('world.broadPhase type:', typeof w.broadPhase);
    console.log('world.broadPhase constructor:', w.broadPhase?.constructor?.name);
    console.log('world.islands type:', typeof w.islands);
    console.log('world.islands constructor:', w.islands?.constructor?.name);

    // Try to access raw
    if (w.narrowPhase?.raw) {
      console.log('narrowPhase.raw type:', typeof w.narrowPhase.raw);
      console.log('narrowPhase.raw constructor:', w.narrowPhase.raw?.constructor?.name);
    }

    world.free();
    expect(true).toBe(true);
  });

  it('should verify takeSnapshot → restoreSnapshot is NOT bit-transparent', () => {
    // Create two worlds identically, step both once with same input
    const world1 = createWorld();
    const handle1 = setupBodies(world1);

    // Step a few ticks to build up contacts
    for (let t = 1; t <= 50; t++) {
      const body = world1.getRigidBody(handle1);
      body.setLinvel({ x: 70, y: 0 }, true);
      world1.step();
    }

    // Get state BEFORE save/restore cycle
    const snap1 = world1.takeSnapshot();

    // Step one more tick
    const body1 = world1.getRigidBody(handle1);
    body1.setLinvel({ x: 50, y: -30 }, true);
    world1.step();
    const pos1 = world1.getRigidBody(handle1).translation();

    // Now: restore from snap1, step same tick
    const world2 = rapier.World.restoreSnapshot(snap1)! as unknown as RapierWorld2d;
    const body2 = world2.getRigidBody(handle1);
    body2.setLinvel({ x: 50, y: -30 }, true);
    world2.step();
    const pos2 = world2.getRigidBody(handle1).translation();

    console.log(`Original step:  (${pos1.x}, ${pos1.y})`);
    console.log(`Restored step:  (${pos2.x}, ${pos2.y})`);
    console.log(`Match: ${pos1.x === pos2.x && pos1.y === pos2.y}`);

    // Check snapshot bytes
    const snapAfter1 = world1.takeSnapshot();
    const snapAfter2 = world2.takeSnapshot();
    let bytesDiffer = false;
    for (let i = 0; i < Math.min(snapAfter1.length, snapAfter2.length); i++) {
      if (snapAfter1[i] !== snapAfter2[i]) {
        bytesDiffer = true;
        break;
      }
    }
    console.log(`Snapshot bytes identical after step: ${!bytesDiffer}`);

    expect(pos1.x).toBe(pos2.x);
    expect(pos1.y).toBe(pos2.y);

    world1.free();
    world2.free();
  });

  it('should test linear simulation that also uses save/restore every tick', () => {
    const TOTAL_TICKS = 500;

    // ── Pure linear (no save/restore) ──
    const pureWorld = createWorld();
    const pureHandle = setupBodies(pureWorld);
    for (let tick = 1; tick <= TOTAL_TICKS; tick++) {
      applyInputAndStep(pureWorld, pureHandle, tick, true);
    }
    const pureBody = pureWorld.getRigidBody(pureHandle);
    const purePos = { x: pureBody.translation().x, y: pureBody.translation().y };

    // ── Linear with save/restore every tick (same inputs, but going through snapshot cycle) ──
    let currentWorld = createWorld() as RapierWorld2d;
    const srHandle = setupBodies(currentWorld);

    for (let tick = 1; tick <= TOTAL_TICKS; tick++) {
      // Save snapshot, restore from it, then step
      const snap = currentWorld.takeSnapshot();
      currentWorld.free();
      currentWorld = rapier.World.restoreSnapshot(snap)! as unknown as RapierWorld2d;

      applyInputAndStep(currentWorld, srHandle, tick, true);
    }
    const srBody = currentWorld.getRigidBody(srHandle);
    const srPos = { x: srBody.translation().x, y: srBody.translation().y };

    console.log(`Pure linear: (${purePos.x}, ${purePos.y})`);
    console.log(`Save/restore every tick: (${srPos.x}, ${srPos.y})`);
    console.log(`Match: ${purePos.x === srPos.x && purePos.y === srPos.y}`);

    const drift = Math.abs(purePos.x - srPos.x) + Math.abs(purePos.y - srPos.y);
    console.log(`Total drift: ${drift}`);

    // Key question: does save/restore cycle ITSELF introduce drift?
    // If this fails, then snapshot/restore is fundamentally non-transparent.
    expect(srPos.x).toBe(purePos.x);
    expect(srPos.y).toBe(purePos.y);

    pureWorld.free();
    currentWorld.free();
  });
});
