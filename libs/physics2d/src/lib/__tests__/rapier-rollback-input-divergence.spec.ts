/**
 * Targeted test: Rapier internal state divergence across rollback cycles
 * with different inputs.
 *
 * Reproduces the exact 2d-map-test desync scenario:
 * 1. Two clients simulate the same world
 * 2. Client A (linear): has all inputs, simulates linearly
 * 3. Client B (rollback): receives remote inputs with delay, rolls back each batch
 * 4. Each rollback cycle on client B has DIFFERENT inputs (fewer remote inputs
 *    in earlier cycles, more in later cycles)
 * 5. Rapier snapshots saved during intermediate cycles carry internal state
 *    (contact cache, warm-starting) from "wrong" predictions
 * 6. When the final rollback restores a snapshot from an intermediate cycle,
 *    the Rapier internal state reflects a DIFFERENT simulation history
 *
 * The divergence manifests at ticks where:
 * - Positions match (same MoveInput overrides velocity)
 * - But Rapier's contact solver produces different results because
 *   warm-starting data comes from a different simulation path
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
  // Static obstacles in a line — player will collide with them
  for (let i = 0; i < 20; i++) {
    const bodyDesc = rapier.RigidBodyDesc.fixed()
      .setTranslation(100 + i * 40, 200 + (i % 5) * 30);
    const body = world.createRigidBody(bodyDesc);
    const desc = rapier.ColliderDesc.ball(8);
    world.createCollider(desc, body);
  }

  // Player body — dynamic, with damping
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

/**
 * Generate deterministic MoveInput direction for a given tick.
 * Returns null for ticks without input (player not pressing keys).
 */
function getInputForTick(tick: number): { dirX: number; dirY: number } | null {
  // Player sends input every 2-3 ticks (realistic pattern)
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

describe('Rapier rollback with different inputs per cycle', () => {
  it('should produce identical final state after incremental rollbacks with late remote inputs', () => {
    const TOTAL_TICKS = 2000;
    const INPUT_DELAY = 22; // ticks of delay before remote inputs arrive
    const ROLLBACK_BATCH = 22; // ticks between rollback batches

    // ── Client A (linear reference): has ALL inputs from tick 1 ──
    const worldA = createWorld();
    const handleA = setupBodies(worldA);

    for (let tick = 1; tick <= TOTAL_TICKS; tick++) {
      applyInputAndStep(worldA, handleA, tick, true);
    }

    const refBody = worldA.getRigidBody(handleA);
    const refPos = { x: refBody.translation().x, y: refBody.translation().y };
    const refVel = { x: refBody.linvel().x, y: refBody.linvel().y };

    // ── Client B (rollback): receives remote inputs with INPUT_DELAY delay ──
    const worldB = createWorld();
    const handleB = setupBodies(worldB);

    // Snapshot history (tick → snapshot)
    const snapshots = new Map<number, Uint8Array>();
    snapshots.set(0, worldB.takeSnapshot());

    let currentTick = 0;
    let currentWorld = worldB;
    let lastDeliveredInputTick = 0;
    let rollbackCount = 0;

    while (currentTick < TOTAL_TICKS) {
      // Determine how far we can advance before next rollback
      const advanceTo = Math.min(currentTick + ROLLBACK_BATCH, TOTAL_TICKS);

      // Simulate forward without remote inputs for ticks > lastDeliveredInputTick
      for (let tick = currentTick + 1; tick <= advanceTo; tick++) {
        const hasInput = tick <= lastDeliveredInputTick;
        applyInputAndStep(currentWorld, handleB, tick, hasInput);
        snapshots.set(tick, currentWorld.takeSnapshot());
      }
      currentTick = advanceTo;

      // "Receive" remote inputs: now we know inputs up to (currentTick - INPUT_DELAY)
      const newDeliveredTick = Math.min(currentTick, TOTAL_TICKS);
      const oldDeliveredTick = lastDeliveredInputTick;

      if (newDeliveredTick > oldDeliveredTick) {
        lastDeliveredInputTick = newDeliveredTick;

        // Rollback to the earliest new input tick
        const rollbackTo = oldDeliveredTick + 1;
        const restoreFromTick = rollbackTo - 1;

        const snap = snapshots.get(restoreFromTick);
        if (snap && restoreFromTick < currentTick) {
          currentWorld.free();

          // Drop snapshots >= restoreFromTick (matching real SnapshotHistory.rollback)
          for (const [t] of snapshots) {
            if (t >= restoreFromTick) snapshots.delete(t);
          }

          currentWorld = rapier.World.restoreSnapshot(snap)!;
          currentTick = restoreFromTick;
          rollbackCount++;
        }
      }
    }

    // Get final state
    const rbBody = currentWorld.getRigidBody(handleB);
    const rbPos = { x: rbBody.translation().x, y: rbBody.translation().y };
    const rbVel = { x: rbBody.linvel().x, y: rbBody.linvel().y };

    console.log(`Total rollbacks: ${rollbackCount}`);
    console.log(`Linear:   pos=(${refPos.x}, ${refPos.y}) vel=(${refVel.x}, ${refVel.y})`);
    console.log(`Rollback: pos=(${rbPos.x}, ${rbPos.y}) vel=(${rbVel.x}, ${rbVel.y})`);

    const posDiffX = Math.abs(rbPos.x - refPos.x);
    const posDiffY = Math.abs(rbPos.y - refPos.y);
    if (posDiffX > 0 || posDiffY > 0) {
      console.log(`POSITION DRIFT: dx=${posDiffX} dy=${posDiffY}`);
    }

    expect(rbPos.x).toBe(refPos.x);
    expect(rbPos.y).toBe(refPos.y);
    expect(rbVel.x).toBe(refVel.x);
    expect(rbVel.y).toBe(refVel.y);

    worldA.free();
    currentWorld.free();
  });

  it('should produce identical state with overlapping rollback ranges near collision', () => {
    // Most targeted test: reproduces the exact pattern from the desync report
    // Multiple overlapping rollbacks, each adding a few more ticks of input,
    // with the player body actively colliding with static obstacles.

    const TOTAL_TICKS = 500;

    // ── Reference: linear simulation with all inputs ──
    const refWorld = createWorld();
    const refHandle = setupBodies(refWorld);
    for (let tick = 1; tick <= TOTAL_TICKS; tick++) {
      applyInputAndStep(refWorld, refHandle, tick, true);
    }
    const refBody = refWorld.getRigidBody(refHandle);
    const refPos = { x: refBody.translation().x, y: refBody.translation().y };

    // ── Rollback simulation: overlapping rollbacks ──
    const rbWorld = createWorld();
    const rbHandle = setupBodies(rbWorld);
    const snaps = new Map<number, Uint8Array>();
    snaps.set(0, rbWorld.takeSnapshot());

    let currentWorld: RapierWorld2d = rbWorld;
    let currentTick = 0;
    let inputsAvailableUpTo = 0;
    let rollbackCount = 0;

    // Simulate with delayed input delivery every ~20 ticks
    // Each delivery triggers a rollback to the first new input's tick
    while (currentTick < TOTAL_TICKS) {
      // Advance 20-25 ticks
      const batchSize = 20 + (currentTick % 5);
      const advanceTo = Math.min(currentTick + batchSize, TOTAL_TICKS);

      for (let tick = currentTick + 1; tick <= advanceTo; tick++) {
        const hasInput = tick <= inputsAvailableUpTo;
        applyInputAndStep(currentWorld, rbHandle, tick, hasInput);
        snaps.set(tick, currentWorld.takeSnapshot());
      }
      currentTick = advanceTo;

      // Deliver inputs up to currentTick
      const oldInputs = inputsAvailableUpTo;
      inputsAvailableUpTo = currentTick;

      if (oldInputs < inputsAvailableUpTo) {
        // Rollback to first new input tick
        const rollbackTo = oldInputs + 1;
        const restoreFrom = Math.max(0, rollbackTo - 1);

        const snap = snaps.get(restoreFrom);
        if (snap) {
          currentWorld.free();
          for (const [t] of snaps) {
            if (t >= restoreFrom) snaps.delete(t);
          }
          currentWorld = rapier.World.restoreSnapshot(snap)!;
          currentTick = restoreFrom;
          rollbackCount++;
        }
      }
    }

    const rbBody = currentWorld.getRigidBody(rbHandle);
    const rbPos = { x: rbBody.translation().x, y: rbBody.translation().y };

    console.log(`Rollbacks: ${rollbackCount}`);
    console.log(`Ref pos: (${refPos.x}, ${refPos.y})`);
    console.log(`Rb pos:  (${rbPos.x}, ${rbPos.y})`);

    expect(rbPos.x).toBe(refPos.x);
    expect(rbPos.y).toBe(refPos.y);

    refWorld.free();
    currentWorld.free();
  });
});
