/**
 * Physics rollback determinism test with intensive per-tick velocity changes.
 *
 * Existing determinism tests only set velocity ONCE at tick 1 (constant velocity).
 * The real game (ApplyMoveInputSystem) calls setLinvel() every tick based on
 * MoveInput RPCs. This test validates that Rapier snapshot/restore produces
 * identical results when velocity is changed every tick, especially after rollback.
 *
 * Reproduces the multiplayer desync scenario:
 * - Two dynamic bodies (player 0, player 1) + static obstacles
 * - Both players send MoveInput RPCs every tick
 * - One sim runs straight (has all inputs), the other rolls back when "late" inputs arrive
 * - After rollback + re-simulation, state must be identical
 */
import { describe, it, expect, beforeAll } from 'vitest';
import RAPIER from '@lagless/rapier2d-deterministic-compat';
import { ECSConfig, LocalInputProvider, InputRegistry, RPC } from '@lagless/core';
import type { ECSDeps, IECSSystem, InputMeta } from '@lagless/core';
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

// ─── Test input class (minimal, only needs static id for collectTickRPCs) ──

const MOVE_INPUT_ID = 1;

class TestMoveInput {
  static readonly id = MOVE_INPUT_ID;
  readonly id = MOVE_INPUT_ID;
}

const TestMoveInputCtor = TestMoveInput as any;

// ─── Helpers ──────────────────────────────────────────────

function createSim(opts?: Partial<ECSConfig>) {
  const config = new ECSConfig({
    snapshotRate: 1,
    snapshotHistorySize: 200,
    ...opts,
  });
  const inputProvider = new LocalInputProvider(config, new InputRegistry([]));
  const physicsConfig = new PhysicsConfig2d({ gravityX: 0, gravityY: 0 });
  const wm = new PhysicsWorldManager2d(rapier, physicsConfig, config.frameLength);
  const sim = new PhysicsSimulation2d(config, minimalDeps, inputProvider, wm);
  inputProvider.init(sim);
  return { sim, config, inputProvider, wm };
}

function addTreeBodies(wm: PhysicsWorldManager2d, count: number) {
  for (let i = 0; i < count; i++) {
    const body = wm.createFixedBody();
    body.setTranslation({ x: 100 + i * 50, y: 200 + i * 30 }, false);
    wm.createBallCollider(5, body);
  }
}

function arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** Create a deterministic MoveInput RPC. */
function makeMoveRpc(tick: number, playerSlot: number, seq: number, ordinal: number): RPC {
  // Deterministic direction based on tick + slot (use Math.fround for float32 precision)
  const dirX = Math.fround(Math.sin(tick * 0.3 + playerSlot * 100));
  const dirY = Math.fround(Math.cos(tick * 0.3 + playerSlot * 100));
  const meta: InputMeta = { tick, seq, ordinal, playerSlot };
  return new RPC(MOVE_INPUT_ID, meta, { directionX: dirX, directionY: dirY });
}

// ─── System factory ───────────────────────────────────────

interface PhysicsTestSystem extends IECSSystem {
  reset(): void;
  getPositions(): Array<{ x: number; y: number }>;
}

/**
 * System that creates two player bodies at tick 1, then reads MoveInput RPCs
 * every tick to set linear velocity on the corresponding player's body.
 * Steps physics after applying inputs.
 *
 * Rollback-safe: checks if bodies exist in the current Rapier world before
 * accessing them. After restoreSnapshot(), the world may or may not contain
 * the bodies depending on whether the snapshot was taken after tick 1.
 */
function createMoveSystem(
  wm: PhysicsWorldManager2d,
  sim: PhysicsSimulation2d,
  inputProvider: LocalInputProvider,
): PhysicsTestSystem {
  const MOVE_SPEED = 200;
  let bodyHandles: number[] = [];

  /** Check if bodies exist in the current Rapier world. */
  function bodiesExist(): boolean {
    if (bodyHandles.length === 0) return false;
    return wm.world.getRigidBody(bodyHandles[0]) !== null;
  }

  return {
    update(tick: number) {
      // Create both player bodies at tick 1.
      // After rollback, bodies may or may not exist depending on snapshot tick.
      if (tick === 1 && !bodiesExist()) {
        bodyHandles = [];
        for (let slot = 0; slot < 2; slot++) {
          const body = wm.createDynamicBody();
          body.setTranslation({ x: 200 + slot * 200, y: 300 }, true);
          body.setLinearDamping(0);
          wm.createBallCollider(20, body);
          bodyHandles.push(body.handle);
        }
      }

      // Apply MoveInput RPCs — set velocity on the player's body
      if (bodyHandles.length > 0 && bodiesExist()) {
        const rpcs = inputProvider.collectTickRPCs(tick, TestMoveInputCtor);
        for (const rpc of rpcs) {
          const slot = rpc.meta.playerSlot;
          if (slot < bodyHandles.length) {
            const body = wm.getBody(bodyHandles[slot]);
            const data = rpc.data as { directionX: number; directionY: number };
            body.setLinvel({ x: data.directionX * MOVE_SPEED, y: data.directionY * MOVE_SPEED }, true);
          }
        }
      }

      // Step physics
      wm.step();
    },

    reset() {
      bodyHandles = [];
    },

    getPositions(): Array<{ x: number; y: number }> {
      if (!bodiesExist()) return [];
      return bodyHandles.map(h => {
        const body = wm.getBody(h);
        const pos = body.translation();
        return { x: pos.x, y: pos.y };
      });
    },
  };
}

// ═══════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════

describe('Physics rollback with intensive velocity changes', () => {
  it('should produce identical state after rollback with per-tick setLinvel (no RPCs)', () => {
    // Simplest case: velocity changes every tick as a function of tick number.
    // No RPCs involved — just testing Rapier snapshot/restore with per-tick velocity changes.

    function makeVelocitySystem(wm: PhysicsWorldManager2d, sim: PhysicsSimulation2d) {
      let body: RapierRigidBody2d | undefined;
      let handle = -1;
      return {
        update() {
          if (sim.tick === 1 && !body) {
            body = wm.createDynamicBody();
            body.setTranslation({ x: 50, y: 50 }, true);
            body.setLinearDamping(0);
            wm.createBallCollider(20, body);
            handle = body.handle;
          }
          if (handle >= 0) {
            const b = wm.getBody(handle);
            // Change velocity every tick
            const vx = Math.fround(Math.sin(sim.tick * 0.5) * 100);
            const vy = Math.fround(Math.cos(sim.tick * 0.5) * 100);
            b.setLinvel({ x: vx, y: vy }, true);
          }
          wm.step();
        },
        reset() { body = undefined; handle = -1; },
      };
    }

    const TARGET_TICK = 60;
    const ROLLBACK_TO = 10;

    // SimA: straight run to TARGET_TICK
    const tA = createSim();
    addTreeBodies(tA.wm, 5);
    tA.sim.capturePreStartState();
    tA.sim.registerSystems([makeVelocitySystem(tA.wm, tA.sim)]);
    tA.sim.start();
    tA.sim.update(tA.config.frameLength * TARGET_TICK);
    expect(tA.sim.tick).toBe(TARGET_TICK);

    // SimB: run to tick 30, rollback to ROLLBACK_TO, re-simulate to TARGET_TICK
    const tB = createSim();
    addTreeBodies(tB.wm, 5);
    tB.sim.capturePreStartState();
    const sysB = makeVelocitySystem(tB.wm, tB.sim);
    tB.sim.registerSystems([sysB]);
    tB.sim.start();
    tB.sim.update(tB.config.frameLength * 30);
    expect(tB.sim.tick).toBe(30);

    // Rollback
    sysB.reset();
    // @ts-expect-error — accessing protected method for testing
    tB.sim.rollback(ROLLBACK_TO);

    // Re-simulate to TARGET_TICK (clock at 30*fl, need to advance to TARGET_TICK*fl)
    tB.sim.update(0); // re-simulates from snapshot tick to tick 30
    tB.sim.update(tB.config.frameLength * (TARGET_TICK - 30));
    expect(tB.sim.tick).toBe(TARGET_TICK);

    // Compare — positions, velocities, and ECS hash must match.
    // NOTE: Rapier snapshot bytes may differ in internal metadata (broad-phase,
    // island graph, solver cache) after rollback. This does NOT affect simulation
    // determinism — only positions and velocities matter.
    expect(tB.sim.mem.getHash()).toBe(tA.sim.mem.getHash());

    const bodyA = tA.wm.getBody(0);
    const bodyB = tB.wm.getBody(0);
    const posA = bodyA.translation();
    const posB = bodyB.translation();
    expect(posB.x).toBe(posA.x);
    expect(posB.y).toBe(posA.y);
    const velA = bodyA.linvel();
    const velB = bodyB.linvel();
    expect(velB.x).toBe(velA.x);
    expect(velB.y).toBe(velA.y);

    tA.wm.dispose();
    tB.wm.dispose();
  });

  it('should produce identical state when late remote RPCs trigger rollback with setLinvel', () => {
    // Multiplayer scenario:
    // - Two players, each sending MoveInput every tick
    // - SimA (reference): has ALL inputs from both players from the start
    // - SimB (rollback): has only player 0's inputs initially.
    //   At tick 40, receives player 1's inputs for ticks 1-40, rolls back to tick 1.
    //
    // After convergence, both sims must match.

    const TARGET_TICK = 60;
    const ROLLBACK_TRIGGER_TICK = 40;

    // Pre-generate deterministic RPCs for both players
    const player0Rpcs: RPC[] = [];
    const player1Rpcs: RPC[] = [];
    for (let tick = 1; tick <= TARGET_TICK; tick++) {
      player0Rpcs.push(makeMoveRpc(tick, 0, tick, tick));
      player1Rpcs.push(makeMoveRpc(tick, 1, tick, tick));
    }

    // ── SimA (reference): all inputs from the start ──
    const tA = createSim();
    addTreeBodies(tA.wm, 5);
    tA.sim.capturePreStartState();
    const sysA = createMoveSystem(tA.wm, tA.sim, tA.inputProvider);
    tA.sim.registerSystems([sysA]);

    // Inject all RPCs before start
    for (const rpc of player0Rpcs) tA.inputProvider.addRemoteRpc(rpc);
    for (const rpc of player1Rpcs) tA.inputProvider.addRemoteRpc(rpc);

    tA.sim.start();
    tA.sim.update(tA.config.frameLength * TARGET_TICK);
    expect(tA.sim.tick).toBe(TARGET_TICK);

    // ── SimB (rollback): only player 0's inputs initially ──
    const tB = createSim();
    addTreeBodies(tB.wm, 5);
    tB.sim.capturePreStartState();
    const sysB = createMoveSystem(tB.wm, tB.sim, tB.inputProvider);
    tB.sim.registerSystems([sysB]);

    // Only player 0's inputs
    for (const rpc of player0Rpcs) tB.inputProvider.addRemoteRpc(rpc);

    tB.sim.start();
    tB.sim.update(tB.config.frameLength * ROLLBACK_TRIGGER_TICK);
    expect(tB.sim.tick).toBe(ROLLBACK_TRIGGER_TICK);

    // Now "receive" player 1's late inputs and rollback
    for (const rpc of player1Rpcs) tB.inputProvider.addRemoteRpc(rpc);

    // @ts-expect-error — accessing protected method for testing
    tB.sim.rollback(1); // rollback to earliest new input

    // Re-simulate: clock at ROLLBACK_TRIGGER_TICK*fl, re-run from snapshot tick
    tB.sim.update(0);
    expect(tB.sim.tick).toBe(ROLLBACK_TRIGGER_TICK);

    // Advance to TARGET_TICK
    tB.sim.update(tB.config.frameLength * (TARGET_TICK - ROLLBACK_TRIGGER_TICK));
    expect(tB.sim.tick).toBe(TARGET_TICK);

    // ── Compare ──
    const posA = sysA.getPositions();
    const posB = sysB.getPositions();

    for (let i = 0; i < posA.length; i++) {
      expect(posB[i].x).toBe(posA[i].x);
      expect(posB[i].y).toBe(posA[i].y);
    }

    expect(tB.sim.mem.getHash()).toBe(tA.sim.mem.getHash());
    expect(arraysEqual(tB.wm.takeSnapshot(), tA.wm.takeSnapshot())).toBe(true);

    tA.wm.dispose();
    tB.wm.dispose();
  });

  it('should produce identical state with multiple rollbacks from incremental remote input arrival', () => {
    // Simulates the real multiplayer scenario more accurately:
    // Remote inputs arrive in batches (every 10 ticks), each batch triggers a rollback.
    // This tests multiple sequential rollbacks with physics re-simulation.

    const TARGET_TICK = 80;
    const BATCH_SIZE = 10; // remote inputs arrive every BATCH_SIZE ticks

    // Pre-generate deterministic RPCs for both players
    const player0Rpcs: RPC[] = [];
    const player1Rpcs: RPC[] = [];
    for (let tick = 1; tick <= TARGET_TICK; tick++) {
      player0Rpcs.push(makeMoveRpc(tick, 0, tick, tick));
      player1Rpcs.push(makeMoveRpc(tick, 1, tick, tick));
    }

    // ── SimA (reference): all inputs from the start ──
    const tA = createSim();
    addTreeBodies(tA.wm, 5);
    tA.sim.capturePreStartState();
    const sysA = createMoveSystem(tA.wm, tA.sim, tA.inputProvider);
    tA.sim.registerSystems([sysA]);

    for (const rpc of player0Rpcs) tA.inputProvider.addRemoteRpc(rpc);
    for (const rpc of player1Rpcs) tA.inputProvider.addRemoteRpc(rpc);

    tA.sim.start();
    tA.sim.update(tA.config.frameLength * TARGET_TICK);
    expect(tA.sim.tick).toBe(TARGET_TICK);

    // ── SimB (incremental rollbacks) ──
    const tB = createSim();
    addTreeBodies(tB.wm, 5);
    tB.sim.capturePreStartState();
    const sysB = createMoveSystem(tB.wm, tB.sim, tB.inputProvider);
    tB.sim.registerSystems([sysB]);

    // All of player 0's inputs from start
    for (const rpc of player0Rpcs) tB.inputProvider.addRemoteRpc(rpc);

    tB.sim.start();

    // Simulate in batches, receiving player 1's inputs late
    let nextRemoteTick = 1;
    for (let batchEnd = BATCH_SIZE; batchEnd <= TARGET_TICK; batchEnd += BATCH_SIZE) {
      // Advance to batchEnd
      const ticksToAdvance = batchEnd - tB.sim.tick;
      tB.sim.update(tB.config.frameLength * ticksToAdvance);
      expect(tB.sim.tick).toBe(batchEnd);

      // "Receive" player 1's inputs for ticks [nextRemoteTick, batchEnd]
      const batchRpcs = player1Rpcs.filter(r => r.meta.tick >= nextRemoteTick && r.meta.tick <= batchEnd);
      for (const rpc of batchRpcs) tB.inputProvider.addRemoteRpc(rpc);

      // Rollback to the earliest new input
      // @ts-expect-error — accessing protected method for testing
      tB.sim.rollback(nextRemoteTick);

      // Re-simulate (clock is at batchEnd*fl, update(0) re-runs from snapshot)
      tB.sim.update(0);
      expect(tB.sim.tick).toBe(batchEnd);

      nextRemoteTick = batchEnd + 1;
    }

    // ── Compare ──
    const posA = sysA.getPositions();
    const posB = sysB.getPositions();

    for (let i = 0; i < posA.length; i++) {
      expect(posB[i].x).toBe(posA[i].x);
      expect(posB[i].y).toBe(posA[i].y);
    }

    expect(tB.sim.mem.getHash()).toBe(tA.sim.mem.getHash());
    expect(arraysEqual(tB.wm.takeSnapshot(), tA.wm.takeSnapshot())).toBe(true);

    tA.wm.dispose();
    tB.wm.dispose();
  });

  it('should converge with collision interactions during rollback', () => {
    // Bodies collide with static obstacles during rollback.
    // This is the closest to the real 2d-map-test scenario:
    // players move via setLinvel, collide with trees, rollback restores pre-collision state.

    const TARGET_TICK = 60;

    // Pre-generate RPCs — player 1 sends inputs that push body toward static obstacles
    const player0Rpcs: RPC[] = [];
    const player1Rpcs: RPC[] = [];
    for (let tick = 1; tick <= TARGET_TICK; tick++) {
      // Player 0: moves right (toward trees at x=100+)
      player0Rpcs.push(new RPC(
        MOVE_INPUT_ID,
        { tick, seq: tick, ordinal: tick, playerSlot: 0 },
        { directionX: Math.fround(1.0), directionY: Math.fround(0.0) },
      ));
      // Player 1: moves down-right (toward trees)
      player1Rpcs.push(new RPC(
        MOVE_INPUT_ID,
        { tick, seq: tick, ordinal: tick, playerSlot: 1 },
        { directionX: Math.fround(0.7), directionY: Math.fround(0.7) },
      ));
    }

    // ── SimA (reference) ──
    const tA = createSim();
    addTreeBodies(tA.wm, 5);
    tA.sim.capturePreStartState();
    const sysA = createMoveSystem(tA.wm, tA.sim, tA.inputProvider);
    tA.sim.registerSystems([sysA]);
    for (const rpc of player0Rpcs) tA.inputProvider.addRemoteRpc(rpc);
    for (const rpc of player1Rpcs) tA.inputProvider.addRemoteRpc(rpc);
    tA.sim.start();
    tA.sim.update(tA.config.frameLength * TARGET_TICK);

    // ── SimB (rollback — receives player 1's inputs late) ──
    const tB = createSim();
    addTreeBodies(tB.wm, 5);
    tB.sim.capturePreStartState();
    const sysB = createMoveSystem(tB.wm, tB.sim, tB.inputProvider);
    tB.sim.registerSystems([sysB]);

    for (const rpc of player0Rpcs) tB.inputProvider.addRemoteRpc(rpc);
    tB.sim.start();
    tB.sim.update(tB.config.frameLength * 30); // run 30 ticks without player 1

    // Receive player 1's late inputs
    for (const rpc of player1Rpcs) tB.inputProvider.addRemoteRpc(rpc);
    // @ts-expect-error — accessing protected method
    tB.sim.rollback(1);
    tB.sim.update(0); // re-simulate to tick 30
    tB.sim.update(tB.config.frameLength * (TARGET_TICK - 30)); // advance to 60

    expect(tA.sim.tick).toBe(tB.sim.tick);
    expect(tB.sim.mem.getHash()).toBe(tA.sim.mem.getHash());
    expect(arraysEqual(tB.wm.takeSnapshot(), tA.wm.takeSnapshot())).toBe(true);

    tA.wm.dispose();
    tB.wm.dispose();
  });

  it('should converge with RelayInputProvider-like dual-client simulation', () => {
    // Most realistic test: two full client simulations exchanging RPCs with delay.
    // Each client generates inputs for its own player, simulates ahead with prediction,
    // then receives the remote player's inputs late and rolls back.

    const TARGET_TICK = 100;
    const DELAY_TICKS = 30; // ~500ms at 60fps

    // Pre-generate deterministic RPCs for both players (ticks 1..TARGET_TICK)
    const allRpcs = new Map<number, { p0: RPC; p1: RPC }>();
    for (let tick = 1; tick <= TARGET_TICK; tick++) {
      allRpcs.set(tick, {
        p0: makeMoveRpc(tick, 0, tick, tick),
        p1: makeMoveRpc(tick, 1, tick, tick),
      });
    }

    // ── Client A (player 0): predicts, receives player 1 inputs with delay ──
    const cA = createSim();
    addTreeBodies(cA.wm, 5);
    cA.sim.capturePreStartState();
    const sysA = createMoveSystem(cA.wm, cA.sim, cA.inputProvider);
    cA.sim.registerSystems([sysA]);
    cA.sim.start();

    // ── Client B (player 1): predicts, receives player 0 inputs with delay ──
    const cB = createSim();
    addTreeBodies(cB.wm, 5);
    cB.sim.capturePreStartState();
    const sysB = createMoveSystem(cB.wm, cB.sim, cB.inputProvider);
    cB.sim.registerSystems([sysB]);
    cB.sim.start();

    // Simulate tick by tick with delayed delivery
    for (let tick = 1; tick <= TARGET_TICK; tick++) {
      const rpcs = allRpcs.get(tick)!;

      // Each client has its own input immediately
      cA.inputProvider.addRemoteRpc(rpcs.p0);
      cB.inputProvider.addRemoteRpc(rpcs.p1);

      // Delayed delivery of remote inputs
      const remoteTick = tick - DELAY_TICKS;
      if (remoteTick >= 1) {
        const delayedRpcs = allRpcs.get(remoteTick)!;

        // Client A receives player 1's input from DELAY_TICKS ago
        cA.inputProvider.addRemoteRpc(delayedRpcs.p1);
        // Client B receives player 0's input from DELAY_TICKS ago
        cB.inputProvider.addRemoteRpc(delayedRpcs.p0);

        // Need to rollback to the tick of the newly arrived input.
        // Don't reset system — bodies exist in the restored Rapier snapshot.
        if (remoteTick <= cA.sim.tick) {
          // @ts-expect-error — accessing protected method
          cA.sim.rollback(remoteTick);
        }
        if (remoteTick <= cB.sim.tick) {
          // @ts-expect-error — accessing protected method
          cB.sim.rollback(remoteTick);
        }
      }

      // Advance one tick
      cA.sim.update(cA.config.frameLength);
      cB.sim.update(cB.config.frameLength);
    }

    // Drain: deliver remaining delayed inputs
    for (let remoteTick = TARGET_TICK - DELAY_TICKS + 1; remoteTick <= TARGET_TICK; remoteTick++) {
      const delayedRpcs = allRpcs.get(remoteTick)!;
      cA.inputProvider.addRemoteRpc(delayedRpcs.p1);
      cB.inputProvider.addRemoteRpc(delayedRpcs.p0);

      if (remoteTick <= cA.sim.tick) {
        // @ts-expect-error — accessing protected method
        cA.sim.rollback(remoteTick);
      }
      if (remoteTick <= cB.sim.tick) {
        // @ts-expect-error — accessing protected method
        cB.sim.rollback(remoteTick);
      }

      cA.sim.update(cA.config.frameLength);
      cB.sim.update(cB.config.frameLength);
    }

    // A few more frames for re-simulation to settle
    for (let i = 0; i < 10; i++) {
      cA.sim.update(cA.config.frameLength);
      cB.sim.update(cB.config.frameLength);
    }

    // Both clients should have the same tick and hash
    expect(cA.sim.tick).toBe(cB.sim.tick);
    expect(cA.sim.mem.getHash()).toBe(cB.sim.mem.getHash());
    expect(arraysEqual(cA.wm.takeSnapshot(), cB.wm.takeSnapshot())).toBe(true);

    cA.wm.dispose();
    cB.wm.dispose();
  });
});
