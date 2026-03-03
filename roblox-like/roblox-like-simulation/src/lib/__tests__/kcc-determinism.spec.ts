import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { MathOps } from '@lagless/math';
import { ECSConfig, LocalInputProvider, RPC } from '@lagless/core';
import { CharacterControllerManager } from '@lagless/character-controller-3d';
import type { RapierModule3d } from '@lagless/physics3d';
import {
  RobloxLikeRunner,
  RobloxLikeSystems,
  RobloxLikeSignals,
  PlayerJoined,
  CharacterMove,
  RobloxLikeInputRegistry,
  createRobloxLikeCollisionLayers,
  CHARACTER_CONFIG,
  Transform3d,
  CharacterState,
} from '../../index.js';

let rapier: RapierModule3d;

beforeAll(async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const R = (await import('@dimforge/rapier3d-deterministic-compat')).default as any;
  await R.init();
  rapier = R as unknown as RapierModule3d;
  await MathOps.init();
});

const FIXED_SEED = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
const FIXED_PLAYER_ID = new Uint8Array(16); // all zeros

interface RunnerSetup {
  runner: RobloxLikeRunner;
  inputProvider: LocalInputProvider;
  kccManager: CharacterControllerManager;
}

function createRunner(): RunnerSetup {
  const config = new ECSConfig({
    seed: FIXED_SEED,
    snapshotRate: 1,
    snapshotHistorySize: 50,
    maxPlayers: 4,
  });
  const inputProvider = new LocalInputProvider(config, RobloxLikeInputRegistry);
  const collisionLayers = createRobloxLikeCollisionLayers();
  const kccManager = new CharacterControllerManager(CHARACTER_CONFIG);

  const runner = new RobloxLikeRunner(
    config, inputProvider, RobloxLikeSystems, RobloxLikeSignals, rapier,
    undefined, collisionLayers,
    [[CharacterControllerManager, kccManager]],
  );

  kccManager.init(runner.PhysicsWorldManager);

  const sim = runner.Simulation;
  sim.addRollbackHandler(() => {
    kccManager.recreateAll();
  });

  return { runner, inputProvider, kccManager };
}

function injectPlayerJoined(ip: LocalInputProvider, tick: number, slot: number): void {
  ip.addRemoteRpc(new RPC(PlayerJoined.id, {
    tick,
    seq: 0,
    ordinal: 0,
    playerSlot: 255, // SERVER_SLOT
  }, {
    slot,
    playerId: FIXED_PLAYER_ID,
  }));
}

function injectCharacterMove(
  ip: LocalInputProvider, tick: number, slot: number, seq: number,
  dirX: number, dirZ: number, cameraYaw: number, jump = 0, sprint = 0,
): void {
  ip.addRemoteRpc(new RPC(CharacterMove.id, {
    tick,
    seq,
    ordinal: 1,
    playerSlot: slot,
  }, {
    directionX: Math.fround(dirX),
    directionZ: Math.fround(dirZ),
    cameraYaw: Math.fround(cameraYaw),
    jump,
    sprint,
  }));
}

function advanceOneTick(runner: RobloxLikeRunner): void {
  runner.update(runner.Config.frameLength);
}

describe('KCC Determinism', () => {
  const setups: RunnerSetup[] = [];

  afterEach(() => {
    for (const s of setups) {
      s.runner.dispose();
    }
    setups.length = 0;
  });

  it('two identical simulations with no movement should have matching hashes', () => {
    const s1 = createRunner();
    const s2 = createRunner();
    setups.push(s1, s2);

    // Both start
    s1.runner.start();
    s2.runner.start();

    // Inject PlayerJoined for slot 0 at tick 1
    injectPlayerJoined(s1.inputProvider, 1, 0);
    injectPlayerJoined(s2.inputProvider, 1, 0);

    // Run 60 ticks
    for (let i = 0; i < 60; i++) {
      advanceOneTick(s1.runner);
      advanceOneTick(s2.runner);

      const h1 = s1.runner.Simulation.mem.getHash();
      const h2 = s2.runner.Simulation.mem.getHash();
      expect(h1, `Hash mismatch at tick ${s1.runner.Simulation.tick}`).toBe(h2);
    }
  });

  it('two identical simulations with movement should have matching hashes', () => {
    const s1 = createRunner();
    const s2 = createRunner();
    setups.push(s1, s2);

    s1.runner.start();
    s2.runner.start();

    // Player 0 joins at tick 1
    injectPlayerJoined(s1.inputProvider, 1, 0);
    injectPlayerJoined(s2.inputProvider, 1, 0);

    // Movement starts at tick 5 — walk forward
    for (let tick = 5; tick <= 30; tick++) {
      injectCharacterMove(s1.inputProvider, tick, 0, tick, 0, 1, 0);
      injectCharacterMove(s2.inputProvider, tick, 0, tick, 0, 1, 0);
    }

    // Run 60 ticks
    for (let i = 0; i < 60; i++) {
      advanceOneTick(s1.runner);
      advanceOneTick(s2.runner);

      const h1 = s1.runner.Simulation.mem.getHash();
      const h2 = s2.runner.Simulation.mem.getHash();
      expect(h1, `Hash mismatch at tick ${s1.runner.Simulation.tick}`).toBe(h2);
    }
  });

  it('two identical simulations with two players and movement should have matching hashes', () => {
    const s1 = createRunner();
    const s2 = createRunner();
    setups.push(s1, s2);

    s1.runner.start();
    s2.runner.start();

    // Both players join at tick 1
    injectPlayerJoined(s1.inputProvider, 1, 0);
    injectPlayerJoined(s2.inputProvider, 1, 0);
    injectPlayerJoined(s1.inputProvider, 1, 1);
    injectPlayerJoined(s2.inputProvider, 1, 1);

    // Player 0 walks forward, player 1 walks right
    for (let tick = 5; tick <= 40; tick++) {
      injectCharacterMove(s1.inputProvider, tick, 0, tick, 0, 1, 0);
      injectCharacterMove(s2.inputProvider, tick, 0, tick, 0, 1, 0);
      injectCharacterMove(s1.inputProvider, tick, 1, tick, 1, 0, 0.5);
      injectCharacterMove(s2.inputProvider, tick, 1, tick, 1, 0, 0.5);
    }

    // Run 60 ticks
    for (let i = 0; i < 60; i++) {
      advanceOneTick(s1.runner);
      advanceOneTick(s2.runner);

      const h1 = s1.runner.Simulation.mem.getHash();
      const h2 = s2.runner.Simulation.mem.getHash();
      expect(h1, `Hash mismatch at tick ${s1.runner.Simulation.tick}`).toBe(h2);
    }
  });

  it('two identical simulations with sprint + jump should have matching hashes', () => {
    const s1 = createRunner();
    const s2 = createRunner();
    setups.push(s1, s2);

    s1.runner.start();
    s2.runner.start();

    injectPlayerJoined(s1.inputProvider, 1, 0);
    injectPlayerJoined(s2.inputProvider, 1, 0);

    // Sprint forward with jumps
    for (let tick = 5; tick <= 50; tick++) {
      const jump = (tick === 10 || tick === 30) ? 1 : 0;
      injectCharacterMove(s1.inputProvider, tick, 0, tick, 0, 1, 0, jump, 1);
      injectCharacterMove(s2.inputProvider, tick, 0, tick, 0, 1, 0, jump, 1);
    }

    // Run 80 ticks (let gravity resolve)
    for (let i = 0; i < 80; i++) {
      advanceOneTick(s1.runner);
      advanceOneTick(s2.runner);

      const h1 = s1.runner.Simulation.mem.getHash();
      const h2 = s2.runner.Simulation.mem.getHash();
      expect(h1, `Hash mismatch at tick ${s1.runner.Simulation.tick}`).toBe(h2);
    }
  });

  /**
   * THE KEY TEST: simulates what happens in multiplayer.
   * Sim A (truth): has all inputs upfront, runs straight through.
   * Sim B (rollback): runs without movement input, then gets it late,
   * rolls back, and re-simulates. After re-simulation, hashes must match.
   */
  it('rollback + resimulation should produce same state as straight-through run', () => {
    const simA = createRunner();
    const simB = createRunner();
    setups.push(simA, simB);

    simA.runner.start();
    simB.runner.start();

    const fl = simA.runner.Config.frameLength;

    // Both get PlayerJoined at tick 1
    injectPlayerJoined(simA.inputProvider, 1, 0);
    injectPlayerJoined(simB.inputProvider, 1, 0);

    // Sim A gets all CharacterMove inputs upfront (ticks 5-20)
    for (let tick = 5; tick <= 20; tick++) {
      injectCharacterMove(simA.inputProvider, tick, 0, tick, 0, 1, 0);
    }

    // Helper: run until we reach target tick
    function runTo(runner: RobloxLikeRunner, targetTick: number): void {
      while (runner.Simulation.tick < targetTick) {
        runner.update(fl);
      }
    }

    // Run both to tick 4 (before movement starts) — they should be identical
    runTo(simA.runner, 4);
    runTo(simB.runner, 4);
    expect(simA.runner.Simulation.mem.getHash()).toBe(simB.runner.Simulation.mem.getHash());

    // Sim B runs to tick 10 WITHOUT movement input (simulates late input arrival)
    runTo(simB.runner, 10);

    // Sim A also runs to tick 10 (with movement input)
    runTo(simA.runner, 10);

    // At this point, hashes SHOULD differ (Sim B had no movement)
    const hashA_before = simA.runner.Simulation.mem.getHash();
    const hashB_before = simB.runner.Simulation.mem.getHash();
    expect(hashA_before, 'Hashes should differ before rollback').not.toBe(hashB_before);

    // Now "late inputs arrive" for Sim B — add CharacterMove for ticks 5-20
    for (let tick = 5; tick <= 20; tick++) {
      injectCharacterMove(simB.inputProvider, tick, 0, tick, 0, 1, 0);
    }

    // Manually trigger rollback on Sim B to tick 4 (before the first missed input)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sim = simB.runner.Simulation as any;
    sim.rollback(4);
    // Fire rollback handler (recreate KCCs)
    simB.kccManager.recreateAll();

    // Re-simulate: update(0) causes re-simulation from tick 4 to tick 10
    // (clock is still at tick 10's time)
    simB.runner.update(0);

    expect(simB.runner.Simulation.tick).toBe(10);

    // After rollback + resimulation, hashes MUST match
    const hashA_after = simA.runner.Simulation.mem.getHash();
    const hashB_after = simB.runner.Simulation.mem.getHash();
    expect(hashB_after, 'Hash mismatch after rollback+resimulation at tick 10').toBe(hashA_after);

    // Continue running both to tick 30 — hashes should stay in sync
    for (let i = 0; i < 20; i++) {
      advanceOneTick(simA.runner);
      advanceOneTick(simB.runner);

      const h1 = simA.runner.Simulation.mem.getHash();
      const h2 = simB.runner.Simulation.mem.getHash();
      expect(h1, `Hash mismatch at tick ${simA.runner.Simulation.tick}`).toBe(h2);
    }
  });

  /**
   * Test: multiple sequential rollbacks, like real multiplayer where
   * remote inputs arrive continuously causing repeated rollback+resimulation.
   */
  it('multiple sequential rollbacks should produce same state as straight-through', () => {
    const simA = createRunner();
    const simB = createRunner();
    setups.push(simA, simB);

    simA.runner.start();
    simB.runner.start();

    const fl = simA.runner.Config.frameLength;

    // Both get PlayerJoined at tick 1
    injectPlayerJoined(simA.inputProvider, 1, 0);
    injectPlayerJoined(simB.inputProvider, 1, 0);

    // Sim A gets ALL inputs upfront (ticks 5-30)
    for (let tick = 5; tick <= 30; tick++) {
      injectCharacterMove(simA.inputProvider, tick, 0, tick, 0, 1, 0);
    }

    // Run Sim A all the way to tick 35
    while (simA.runner.Simulation.tick < 35) {
      simA.runner.update(fl);
    }

    // Sim B: simulate inputs arriving in batches with rollbacks
    // Run to tick 4 first (before any movement)
    while (simB.runner.Simulation.tick < 4) {
      simB.runner.update(fl);
    }

    // Simulate remote inputs arriving in batches of 3 ticks
    // Each batch triggers a rollback to the first tick of the batch
    const batchSize = 3;
    for (let batchStart = 5; batchStart <= 30; batchStart += batchSize) {
      const batchEnd = Math.min(batchStart + batchSize - 1, 30);

      // Run forward without the batch inputs
      while (simB.runner.Simulation.tick < batchEnd + 2) {
        simB.runner.update(fl);
      }

      // "Late inputs arrive" — add the batch
      for (let tick = batchStart; tick <= batchEnd; tick++) {
        injectCharacterMove(simB.inputProvider, tick, 0, tick, 0, 1, 0);
      }

      // Rollback to before the batch
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (simB.runner.Simulation as any).rollback(batchStart - 1);
      simB.kccManager.recreateAll();

      // Re-simulate
      simB.runner.update(0);
    }

    // Now run both in lockstep to tick 40, comparing at each tick
    while (simB.runner.Simulation.tick < 40) {
      simB.runner.update(fl);

      // Advance Sim A to match
      while (simA.runner.Simulation.tick < simB.runner.Simulation.tick) {
        simA.runner.update(fl);
      }

      if (simA.runner.Simulation.tick === simB.runner.Simulation.tick) {
        const hashA = simA.runner.Simulation.mem.getHash();
        const hashB = simB.runner.Simulation.mem.getHash();
        if (hashA !== hashB) {
          // Find all diverging bytes
          const snapA = new Uint8Array(simA.runner.Simulation.mem.exportSnapshot());
          const snapB = new Uint8Array(simB.runner.Simulation.mem.exportSnapshot());
          const diffs: string[] = [];
          for (let i = 0; i < snapA.length && diffs.length < 20; i++) {
            if (snapA[i] !== snapB[i]) {
              diffs.push(`byte[${i}]: A=${snapA[i]} B=${snapB[i]}`);
            }
          }

          // Resolve components via DI
          const tA = simA.runner.DIContainer.resolve(Transform3d);
          const tB = simB.runner.DIContainer.resolve(Transform3d);
          const csA = simA.runner.DIContainer.resolve(CharacterState);
          const csB = simB.runner.DIContainer.resolve(CharacterState);

          // Check all entities 0-10
          const entityInfo: string[] = [];
          for (let e = 0; e < 10; e++) {
            const pxA = tA.unsafe.positionX[e], pxB = tB.unsafe.positionX[e];
            const pyA = tA.unsafe.positionY[e], pyB = tB.unsafe.positionY[e];
            const pzA = tA.unsafe.positionZ[e], pzB = tB.unsafe.positionZ[e];
            if (pxA !== pxB || pyA !== pyB || pzA !== pzB) {
              entityInfo.push(
                `e${e}: posA=(${pxA},${pyA},${pzA}) posB=(${pxB},${pyB},${pzB})`
              );
            }
            const spA = csA.unsafe.currentSpeed[e], spB = csB.unsafe.currentSpeed[e];
            const grA = csA.unsafe.grounded[e], grB = csB.unsafe.grounded[e];
            const vvA = csA.unsafe.verticalVelocity[e], vvB = csB.unsafe.verticalVelocity[e];
            if (spA !== spB || grA !== grB || vvA !== vvB) {
              entityInfo.push(
                `e${e}: speed=${spA}/${spB} grounded=${grA}/${grB} vertVel=${vvA}/${vvB}`
              );
            }
          }

          expect.fail(
            `Hash mismatch at tick ${simA.runner.Simulation.tick}:\n` +
            `Diffs (first 10): ${diffs.slice(0, 10).join(', ')}\n` +
            `Entities:\n${entityInfo.join('\n')}`
          );
        }
      }
    }
  });

  it('two identical simulations with diagonal movement should have matching hashes', () => {
    const s1 = createRunner();
    const s2 = createRunner();
    setups.push(s1, s2);

    s1.runner.start();
    s2.runner.start();

    injectPlayerJoined(s1.inputProvider, 1, 0);
    injectPlayerJoined(s2.inputProvider, 1, 0);

    const SQRT2_INV = Math.fround(1 / Math.sqrt(2));

    // Diagonal movement with rotating camera
    for (let tick = 5; tick <= 40; tick++) {
      const yaw = Math.fround((tick - 5) * 0.1);
      injectCharacterMove(s1.inputProvider, tick, 0, tick, SQRT2_INV, SQRT2_INV, yaw);
      injectCharacterMove(s2.inputProvider, tick, 0, tick, SQRT2_INV, SQRT2_INV, yaw);
    }

    for (let i = 0; i < 60; i++) {
      advanceOneTick(s1.runner);
      advanceOneTick(s2.runner);

      const h1 = s1.runner.Simulation.mem.getHash();
      const h2 = s2.runner.Simulation.mem.getHash();
      expect(h1, `Hash mismatch at tick ${s1.runner.Simulation.tick}`).toBe(h2);
    }
  });
});
