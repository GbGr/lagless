/**
 * Definitive test: reproduce the EXACT rollback pattern from the real 2d-map-test
 * desync report to determine if Rapier warm-starting causes divergence.
 *
 * Key insight from data: ECS hashes match at tick 1537 but diverge at 1538
 * (a tick with no MoveInput — velocity not overridden by setLinvel).
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

// --- Snapshot history reproducing the gap bug ---

class SimpleSnapshotHistory {
  private entries: { tick: number; data: Uint8Array }[] = [];

  set(tick: number, data: Uint8Array): void {
    const idx = this.entries.findIndex((e) => e.tick === tick);
    if (idx >= 0) {
      this.entries[idx].data = data;
    } else {
      this.entries.push({ tick, data });
      this.entries.sort((a, b) => a.tick - b.tick);
    }
  }

  /** Returns snapshot at greatest tick STRICTLY LESS THAN requested tick. */
  getNearest(tick: number): Uint8Array | null {
    let best: { tick: number; data: Uint8Array } | null = null;
    for (const e of this.entries) {
      if (e.tick < tick) best = e;
    }
    return best?.data ?? null;
  }

  /** Drop all entries with tick >= given tick. */
  rollback(tick: number): void {
    this.entries = this.entries.filter((e) => e.tick < tick);
  }
}

// --- World setup (matches 2d-map-test) ---

function createWorld(): RapierWorld2d {
  const world = new rapier.World({ x: 0, y: 0 });
  world.timestep = TIMESTEP;
  return world;
}

/** Sets up static obstacles + one player. Returns player handle. */
function setupSinglePlayer(world: RapierWorld2d): number {
  for (let i = 0; i < 20; i++) {
    const bodyDesc = rapier.RigidBodyDesc.fixed()
      .setTranslation(100 + i * 40, 200 + (i % 5) * 30);
    const body = world.createRigidBody(bodyDesc);
    world.createCollider(rapier.ColliderDesc.ball(8), body);
  }

  const playerDesc = rapier.RigidBodyDesc.dynamic().setTranslation(200, 200);
  const player = world.createRigidBody(playerDesc);
  player.setLinearDamping(0.1);
  const cd = rapier.ColliderDesc.ball(20);
  cd.setFriction(0);
  cd.setRestitution(1);
  world.createCollider(cd, player);
  return player.handle;
}

/** Sets up static obstacles + TWO players (like real 2d-map-test). Returns [handle0, handle1]. */
function setupTwoPlayers(world: RapierWorld2d): [number, number] {
  for (let i = 0; i < 20; i++) {
    const bodyDesc = rapier.RigidBodyDesc.fixed()
      .setTranslation(100 + i * 40, 200 + (i % 5) * 30);
    const body = world.createRigidBody(bodyDesc);
    world.createCollider(rapier.ColliderDesc.ball(8), body);
  }

  function createPlayer(x: number, y: number): number {
    const desc = rapier.RigidBodyDesc.dynamic().setTranslation(x, y);
    const body = world.createRigidBody(desc);
    body.setLinearDamping(0.1);
    const cd = rapier.ColliderDesc.ball(20);
    cd.setFriction(0);
    cd.setRestitution(1);
    world.createCollider(cd, body);
    return body.handle;
  }

  return [createPlayer(200, 200), createPlayer(250, 220)];
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
): void {
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
  x: number; y: number; vx: number; vy: number;
}

function getState(world: RapierWorld2d, handle: number): TickState {
  const body = world.getRigidBody(handle);
  const pos = body.translation();
  const vel = body.linvel();
  return { x: pos.x, y: pos.y, vx: vel.x, vy: vel.y };
}

/**
 * Core rollback simulation: given a linear reference, simulate with delayed inputs
 * and overlapping rollbacks, then compare final state.
 * Returns { match, rollbackCount, firstDivTick }
 */
function runRollbackTest(opts: {
  totalTicks: number;
  batchSize: number;
  setupFn: (world: RapierWorld2d) => number;
  inputFn: (world: RapierWorld2d, handle: number, tick: number, hasInput: boolean) => void;
}): { match: boolean; rollbackCount: number; firstDivTick: number; linState: TickState; rbState: TickState } {
  const { totalTicks, batchSize, setupFn, inputFn } = opts;

  // Linear reference
  const linWorld = createWorld();
  const linHandle = setupFn(linWorld);
  const linStates = new Map<number, TickState>();
  for (let tick = 1; tick <= totalTicks; tick++) {
    inputFn(linWorld, linHandle, tick, true);
    linStates.set(tick, getState(linWorld, linHandle));
  }

  // Rollback simulation
  let rbWorld = createWorld() as RapierWorld2d;
  const rbHandle = setupFn(rbWorld);
  const snaps = new SimpleSnapshotHistory();
  snaps.set(0, rbWorld.takeSnapshot());

  let currentTick = 0;
  let inputsUpTo = 0;
  let rollbackCount = 0;
  let firstDivTick = -1;

  while (currentTick < totalTicks) {
    const advanceTo = Math.min(currentTick + batchSize, totalTicks);

    // Forward simulate
    for (let tick = currentTick + 1; tick <= advanceTo; tick++) {
      inputFn(rbWorld, rbHandle, tick, tick <= inputsUpTo);
      snaps.set(tick, rbWorld.takeSnapshot());
    }
    currentTick = advanceTo;

    // Deliver inputs up to currentTick
    const oldInputs = inputsUpTo;
    inputsUpTo = currentTick;

    // Rollback if new inputs arrived
    if (inputsUpTo > oldInputs) {
      const rollbackTo = oldInputs + 1;
      const snap = snaps.getNearest(rollbackTo);
      if (snap) {
        rbWorld.free();
        rbWorld = rapier.World.restoreSnapshot(snap)! as unknown as RapierWorld2d;
        // Gap bug: getNearest found tick T, we drop >= T
        const restoredTick = rollbackTo - 1;
        snaps.rollback(restoredTick);
        currentTick = restoredTick;
        rollbackCount++;

        // Resimulate with correct inputs
        for (let tick = currentTick + 1; tick <= advanceTo; tick++) {
          inputFn(rbWorld, rbHandle, tick, tick <= inputsUpTo);
          snaps.set(tick, rbWorld.takeSnapshot());

          // Check per-tick against linear
          if (firstDivTick < 0) {
            const rbState = getState(rbWorld, rbHandle);
            const linState = linStates.get(tick)!;
            if (rbState.x !== linState.x || rbState.y !== linState.y ||
              rbState.vx !== linState.vx || rbState.vy !== linState.vy) {
              firstDivTick = tick;
              console.log(`First divergence at tick ${tick} (rollback #${rollbackCount}):`);
              console.log(`  Linear:   pos=(${linState.x}, ${linState.y}) vel=(${linState.vx}, ${linState.vy})`);
              console.log(`  Rollback: pos=(${rbState.x}, ${rbState.y}) vel=(${rbState.vx}, ${rbState.vy})`);
            }
          }
        }
        currentTick = advanceTo;
      }
    }
  }

  const linState = linStates.get(totalTicks)!;
  const rbState = getState(rbWorld, rbHandle);
  const match = rbState.x === linState.x && rbState.y === linState.y &&
    rbState.vx === linState.vx && rbState.vy === linState.vy;

  linWorld.free();
  rbWorld.free();

  return { match, rollbackCount, firstDivTick, linState, rbState };
}

describe('Real-world rollback desync reproduction', () => {
  it('single player: rollback with full batch input delivery should match linear', () => {
    const result = runRollbackTest({
      totalTicks: 2000,
      batchSize: 22,
      setupFn: setupSinglePlayer,
      inputFn: applyInputAndStep,
    });

    console.log(`Rollbacks: ${result.rollbackCount}, First div: ${result.firstDivTick}`);
    console.log(`Linear:   pos=(${result.linState.x}, ${result.linState.y})`);
    console.log(`Rollback: pos=(${result.rbState.x}, ${result.rbState.y})`);

    expect(result.match).toBe(true);
  });

  it('two players: rollback with full batch input delivery should match linear', () => {
    // This tests two dynamic bodies interacting — the key difference from the single-player test
    const result = runRollbackTest({
      totalTicks: 2000,
      batchSize: 22,
      setupFn: (world) => setupTwoPlayers(world)[0], // return first player handle
      inputFn: applyInputAndStep,
    });

    console.log(`Rollbacks: ${result.rollbackCount}, First div: ${result.firstDivTick}`);
    console.log(`Linear:   pos=(${result.linState.x}, ${result.linState.y})`);
    console.log(`Rollback: pos=(${result.rbState.x}, ${result.rbState.y})`);

    expect(result.match).toBe(true);
  });

  it('incremental input delivery (2-4 ticks at a time) should match linear', () => {
    // Reproduces the real game pattern where inputs arrive 2-4 ticks at a time,
    // causing multiple overlapping rollbacks per batch
    const TOTAL_TICKS = 2000;
    const BATCH_SIZE = 22;

    // Linear reference
    const linWorld = createWorld();
    const linHandle = setupSinglePlayer(linWorld);
    for (let tick = 1; tick <= TOTAL_TICKS; tick++) {
      applyInputAndStep(linWorld, linHandle, tick, true);
    }
    const linState = getState(linWorld, linHandle);

    // Rollback simulation with incremental delivery
    let rbWorld = createWorld() as RapierWorld2d;
    const rbHandle = setupSinglePlayer(rbWorld);
    const snaps = new SimpleSnapshotHistory();
    snaps.set(0, rbWorld.takeSnapshot());

    let currentTick = 0;
    let inputsUpTo = 0;
    let rollbackCount = 0;

    while (currentTick < TOTAL_TICKS) {
      const advanceTo = Math.min(currentTick + BATCH_SIZE, TOTAL_TICKS);

      // Forward simulate
      for (let tick = currentTick + 1; tick <= advanceTo; tick++) {
        applyInputAndStep(rbWorld, rbHandle, tick, tick <= inputsUpTo);
        snaps.set(tick, rbWorld.takeSnapshot());
      }
      currentTick = advanceTo;

      // Incremental input delivery: deliver 2-4 ticks at a time, each triggering a rollback
      while (inputsUpTo < currentTick) {
        const oldInputs = inputsUpTo;
        const deliverySize = 2 + (inputsUpTo % 3);
        inputsUpTo = Math.min(inputsUpTo + deliverySize, currentTick);

        const rollbackTo = oldInputs + 1;
        const snap = snaps.getNearest(rollbackTo);
        if (snap) {
          rbWorld.free();
          rbWorld = rapier.World.restoreSnapshot(snap)! as unknown as RapierWorld2d;
          const restoredTick = rollbackTo - 1;
          snaps.rollback(restoredTick);
          currentTick = restoredTick;
          rollbackCount++;

          for (let tick = currentTick + 1; tick <= advanceTo; tick++) {
            applyInputAndStep(rbWorld, rbHandle, tick, tick <= inputsUpTo);
            snaps.set(tick, rbWorld.takeSnapshot());
          }
          currentTick = advanceTo;
        }
      }
    }

    const rbState = getState(rbWorld, rbHandle);
    console.log(`Rollbacks: ${rollbackCount}`);
    console.log(`Linear:   pos=(${linState.x}, ${linState.y}) vel=(${linState.vx}, ${linState.vy})`);
    console.log(`Rollback: pos=(${rbState.x}, ${rbState.y}) vel=(${rbState.vx}, ${rbState.vy})`);

    expect(rbState.x).toBe(linState.x);
    expect(rbState.y).toBe(linState.y);
    expect(rbState.vx).toBe(linState.vx);
    expect(rbState.vy).toBe(linState.vy);

    linWorld.free();
    rbWorld.free();
  });

  it('two players with incremental delivery should match linear', () => {
    const TOTAL_TICKS = 2000;
    const BATCH_SIZE = 22;

    // Linear reference with two players
    const linWorld = createWorld();
    const [linP0, linP1] = setupTwoPlayers(linWorld);
    for (let tick = 1; tick <= TOTAL_TICKS; tick++) {
      applyInputAndStep(linWorld, linP0, tick, true);
    }
    const linState0 = getState(linWorld, linP0);
    const linState1 = getState(linWorld, linP1);

    // Rollback simulation
    let rbWorld = createWorld() as RapierWorld2d;
    const [rbP0, rbP1] = setupTwoPlayers(rbWorld);
    const snaps = new SimpleSnapshotHistory();
    snaps.set(0, rbWorld.takeSnapshot());

    let currentTick = 0;
    let inputsUpTo = 0;
    let rollbackCount = 0;

    while (currentTick < TOTAL_TICKS) {
      const advanceTo = Math.min(currentTick + BATCH_SIZE, TOTAL_TICKS);

      for (let tick = currentTick + 1; tick <= advanceTo; tick++) {
        applyInputAndStep(rbWorld, rbP0, tick, tick <= inputsUpTo);
        snaps.set(tick, rbWorld.takeSnapshot());
      }
      currentTick = advanceTo;

      while (inputsUpTo < currentTick) {
        const oldInputs = inputsUpTo;
        const deliverySize = 2 + (inputsUpTo % 3);
        inputsUpTo = Math.min(inputsUpTo + deliverySize, currentTick);

        const rollbackTo = oldInputs + 1;
        const snap = snaps.getNearest(rollbackTo);
        if (snap) {
          rbWorld.free();
          rbWorld = rapier.World.restoreSnapshot(snap)! as unknown as RapierWorld2d;
          snaps.rollback(rollbackTo - 1);
          currentTick = rollbackTo - 1;
          rollbackCount++;

          for (let tick = currentTick + 1; tick <= advanceTo; tick++) {
            applyInputAndStep(rbWorld, rbP0, tick, tick <= inputsUpTo);
            snaps.set(tick, rbWorld.takeSnapshot());
          }
          currentTick = advanceTo;
        }
      }
    }

    const rbState0 = getState(rbWorld, rbP0);
    const rbState1 = getState(rbWorld, rbP1);

    console.log(`Rollbacks: ${rollbackCount}`);
    console.log(`P0 Linear:   pos=(${linState0.x}, ${linState0.y})`);
    console.log(`P0 Rollback: pos=(${rbState0.x}, ${rbState0.y})`);
    console.log(`P1 Linear:   pos=(${linState1.x}, ${linState1.y})`);
    console.log(`P1 Rollback: pos=(${rbState1.x}, ${rbState1.y})`);

    const match0 = rbState0.x === linState0.x && rbState0.y === linState0.y;
    const match1 = rbState1.x === linState1.x && rbState1.y === linState1.y;

    if (!match0) {
      console.log(`P0 DIVERGED: dx=${Math.abs(rbState0.x - linState0.x)} dy=${Math.abs(rbState0.y - linState0.y)}`);
    }
    if (!match1) {
      console.log(`P1 DIVERGED: dx=${Math.abs(rbState1.x - linState1.x)} dy=${Math.abs(rbState1.y - linState1.y)}`);
    }

    expect(match0).toBe(true);
    expect(match1).toBe(true);

    linWorld.free();
    rbWorld.free();
  });

  it('snapshot gap bug with same inputs causes no divergence', () => {
    const TICKS = 100;

    const linWorld = createWorld();
    const linHandle = setupSinglePlayer(linWorld);
    for (let tick = 1; tick <= TICKS; tick++) {
      applyInputAndStep(linWorld, linHandle, tick, true);
    }
    const linState = getState(linWorld, linHandle);

    let rbWorld = createWorld() as RapierWorld2d;
    const rbHandle = setupSinglePlayer(rbWorld);
    const snaps = new SimpleSnapshotHistory();
    snaps.set(0, rbWorld.takeSnapshot());

    // Simulate to tick 50
    for (let tick = 1; tick <= 50; tick++) {
      applyInputAndStep(rbWorld, rbHandle, tick, true);
      snaps.set(tick, rbWorld.takeSnapshot());
    }

    // Rollback to 25 (restores from 24, gap drops 24)
    rbWorld.free();
    rbWorld = rapier.World.restoreSnapshot(snaps.getNearest(25)!)! as unknown as RapierWorld2d;
    snaps.rollback(24);

    for (let tick = 25; tick <= 50; tick++) {
      applyInputAndStep(rbWorld, rbHandle, tick, true);
      snaps.set(tick, rbWorld.takeSnapshot());
    }

    // Rollback to 25 AGAIN (24 gone, uses 23)
    rbWorld.free();
    rbWorld = rapier.World.restoreSnapshot(snaps.getNearest(25)!)! as unknown as RapierWorld2d;
    snaps.rollback(23);

    for (let tick = 24; tick <= TICKS; tick++) {
      applyInputAndStep(rbWorld, rbHandle, tick, true);
      snaps.set(tick, rbWorld.takeSnapshot());
    }

    const rbState = getState(rbWorld, rbHandle);
    expect(rbState.x).toBe(linState.x);
    expect(rbState.y).toBe(linState.y);

    linWorld.free();
    rbWorld.free();
  });
});
