import { describe, it, expect, beforeEach } from 'vitest';
import { AbstractInputProvider } from './abstract-input-provider.js';
import { RPC } from './rpc.js';
import { ECSConfig } from '../ecs-config.js';
import { InputRegistry } from './input-registry.js';
import type { IAbstractInputConstructor, InputMeta } from '../types/index.js';

// ─── Test doubles ───────────────────────────────────────────

class TestInputProvider extends AbstractInputProvider {
  public override playerSlot = 0;
  private _rollbackTick: number | undefined = undefined;

  public override getInvalidateRollbackTick(): void | number {
    const tick = this._rollbackTick;
    this._rollbackTick = undefined;
    return tick;
  }

  public setRollbackTick(tick: number): void {
    this._rollbackTick = tick;
  }
}

function makeRPC(tick: number, playerSlot: number, seq: number, ordinal = 1, inputId = 1): RPC {
  const meta: InputMeta = { tick, seq, ordinal, playerSlot };
  return new RPC(inputId, meta, {});
}

const emptyRegistry = new InputRegistry([]);
const TestInputCtor = { id: 1 } as unknown as IAbstractInputConstructor;

// ─── Tests ──────────────────────────────────────────────────

describe('AbstractInputProvider', () => {
  let provider: TestInputProvider;
  let config: ECSConfig;

  beforeEach(() => {
    config = new ECSConfig({ initialInputDelayTick: 3, minInputDelayTick: 1, maxInputDelayTick: 8 });
    provider = new TestInputProvider(config, emptyRegistry);
  });

  describe('addRemoteRpc', () => {
    it('should add remote RPC to history', () => {
      const rpc = makeRPC(100, 1, 1);
      provider.addRemoteRpc(rpc);

      const InputCtor = TestInputCtor;
      const result = provider.collectTickRPCs(100, InputCtor);
      expect(result.length).toBe(1);
      expect(result[0].meta.playerSlot).toBe(1);
    });

    it('should add multiple remote RPCs', () => {
      provider.addRemoteRpc(makeRPC(100, 1, 1, 1));
      provider.addRemoteRpc(makeRPC(100, 2, 1, 1));

      const InputCtor = TestInputCtor;
      const result = provider.collectTickRPCs(100, InputCtor);
      expect(result.length).toBe(2);
    });
  });

  describe('addRemoteRpcBatch', () => {
    it('should add batch of remote RPCs', () => {
      const rpcs = [
        makeRPC(100, 1, 1),
        makeRPC(100, 2, 1),
        makeRPC(101, 1, 2),
      ];
      provider.addRemoteRpcBatch(rpcs);

      const InputCtor = TestInputCtor;
      expect(provider.collectTickRPCs(100, InputCtor).length).toBe(2);
      expect(provider.collectTickRPCs(101, InputCtor).length).toBe(1);
    });
  });

  describe('removeRpcAt', () => {
    it('should remove specific RPC from history', () => {
      provider.addRemoteRpc(makeRPC(100, 1, 5, 1));
      provider.addRemoteRpc(makeRPC(100, 2, 3, 1));

      provider.removeRpcAt(1, 100, 5);

      const InputCtor = TestInputCtor;
      const result = provider.collectTickRPCs(100, InputCtor);
      expect(result.length).toBe(1);
      expect(result[0].meta.playerSlot).toBe(2);
    });

    it('should no-op for non-existent RPC', () => {
      provider.addRemoteRpc(makeRPC(100, 1, 5));
      provider.removeRpcAt(1, 999, 5); // wrong tick
      provider.removeRpcAt(3, 100, 5); // wrong slot

      const InputCtor = TestInputCtor;
      expect(provider.collectTickRPCs(100, InputCtor).length).toBe(1);
    });
  });

  describe('setInputDelay', () => {
    it('should change input delay within bounds', () => {
      expect(provider.currentInputDelay).toBe(3); // initial

      provider.setInputDelay(5);
      expect(provider.currentInputDelay).toBe(5);
    });

    it('should clamp to min', () => {
      provider.setInputDelay(0);
      expect(provider.currentInputDelay).toBe(1); // minInputDelayTick
    });

    it('should clamp to max', () => {
      provider.setInputDelay(20);
      expect(provider.currentInputDelay).toBe(8); // maxInputDelayTick
    });

    it('should not change if already at target', () => {
      provider.setInputDelay(3);
      expect(provider.currentInputDelay).toBe(3); // no change
    });
  });

  describe('getFrameRPCBuffer', () => {
    it('should return empty buffer initially', () => {
      expect(provider.getFrameRPCBuffer().length).toBe(0);
    });
  });

  describe('rpcHistory accessor', () => {
    it('should expose rpc history for serialization', () => {
      provider.addRemoteRpc(makeRPC(10, 0, 1));
      expect(provider.rpcHistory.size).toBe(1);
      expect(provider.rpcHistory.totalRPCCount).toBe(1);
    });
  });

  describe('dispose', () => {
    it('should mark as disposed', () => {
      provider.dispose();
      expect(provider['_disposed']).toBe(true);
    });
  });
});
