import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { MathOps } from '@lagless/math';
import { ECSConfig, LocalInputProvider, PlayerResources, RPC } from '@lagless/core';
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
  CharacterState,
  PlayerResource,
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
const FIXED_PLAYER_ID = new Uint8Array(16);

interface RunnerSetup {
  runner: RobloxLikeRunner;
  inputProvider: LocalInputProvider;
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

  return { runner, inputProvider };
}

function getPlayerEntity(runner: RobloxLikeRunner, slot: number): number {
  const pr = runner.DIContainer.resolve(PlayerResources);
  return pr.get(PlayerResource, slot).safe.entity;
}

function injectPlayerJoined(ip: LocalInputProvider, tick: number, slot: number): void {
  ip.addRemoteRpc(new RPC(PlayerJoined.id, {
    tick, seq: 0, ordinal: 0, playerSlot: 255,
  }, { slot, playerId: FIXED_PLAYER_ID }));
}

function injectCharacterMove(
  ip: LocalInputProvider, tick: number, slot: number, seq: number,
  dirX: number, dirZ: number, cameraYaw: number, jump = 0, sprint = 0,
): void {
  ip.addRemoteRpc(new RPC(CharacterMove.id, {
    tick, seq, ordinal: 1, playerSlot: slot,
  }, {
    directionX: dirX, directionZ: dirZ, cameraYaw, jump, sprint,
  }));
}

function advanceOneTick(runner: RobloxLikeRunner): void {
  runner.update(runner.Config.frameLength);
}

describe('Input Sanitization', () => {
  const setups: RunnerSetup[] = [];

  afterEach(() => {
    for (const s of setups) {
      s.runner.dispose();
    }
    setups.length = 0;
  });

  it('should replace NaN direction values with 0', () => {
    const s = createRunner();
    setups.push(s);
    s.runner.start();

    injectPlayerJoined(s.inputProvider, 1, 0);
    advanceOneTick(s.runner); // tick 1: player spawns
    advanceOneTick(s.runner); // tick 2

    const entity = getPlayerEntity(s.runner, 0);
    injectCharacterMove(s.inputProvider, 3, 0, 1, NaN, NaN, 0);
    advanceOneTick(s.runner); // tick 3

    const cs = s.runner.DIContainer.resolve(CharacterState);
    expect(Number.isFinite(cs.unsafe.moveInputX[entity])).toBe(true);
    expect(Number.isFinite(cs.unsafe.moveInputZ[entity])).toBe(true);
    expect(cs.unsafe.moveInputX[entity]).toBe(0);
    expect(cs.unsafe.moveInputZ[entity]).toBe(0);
  });

  it('should replace Infinity direction values with 0', () => {
    const s = createRunner();
    setups.push(s);
    s.runner.start();

    injectPlayerJoined(s.inputProvider, 1, 0);
    advanceOneTick(s.runner);
    advanceOneTick(s.runner);

    const entity = getPlayerEntity(s.runner, 0);
    injectCharacterMove(s.inputProvider, 3, 0, 1, Infinity, -Infinity, 0);
    advanceOneTick(s.runner);

    const cs = s.runner.DIContainer.resolve(CharacterState);
    expect(Number.isFinite(cs.unsafe.moveInputX[entity])).toBe(true);
    expect(Number.isFinite(cs.unsafe.moveInputZ[entity])).toBe(true);
  });

  it('should clamp direction values to [-1, 1]', () => {
    const s = createRunner();
    setups.push(s);
    s.runner.start();

    injectPlayerJoined(s.inputProvider, 1, 0);
    advanceOneTick(s.runner);
    advanceOneTick(s.runner);

    const entity = getPlayerEntity(s.runner, 0);
    // dirX=100 → clamped to 1, dirZ=-50 → clamped to -1, cameraYaw=0 (cosYaw=1, sinYaw=0)
    // worldX = dirX * cos(0) + dirZ * sin(0) = 1
    // worldZ = -dirX * sin(0) + dirZ * cos(0) = -1
    injectCharacterMove(s.inputProvider, 3, 0, 1, 100, -50, 0);
    advanceOneTick(s.runner);

    const cs = s.runner.DIContainer.resolve(CharacterState);
    expect(cs.unsafe.moveInputX[entity]).toBeCloseTo(1, 5);
    expect(cs.unsafe.moveInputZ[entity]).toBeCloseTo(-1, 5);
  });

  it('should replace NaN cameraYaw with 0', () => {
    const s = createRunner();
    setups.push(s);
    s.runner.start();

    injectPlayerJoined(s.inputProvider, 1, 0);
    advanceOneTick(s.runner);
    advanceOneTick(s.runner);

    const entity = getPlayerEntity(s.runner, 0);
    injectCharacterMove(s.inputProvider, 3, 0, 1, 1, 0, NaN);
    advanceOneTick(s.runner);

    const cs = s.runner.DIContainer.resolve(CharacterState);
    expect(cs.unsafe.facingYaw[entity]).toBe(0);
  });

  it('should normalize sprint uint8 value to 0 or 1', () => {
    const s = createRunner();
    setups.push(s);
    s.runner.start();

    injectPlayerJoined(s.inputProvider, 1, 0);
    advanceOneTick(s.runner);
    advanceOneTick(s.runner);

    const entity = getPlayerEntity(s.runner, 0);
    // sprint=255 should be normalized to 1
    injectCharacterMove(s.inputProvider, 3, 0, 1, 1, 0, 0, 0, 255);
    advanceOneTick(s.runner);

    const cs = s.runner.DIContainer.resolve(CharacterState);
    expect(cs.unsafe.isSprinting[entity]).toBe(1);
  });

  it('should use CHARACTER_CONFIG.jumpForce for jump velocity', () => {
    const s = createRunner();
    setups.push(s);
    s.runner.start();

    injectPlayerJoined(s.inputProvider, 1, 0);
    advanceOneTick(s.runner); // tick 1
    advanceOneTick(s.runner); // tick 2

    const entity = getPlayerEntity(s.runner, 0);
    const cs = s.runner.DIContainer.resolve(CharacterState);

    // Ensure grounded before jump (character spawns at spawnY=2, falls to ground)
    // Run enough ticks for the character to land
    for (let i = 0; i < 30; i++) {
      advanceOneTick(s.runner);
    }
    expect(cs.unsafe.grounded[entity]).toBe(1);

    const tick = s.runner.Simulation.tick + 1;
    injectCharacterMove(s.inputProvider, tick, 0, tick, 0, 0, 0, 1, 0);
    advanceOneTick(s.runner);

    // After jump, verticalVelocity should start at jumpForce (gravity reduces it by a small dt)
    // The movement system applies gravity BEFORE KCC, so the actual stored value after the full tick
    // is jumpForce - gravity * dt (since grounded was set to 0 by the jump but then movement system
    // applies gravity this same tick). Actually, jump happens in ApplyCharacterInput (before movement),
    // then MovementSystem reads vertVel = jumpForce, detects !grounded, applies gravity: jumpForce - g*dt.
    // After KCC: newGrounded = false (in air), so vertVel stays at jumpForce - g*dt.
    const dt = s.runner.Config.frameLength / 1000;
    const expectedVel = CHARACTER_CONFIG.jumpForce - CHARACTER_CONFIG.gravity * dt;
    expect(cs.unsafe.verticalVelocity[entity]).toBeCloseTo(expectedVel, 3);
  });

  it('should use CHARACTER_CONFIG.maxJumps to limit jumps when airborne', () => {
    const s = createRunner();
    setups.push(s);
    s.runner.start();

    injectPlayerJoined(s.inputProvider, 1, 0);
    advanceOneTick(s.runner); // tick 1
    advanceOneTick(s.runner); // tick 2

    const entity = getPlayerEntity(s.runner, 0);
    const cs = s.runner.DIContainer.resolve(CharacterState);

    // Let character land
    for (let i = 0; i < 30; i++) {
      advanceOneTick(s.runner);
    }
    expect(cs.unsafe.grounded[entity]).toBe(1);

    // First jump — should succeed
    let tick = s.runner.Simulation.tick + 1;
    injectCharacterMove(s.inputProvider, tick, 0, tick, 0, 0, 0, 1, 0);
    advanceOneTick(s.runner);
    expect(cs.unsafe.grounded[entity]).toBe(0);
    expect(cs.unsafe.jumpCount[entity]).toBe(1);

    // Second jump while airborne — should be blocked (maxJumps = 1)
    tick = s.runner.Simulation.tick + 1;
    const velBeforeSecondJump = cs.unsafe.verticalVelocity[entity];
    injectCharacterMove(s.inputProvider, tick, 0, tick, 0, 0, 0, 1, 0);
    advanceOneTick(s.runner);

    // jumpCount should still be 1 (second jump rejected)
    expect(cs.unsafe.jumpCount[entity]).toBe(1);
    // verticalVelocity should NOT be jumpForce (gravity reduced it further)
    expect(cs.unsafe.verticalVelocity[entity]).not.toBe(CHARACTER_CONFIG.jumpForce);
  });
});
