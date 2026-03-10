/**
 * Tick-by-tick divergence trace: find exactly where the rollback simulation
 * first diverges from the linear reference.
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

interface TickState {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

function getState(world: RapierWorld2d, handle: number): TickState {
  const body = world.getRigidBody(handle);
  const pos = body.translation();
  const vel = body.linvel();
  return { x: pos.x, y: pos.y, vx: vel.x, vy: vel.y };
}

describe('Tick-by-tick divergence trace', () => {
  it('N sequential rollback cycles should match linear (all inputs resimulated)', () => {
    // Key test: N cycles where each cycle:
    //  1. Predict BATCH_SIZE ticks without inputs
    //  2. Rollback to start of batch
    //  3. Resimulate with correct inputs
    // At the END, ALL ticks have been resimulated with correct inputs.
    // This should match the linear reference exactly.

    const BATCH = 22;
    const NUM_CYCLES = 20;
    const TOTAL_TICKS = BATCH * NUM_CYCLES; // 440

    // Linear reference
    const linWorld = createWorld();
    const linHandle = setupBodies(linWorld);
    for (let tick = 1; tick <= TOTAL_TICKS; tick++) {
      applyInputAndStep(linWorld, linHandle, tick, true);
    }
    const linState = getState(linWorld, linHandle);

    // Rollback simulation: N predict-rollback-resimulate cycles
    let world = createWorld() as RapierWorld2d;
    const rbHandle = setupBodies(world);
    let snap = world.takeSnapshot();

    const drifts: string[] = [];

    for (let cycle = 0; cycle < NUM_CYCLES; cycle++) {
      const startTick = cycle * BATCH;
      const endTick = startTick + BATCH;

      // Phase 1: predict (no inputs)
      for (let tick = startTick + 1; tick <= endTick; tick++) {
        applyInputAndStep(world, rbHandle, tick, false);
      }

      // Phase 2: rollback to startTick
      world.free();
      world = rapier.World.restoreSnapshot(snap)! as unknown as RapierWorld2d;

      // Phase 3: resimulate with correct inputs
      for (let tick = startTick + 1; tick <= endTick; tick++) {
        applyInputAndStep(world, rbHandle, tick, true);
      }

      // Save snapshot at endTick for next cycle's rollback
      snap = world.takeSnapshot();

      // Check if this cycle's result matches linear at endTick
      const rbState = getState(world, rbHandle);
      // Get linear state at endTick
      const checkWorld = createWorld();
      const checkHandle = setupBodies(checkWorld);
      for (let tick = 1; tick <= endTick; tick++) {
        applyInputAndStep(checkWorld, checkHandle, tick, true);
      }
      const checkState = getState(checkWorld, checkHandle);
      checkWorld.free();

      const dx = Math.abs(rbState.x - checkState.x);
      const dy = Math.abs(rbState.y - checkState.y);
      if (dx > 0 || dy > 0) {
        drifts.push(`Cycle ${cycle + 1} (tick ${endTick}): dx=${dx.toFixed(6)} dy=${dy.toFixed(6)}`);
      }
    }

    const rbState = getState(world, rbHandle);
    console.log(`Linear:   (${linState.x}, ${linState.y})`);
    console.log(`Rollback: (${rbState.x}, ${rbState.y})`);
    console.log(`Match: ${linState.x === rbState.x && linState.y === rbState.y}`);

    if (drifts.length > 0) {
      console.log('\nDrift per cycle:');
      for (const d of drifts) console.log(d);
    } else {
      console.log('\nAll cycles matched perfectly.');
    }

    expect(rbState.x).toBe(linState.x);
    expect(rbState.y).toBe(linState.y);

    linWorld.free();
    world.free();
  });

  it('N cycles with snapshot saved from PREDICTION (not from resimulation)', () => {
    // This simulates the REAL bug scenario:
    // The snapshot used for rollback is from a PREVIOUS prediction cycle,
    // not from a clean resimulation.
    //
    // Specifically: the snapshot at the rollback point was saved during
    // a PREDICTION phase (wrong inputs), then we restore from it and
    // resimulate with correct inputs.

    const BATCH = 22;
    const NUM_CYCLES = 20;
    const TOTAL_TICKS = BATCH * NUM_CYCLES;

    // Linear reference
    const linWorld = createWorld();
    const linHandle = setupBodies(linWorld);
    for (let tick = 1; tick <= TOTAL_TICKS; tick++) {
      applyInputAndStep(linWorld, linHandle, tick, true);
    }
    const linState = getState(linWorld, linHandle);

    // Rollback simulation where snapshots come from prediction
    let world = createWorld() as RapierWorld2d;
    const rbHandle = setupBodies(world);

    // snaps[tick] = snapshot from LAST time we simulated this tick
    // For the first pass, predictions save snapshots.
    // After rollback, correct resimulation overwrites them.
    const snaps = new Map<number, Uint8Array>();
    snaps.set(0, world.takeSnapshot());

    let currentTick = 0;
    let inputsUpTo = 0;
    const drifts: string[] = [];

    for (let cycle = 0; cycle < NUM_CYCLES; cycle++) {
      const advanceTo = Math.min(currentTick + BATCH, TOTAL_TICKS);

      // Forward simulate: some ticks have inputs, some don't
      for (let tick = currentTick + 1; tick <= advanceTo; tick++) {
        const hasInput = tick <= inputsUpTo;
        applyInputAndStep(world, rbHandle, tick, hasInput);
        snaps.set(tick, world.takeSnapshot());
      }
      currentTick = advanceTo;

      // Deliver inputs for all ticks up to currentTick
      const oldInputsUpTo = inputsUpTo;
      inputsUpTo = currentTick;

      // Rollback to the first new input tick
      const restoreFrom = oldInputsUpTo; // snapshot at the boundary
      const snap = snaps.get(restoreFrom);
      if (snap) {
        world.free();
        // Delete stale snapshots
        for (const [t] of snaps) {
          if (t > restoreFrom) snaps.delete(t);
        }
        world = rapier.World.restoreSnapshot(snap)! as unknown as RapierWorld2d;
        currentTick = restoreFrom;

        // Resimulate with correct inputs
        for (let tick = currentTick + 1; tick <= advanceTo; tick++) {
          applyInputAndStep(world, rbHandle, tick, true);
          snaps.set(tick, world.takeSnapshot());
        }
        currentTick = advanceTo;

        // Check drift at this point
        const rbState = getState(world, rbHandle);
        const checkWorld = createWorld();
        const checkHandle = setupBodies(checkWorld);
        for (let tick = 1; tick <= currentTick; tick++) {
          applyInputAndStep(checkWorld, checkHandle, tick, true);
        }
        const checkState = getState(checkWorld, checkHandle);
        checkWorld.free();

        const dx = Math.abs(rbState.x - checkState.x);
        const dy = Math.abs(rbState.y - checkState.y);
        drifts.push(`Cycle ${cycle + 1} (tick ${currentTick}): dx=${dx.toFixed(8)} dy=${dy.toFixed(8)} ${dx > 0 || dy > 0 ? 'DRIFT!' : 'OK'}`);
      }
    }

    const rbState = getState(world, rbHandle);
    console.log(`Linear:   (${linState.x}, ${linState.y})`);
    console.log(`Rollback: (${rbState.x}, ${rbState.y})`);

    console.log('\nDrift log:');
    for (const d of drifts) console.log(d);

    expect(rbState.x).toBe(linState.x);
    expect(rbState.y).toBe(linState.y);

    linWorld.free();
    world.free();
  });
});
