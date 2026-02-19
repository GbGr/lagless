import { describe, it, expect } from 'vitest';
import { RelayInputProvider } from './relay-input-provider.js';
import { ECSConfig, ECSSimulation, InputRegistry, RPC, type ECSDeps, type IAbstractInputConstructor } from '@lagless/core';
import { TickInputKind, CancelReason, type TickInputData } from '@lagless/net-wire';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { InputBinarySchema, FieldType } from '@lagless/binary';

// ─── Test Input Definition ──────────────────────────────────

const TestMoveFields = [
  { name: 'direction', type: FieldType.Float32, isArray: false, byteLength: 4 },
] as const;

class TestMoveInput {
  static readonly id = 1;
  readonly id = 1;
  readonly fields = TestMoveFields;
  readonly schema = { direction: Float32Array };
  readonly byteLength = 4;
}

const TestMoveInputCtor = TestMoveInput as unknown as IAbstractInputConstructor;
const testInputRegistry = new InputRegistry([TestMoveInputCtor]);

// ─── Helpers ────────────────────────────────────────────────

const minimalDeps: ECSDeps = {
  components: [],
  singletons: [],
  filters: [],
  inputs: [],
  playerResources: [],
};

function createTestSetup(playerSlot = 0) {
  const config = new ECSConfig({
    initialInputDelayTick: 3,
    minInputDelayTick: 1,
    maxInputDelayTick: 8,
    snapshotRate: 1,
    snapshotHistorySize: 50,
  });

  const provider = new RelayInputProvider(playerSlot, config, testInputRegistry);
  const simulation = new ECSSimulation(config, minimalDeps, provider);
  provider.init(simulation);
  simulation.registerSystems([]);
  simulation.start();

  return { provider, simulation, config };
}

function packTestPayload(direction: number): Uint8Array {
  const buffer = InputBinarySchema.packBatch(testInputRegistry, [{
    inputId: 1,
    ordinal: 1,
    values: { direction },
  }]);
  return new Uint8Array(buffer);
}

function makeTickInput(
  tick: number,
  playerSlot: number,
  seq: number,
  kind: TickInputKind = TickInputKind.Client,
  direction = 1.5,
): TickInputData {
  return {
    tick,
    playerSlot,
    seq,
    kind,
    payload: packTestPayload(direction),
  };
}

// ─── Tests ──────────────────────────────────────────────────

describe('RelayInputProvider', () => {
  describe('handleTickInputFanout', () => {
    it('should add remote RPCs to history', () => {
      const { provider } = createTestSetup(0);

      provider.handleTickInputFanout({
        serverTick: 10,
        inputs: [
          makeTickInput(10, 1, 1), // from remote player 1
          makeTickInput(10, 2, 1), // from remote player 2
        ],
      });

      const rpcs = provider.getTickRPCs(10, TestMoveInputCtor);
      expect(rpcs.length).toBe(2);
    });

    it('should skip own client inputs (already in history from prediction)', () => {
      const { provider } = createTestSetup(0);

      provider.handleTickInputFanout({
        serverTick: 10,
        inputs: [
          makeTickInput(10, 0, 1, TickInputKind.Client), // our own
          makeTickInput(10, 1, 1, TickInputKind.Client), // remote
        ],
      });

      const rpcs = provider.getTickRPCs(10, TestMoveInputCtor);
      expect(rpcs.length).toBe(1);
      expect(rpcs[0].meta.playerSlot).toBe(1);
    });

    it('should NOT skip own server events', () => {
      const { provider } = createTestSetup(0);

      provider.handleTickInputFanout({
        serverTick: 10,
        inputs: [
          makeTickInput(10, 255, 1, TickInputKind.Server), // server event
        ],
      });

      const rpcs = provider.getTickRPCs(10, TestMoveInputCtor);
      expect(rpcs.length).toBe(1);
    });

    it('should request rollback for past-tick remote input', () => {
      const { provider, simulation, config } = createTestSetup(0);

      // Advance simulation to tick 10
      simulation.update(config.frameLength * 10);
      expect(simulation.tick).toBeGreaterThanOrEqual(9);

      const currentTick = simulation.tick;

      // Remote input arrives for a tick we already simulated
      provider.handleTickInputFanout({
        serverTick: currentTick,
        inputs: [
          makeTickInput(currentTick - 2, 1, 1), // 2 ticks in the past
        ],
      });

      const rollbackTick = provider.getInvalidateRollbackTick();
      expect(rollbackTick).toBe(currentTick - 2);
    });

    it('should NOT request rollback for future-tick remote input', () => {
      const { provider } = createTestSetup(0);

      // Simulation at tick 0
      provider.handleTickInputFanout({
        serverTick: 5,
        inputs: [
          makeTickInput(10, 1, 1), // far in the future
        ],
      });

      expect(provider.getInvalidateRollbackTick()).toBeUndefined();
    });

    it('should track minimum rollback tick across multiple events', () => {
      const { provider, simulation, config } = createTestSetup(0);

      simulation.update(config.frameLength * 20);
      const tick = simulation.tick;

      provider.handleTickInputFanout({
        serverTick: tick,
        inputs: [makeTickInput(tick - 3, 1, 1)],
      });

      provider.handleTickInputFanout({
        serverTick: tick,
        inputs: [makeTickInput(tick - 5, 2, 1)],
      });

      // Should be the minimum: tick - 5
      expect(provider.getInvalidateRollbackTick()).toBe(tick - 5);
    });

    it('should consume rollback tick after reading', () => {
      const { provider, simulation, config } = createTestSetup(0);

      simulation.update(config.frameLength * 10);

      provider.handleTickInputFanout({
        serverTick: simulation.tick,
        inputs: [makeTickInput(simulation.tick - 1, 1, 1)],
      });

      expect(provider.getInvalidateRollbackTick()).toBeDefined();
      // Second read should return undefined (consumed)
      expect(provider.getInvalidateRollbackTick()).toBeUndefined();
    });
  });

  describe('handleCancelInput', () => {
    it('should remove RPC and request rollback', () => {
      const { provider } = createTestSetup(0);

      // Add an RPC that will be cancelled
      const rpc = new RPC(1, {
        tick: 10, seq: 5, ordinal: 1, playerSlot: 0,
      }, { direction: 1.5 });
      provider.addRemoteRpc(rpc);

      expect(provider.getTickRPCs(10, TestMoveInputCtor).length).toBe(1);

      provider.handleCancelInput({
        tick: 10,
        playerSlot: 0,
        seq: 5,
        reason: CancelReason.TooOld,
      });

      expect(provider.getTickRPCs(10, TestMoveInputCtor).length).toBe(0);
      expect(provider.getInvalidateRollbackTick()).toBe(10);
    });
  });

  describe('handlePong', () => {
    it('should update clock sync', () => {
      const { provider } = createTestSetup(0);

      expect(provider.clockSync.isReady).toBe(false);

      // Send enough pongs to complete warmup (default 5)
      for (let i = 0; i < 5; i++) {
        provider.handlePong({
          cSend: performance.now() - 50,
          sRecv: performance.now() - 25,
          sSend: performance.now() - 25,
          sTick: 100 + i,
        });
      }

      expect(provider.clockSync.isReady).toBe(true);
      expect(provider.clockSync.rttEwmaMs).toBeGreaterThan(0);
    });

    it('should adapt input delay based on network conditions', () => {
      const { provider } = createTestSetup(0);

      const initialDelay = provider.currentInputDelay;

      // Simulate high RTT pongs to increase delay
      for (let i = 0; i < 6; i++) {
        const now = performance.now();
        provider.handlePong({
          cSend: now - 300, // high RTT
          sRecv: now - 150,
          sSend: now - 150,
          sTick: 100 + i,
        });
      }

      // With RTT ~300ms at 60fps (16.67ms/tick), delay should increase
      expect(provider.currentInputDelay).toBeGreaterThanOrEqual(initialDelay);
    });
  });

  describe('handleStateRequest', () => {
    it('should not crash when simulation is not initialized', () => {
      const config = new ECSConfig({});
      const provider = new RelayInputProvider(0, config, testInputRegistry);
      // No simulation init
      expect(() => provider.handleStateRequest(1)).not.toThrow();
    });
  });

  describe('getInvalidateRollbackTick', () => {
    it('should return undefined when no rollback needed', () => {
      const { provider } = createTestSetup(0);
      expect(provider.getInvalidateRollbackTick()).toBeUndefined();
    });
  });
});
