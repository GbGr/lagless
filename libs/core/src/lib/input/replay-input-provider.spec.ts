import { describe, it, expect } from 'vitest';
import { ReplayInputProvider } from './replay-input-provider.js';
import { RPC } from './rpc.js';
import { RPCHistory } from './rpc-history.js';
import { ECSConfig } from '../ecs-config.js';
import { InputRegistry } from './input-registry.js';
import type { IAbstractInputConstructor, InputMeta } from '../types/index.js';
import { FieldType } from '@lagless/binary';

// ─── Test Input Definitions ──────────────────────────────────

const TestMoveFields = [
  { name: 'dx', type: FieldType.Float32, isArray: false, byteLength: 4 },
  { name: 'dy', type: FieldType.Float32, isArray: false, byteLength: 4 },
] as const;

class TestMoveInput {
  static readonly id = 1;
  readonly id = 1;
  readonly fields = TestMoveFields;
  readonly schema = { dx: Float32Array, dy: Float32Array };
  readonly byteLength = 8;
}

const TestActionFields = [
  { name: 'actionId', type: FieldType.Uint8, isArray: false, byteLength: 1 },
] as const;

class TestActionInput {
  static readonly id = 2;
  readonly id = 2;
  readonly fields = TestActionFields;
  readonly schema = { actionId: Uint8Array };
  readonly byteLength = 1;
}

const TestMoveCtor = TestMoveInput as unknown as IAbstractInputConstructor;
const TestActionCtor = TestActionInput as unknown as IAbstractInputConstructor;
const testRegistry = new InputRegistry([TestMoveCtor, TestActionCtor]);

// ─── Helpers ────────────────────────────────────────────────

function makeRPC(
  tick: number,
  playerSlot: number,
  ordinal: number,
  inputId = 1,
  seq = 1,
  data: Record<string, number> = {},
): RPC {
  const meta: InputMeta = { tick, seq, ordinal, playerSlot };
  return new RPC(inputId, meta, data);
}

function buildReplayData(rpcs: RPC[]): ArrayBuffer {
  const history = new RPCHistory();
  for (const rpc of rpcs) history.addRPC(rpc);
  return history.export(testRegistry);
}

function makeSeed(...bytes: number[]): Uint8Array {
  const seed = new Uint8Array(16);
  for (let i = 0; i < bytes.length && i < 16; i++) seed[i] = bytes[i];
  return seed;
}

// ─── Tests ──────────────────────────────────────────────────

describe('ReplayInputProvider', () => {
  describe('constructor', () => {
    it('should load pre-recorded RPCs from binary data', () => {
      const rpcs = [
        makeRPC(10, 0, 1, 1, 1, { dx: 1, dy: 0 }),
        makeRPC(20, 1, 1, 1, 2, { dx: 0, dy: -1 }),
      ];
      const replayData = buildReplayData(rpcs);
      const config = new ECSConfig();
      const provider = new ReplayInputProvider(replayData, config, testRegistry);

      const tick10 = provider.collectTickRPCs(10, TestMoveCtor);
      expect(tick10.length).toBe(1);
      expect(tick10[0].meta.playerSlot).toBe(0);

      const tick20 = provider.collectTickRPCs(20, TestMoveCtor);
      expect(tick20.length).toBe(1);
      expect(tick20[0].meta.playerSlot).toBe(1);
    });

    it('should handle empty replay data', () => {
      const replayData = buildReplayData([]);
      const config = new ECSConfig();
      const provider = new ReplayInputProvider(replayData, config, testRegistry);

      expect(provider.collectTickRPCs(0, TestMoveCtor).length).toBe(0);
      expect(provider.rpcHistory.size).toBe(0);
    });
  });

  describe('playerSlot', () => {
    it('should always be 0', () => {
      const replayData = buildReplayData([]);
      const provider = new ReplayInputProvider(replayData, new ECSConfig(), testRegistry);
      expect(provider.playerSlot).toBe(0);
    });
  });

  describe('getInvalidateRollbackTick', () => {
    it('should always return undefined', () => {
      const replayData = buildReplayData([makeRPC(5, 0, 1, 1, 1, { dx: 1, dy: 0 })]);
      const provider = new ReplayInputProvider(replayData, new ECSConfig(), testRegistry);

      expect(provider.getInvalidateRollbackTick()).toBeUndefined();
      expect(provider.getInvalidateRollbackTick()).toBeUndefined();
    });
  });

  describe('update', () => {
    it('should not add any new RPCs', () => {
      const rpcs = [makeRPC(10, 0, 1, 1, 1, { dx: 1, dy: 0 })];
      const replayData = buildReplayData(rpcs);
      const provider = new ReplayInputProvider(replayData, new ECSConfig(), testRegistry);

      const countBefore = provider.rpcHistory.totalRPCCount;
      provider.update();
      provider.update();
      provider.update();
      expect(provider.rpcHistory.totalRPCCount).toBe(countBefore);
    });

    it('should return empty frame buffer', () => {
      const replayData = buildReplayData([makeRPC(10, 0, 1, 1, 1, { dx: 1, dy: 0 })]);
      const provider = new ReplayInputProvider(replayData, new ECSConfig(), testRegistry);
      provider.update();
      expect(provider.getFrameRPCBuffer().length).toBe(0);
    });
  });

  // ─── Static: exportReplay ───────────────────────────────

  describe('exportReplay', () => {
    it('should write seed at offset 0..15', () => {
      const seed = makeSeed(0xAA, 0xBB, 0xCC, 0xDD);
      const rpcData = buildReplayData([]);
      const replay = ReplayInputProvider.exportReplay(seed, 4, 60, rpcData);

      const view = new Uint8Array(replay);
      expect(view[0]).toBe(0xAA);
      expect(view[1]).toBe(0xBB);
      expect(view[2]).toBe(0xCC);
      expect(view[3]).toBe(0xDD);
      for (let i = 4; i < 16; i++) expect(view[i]).toBe(0);
    });

    it('should write maxPlayers at offset 16', () => {
      const seed = new Uint8Array(16);
      const rpcData = buildReplayData([]);
      const replay = ReplayInputProvider.exportReplay(seed, 4, 60, rpcData);
      const view = new DataView(replay);
      expect(view.getUint8(16)).toBe(4);
    });

    it('should write fps at offset 17', () => {
      const seed = new Uint8Array(16);
      const rpcData = buildReplayData([]);
      const replay = ReplayInputProvider.exportReplay(seed, 4, 120, rpcData);
      const view = new DataView(replay);
      expect(view.getUint8(17)).toBe(120);
    });

    it('should write rpcData starting at offset 18', () => {
      const seed = new Uint8Array(16);
      const rpcData = buildReplayData([makeRPC(10, 0, 1, 1, 1, { dx: 1, dy: 0 })]);
      const replay = ReplayInputProvider.exportReplay(seed, 4, 60, rpcData);

      // Header is 18 bytes, rest is rpcData
      expect(replay.byteLength).toBe(18 + rpcData.byteLength);

      const headerSlice = new Uint8Array(replay, 18);
      const expectedSlice = new Uint8Array(rpcData);
      expect(headerSlice).toEqual(expectedSlice);
    });

    it('should produce correct total size for empty replay', () => {
      const seed = new Uint8Array(16);
      const rpcData = buildReplayData([]);
      const replay = ReplayInputProvider.exportReplay(seed, 2, 30, rpcData);
      expect(replay.byteLength).toBe(18 + rpcData.byteLength);
    });
  });

  // ─── Static: createFromReplay ──────────────────────────

  describe('createFromReplay', () => {
    it('should restore seed into ECSConfig', () => {
      const seed = makeSeed(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);
      const rpcData = buildReplayData([]);
      const replay = ReplayInputProvider.exportReplay(seed, 4, 60, rpcData);

      const provider = ReplayInputProvider.createFromReplay(replay, testRegistry);
      expect(new Uint8Array(provider.ecsConfig.seed)).toEqual(seed);
    });

    it('should restore maxPlayers into ECSConfig', () => {
      const rpcData = buildReplayData([]);
      const replay = ReplayInputProvider.exportReplay(new Uint8Array(16), 3, 60, rpcData);

      const provider = ReplayInputProvider.createFromReplay(replay, testRegistry);
      expect(provider.ecsConfig.maxPlayers).toBe(3);
    });

    it('should restore fps into ECSConfig', () => {
      const rpcData = buildReplayData([]);
      const replay = ReplayInputProvider.exportReplay(new Uint8Array(16), 4, 120, rpcData);

      const provider = ReplayInputProvider.createFromReplay(replay, testRegistry);
      expect(provider.ecsConfig.fps).toBe(120);
      expect(provider.ecsConfig.frameLength).toBeCloseTo(1000 / 120);
    });

    it('should set playerSlot to 0', () => {
      const rpcData = buildReplayData([]);
      const replay = ReplayInputProvider.exportReplay(new Uint8Array(16), 4, 60, rpcData);

      const provider = ReplayInputProvider.createFromReplay(replay, testRegistry);
      expect(provider.playerSlot).toBe(0);
    });

    it('should load RPCs from embedded rpcData', () => {
      const rpcs = [
        makeRPC(5, 0, 1, 1, 1, { dx: 1.5, dy: -2.5 }),
        makeRPC(10, 1, 1, 2, 1, { actionId: 42 }),
      ];
      const rpcData = buildReplayData(rpcs);
      const replay = ReplayInputProvider.exportReplay(new Uint8Array(16), 4, 60, rpcData);

      const provider = ReplayInputProvider.createFromReplay(replay, testRegistry);

      const moves = provider.collectTickRPCs(5, TestMoveCtor);
      expect(moves.length).toBe(1);
      expect((moves[0].data as Record<string, number>).dx).toBeCloseTo(1.5);
      expect((moves[0].data as Record<string, number>).dy).toBeCloseTo(-2.5);

      const actions = provider.collectTickRPCs(10, TestActionCtor);
      expect(actions.length).toBe(1);
      expect((actions[0].data as Record<string, number>).actionId).toBe(42);
    });
  });

  // ─── Round-trip ────────────────────────────────────────────

  describe('round-trip export → createFromReplay', () => {
    it('should preserve all RPCs through round-trip', () => {
      const rpcs = [
        makeRPC(1, 0, 1, 1, 1, { dx: 1, dy: 0 }),
        makeRPC(1, 1, 1, 1, 2, { dx: -1, dy: 0 }),
        makeRPC(2, 0, 2, 1, 3, { dx: 0, dy: 1 }),
        makeRPC(5, 2, 1, 2, 1, { actionId: 7 }),
      ];
      const rpcData = buildReplayData(rpcs);
      const seed = makeSeed(0xFF, 0x00, 0xAB, 0xCD);
      const replay = ReplayInputProvider.exportReplay(seed, 6, 60, rpcData);

      const provider = ReplayInputProvider.createFromReplay(replay, testRegistry);

      // Config preserved
      expect(new Uint8Array(provider.ecsConfig.seed)).toEqual(seed);
      expect(provider.ecsConfig.maxPlayers).toBe(6);
      expect(provider.ecsConfig.fps).toBe(60);

      // Tick 1: two move RPCs
      const tick1 = provider.collectTickRPCs(1, TestMoveCtor);
      expect(tick1.length).toBe(2);
      expect(tick1[0].meta.playerSlot).toBe(0);
      expect(tick1[1].meta.playerSlot).toBe(1);

      // Tick 2: one move RPC
      const tick2 = provider.collectTickRPCs(2, TestMoveCtor);
      expect(tick2.length).toBe(1);

      // Tick 5: one action RPC
      const tick5 = provider.collectTickRPCs(5, TestActionCtor);
      expect(tick5.length).toBe(1);
      expect((tick5[0].data as Record<string, number>).actionId).toBe(7);
    });

    it('should preserve RPC ordering through round-trip', () => {
      // Multiple players at same tick — ordering must be deterministic
      const rpcs = [
        makeRPC(10, 2, 1, 1, 1, { dx: 3, dy: 0 }),
        makeRPC(10, 0, 1, 1, 1, { dx: 1, dy: 0 }),
        makeRPC(10, 1, 1, 1, 1, { dx: 2, dy: 0 }),
      ];
      const rpcData = buildReplayData(rpcs);
      const replay = ReplayInputProvider.exportReplay(new Uint8Array(16), 4, 60, rpcData);
      const provider = ReplayInputProvider.createFromReplay(replay, testRegistry);

      const result = provider.collectTickRPCs(10, TestMoveCtor);
      expect(result.length).toBe(3);
      // Must be sorted by playerSlot
      expect(result[0].meta.playerSlot).toBe(0);
      expect(result[1].meta.playerSlot).toBe(1);
      expect(result[2].meta.playerSlot).toBe(2);
    });

    it('should handle empty replay round-trip', () => {
      const rpcData = buildReplayData([]);
      const replay = ReplayInputProvider.exportReplay(new Uint8Array(16), 2, 30, rpcData);
      const provider = ReplayInputProvider.createFromReplay(replay, testRegistry);

      expect(provider.rpcHistory.size).toBe(0);
      expect(provider.ecsConfig.fps).toBe(30);
      expect(provider.ecsConfig.maxPlayers).toBe(2);
    });
  });

  // ─── Edge Cases ────────────────────────────────────────────

  describe('edge cases', () => {
    it('should handle max fps value (255)', () => {
      const rpcData = buildReplayData([]);
      const replay = ReplayInputProvider.exportReplay(new Uint8Array(16), 4, 255, rpcData);
      const provider = ReplayInputProvider.createFromReplay(replay, testRegistry);
      expect(provider.ecsConfig.fps).toBe(255);
      expect(provider.ecsConfig.frameLength).toBeCloseTo(1000 / 255);
    });

    it('should handle max maxPlayers value (255)', () => {
      const rpcData = buildReplayData([]);
      const replay = ReplayInputProvider.exportReplay(new Uint8Array(16), 255, 60, rpcData);
      const provider = ReplayInputProvider.createFromReplay(replay, testRegistry);
      expect(provider.ecsConfig.maxPlayers).toBe(255);
    });

    it('should handle fps=1 (1 tick per second)', () => {
      const rpcData = buildReplayData([]);
      const replay = ReplayInputProvider.exportReplay(new Uint8Array(16), 2, 1, rpcData);
      const provider = ReplayInputProvider.createFromReplay(replay, testRegistry);
      expect(provider.ecsConfig.fps).toBe(1);
      expect(provider.ecsConfig.frameLength).toBe(1000);
    });

    it('should preserve full 16-byte seed', () => {
      const seed = new Uint8Array([
        0x01, 0x23, 0x45, 0x67, 0x89, 0xAB, 0xCD, 0xEF,
        0xFE, 0xDC, 0xBA, 0x98, 0x76, 0x54, 0x32, 0x10,
      ]);
      const rpcData = buildReplayData([]);
      const replay = ReplayInputProvider.exportReplay(seed, 4, 60, rpcData);
      const provider = ReplayInputProvider.createFromReplay(replay, testRegistry);

      expect(new Uint8Array(provider.ecsConfig.seed)).toEqual(seed);
    });

    it('should preserve zero seed', () => {
      const seed = new Uint8Array(16);
      const rpcData = buildReplayData([]);
      const replay = ReplayInputProvider.exportReplay(seed, 4, 60, rpcData);
      const provider = ReplayInputProvider.createFromReplay(replay, testRegistry);

      expect(new Uint8Array(provider.ecsConfig.seed)).toEqual(seed);
    });

    it('should handle many ticks with many RPCs', () => {
      const rpcs: RPC[] = [];
      for (let tick = 1; tick <= 100; tick++) {
        for (let slot = 0; slot < 4; slot++) {
          rpcs.push(makeRPC(tick, slot, 1, 1, tick, { dx: tick * 0.1, dy: slot * 0.1 }));
        }
      }

      const rpcData = buildReplayData(rpcs);
      const seed = makeSeed(42);
      const replay = ReplayInputProvider.exportReplay(seed, 4, 60, rpcData);
      const provider = ReplayInputProvider.createFromReplay(replay, testRegistry);

      expect(provider.rpcHistory.totalRPCCount).toBe(400);

      // Spot-check a few ticks
      const tick1 = provider.collectTickRPCs(1, TestMoveCtor);
      expect(tick1.length).toBe(4);
      expect(tick1[0].meta.playerSlot).toBe(0);
      expect(tick1[3].meta.playerSlot).toBe(3);

      const tick100 = provider.collectTickRPCs(100, TestMoveCtor);
      expect(tick100.length).toBe(4);
    });

    it('should handle multiple input types at same tick', () => {
      const rpcs = [
        makeRPC(10, 0, 1, 1, 1, { dx: 1, dy: 0 }),   // Move
        makeRPC(10, 0, 2, 2, 1, { actionId: 5 }),       // Action
      ];
      const rpcData = buildReplayData(rpcs);
      const replay = ReplayInputProvider.exportReplay(new Uint8Array(16), 4, 60, rpcData);
      const provider = ReplayInputProvider.createFromReplay(replay, testRegistry);

      const moves = provider.collectTickRPCs(10, TestMoveCtor);
      expect(moves.length).toBe(1);
      expect(moves[0].inputId).toBe(1);

      const actions = provider.collectTickRPCs(10, TestActionCtor);
      expect(actions.length).toBe(1);
      expect(actions[0].inputId).toBe(2);
    });

    it('should not produce rollback ticks even after multiple updates', () => {
      const rpcs = [makeRPC(10, 0, 1, 1, 1, { dx: 1, dy: 0 })];
      const replayData = buildReplayData(rpcs);
      const provider = new ReplayInputProvider(replayData, new ECSConfig(), testRegistry);

      for (let i = 0; i < 100; i++) {
        provider.update();
        expect(provider.getInvalidateRollbackTick()).toBeUndefined();
      }
    });

    it('should not modify rpcHistory on addRemoteRpc (inherited, but usable)', () => {
      const rpcs = [makeRPC(10, 0, 1, 1, 1, { dx: 1, dy: 0 })];
      const replayData = buildReplayData(rpcs);
      const provider = new ReplayInputProvider(replayData, new ECSConfig(), testRegistry);

      const countBefore = provider.rpcHistory.totalRPCCount;
      // addRemoteRpc is inherited — calling it adds to history
      provider.addRemoteRpc(makeRPC(20, 1, 1));
      expect(provider.rpcHistory.totalRPCCount).toBe(countBefore + 1);
    });

    it('should handle server-slot RPCs (playerSlot=255)', () => {
      // Server events like PlayerJoined use playerSlot=255
      const rpcs = [
        makeRPC(1, 255, 1, 1, 0, { dx: 0, dy: 0 }),
        makeRPC(5, 0, 1, 1, 1, { dx: 1, dy: 0 }),
      ];
      const rpcData = buildReplayData(rpcs);
      const replay = ReplayInputProvider.exportReplay(new Uint8Array(16), 4, 60, rpcData);
      const provider = ReplayInputProvider.createFromReplay(replay, testRegistry);

      const tick1 = provider.collectTickRPCs(1, TestMoveCtor);
      expect(tick1.length).toBe(1);
      expect(tick1[0].meta.playerSlot).toBe(255);
    });

    it('should query non-existent tick as empty', () => {
      const rpcs = [makeRPC(10, 0, 1, 1, 1, { dx: 1, dy: 0 })];
      const replayData = buildReplayData(rpcs);
      const provider = new ReplayInputProvider(replayData, new ECSConfig(), testRegistry);

      expect(provider.collectTickRPCs(0, TestMoveCtor).length).toBe(0);
      expect(provider.collectTickRPCs(9, TestMoveCtor).length).toBe(0);
      expect(provider.collectTickRPCs(11, TestMoveCtor).length).toBe(0);
      expect(provider.collectTickRPCs(999999, TestMoveCtor).length).toBe(0);
    });

    it('should preserve RPC data values through round-trip', () => {
      const rpcs = [
        makeRPC(10, 0, 1, 1, 1, { dx: -3.14, dy: 2.718 }),
      ];
      const rpcData = buildReplayData(rpcs);
      const replay = ReplayInputProvider.exportReplay(new Uint8Array(16), 4, 60, rpcData);
      const provider = ReplayInputProvider.createFromReplay(replay, testRegistry);

      const result = provider.collectTickRPCs(10, TestMoveCtor);
      expect(result.length).toBe(1);
      const data = result[0].data as Record<string, number>;
      expect(data.dx).toBeCloseTo(-3.14, 2);
      expect(data.dy).toBeCloseTo(2.718, 2);
    });
  });
});
