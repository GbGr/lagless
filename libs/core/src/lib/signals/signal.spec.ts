import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Signal, SignalEvent } from './signal.js';
import { SignalsRegistry } from './signals.registry.js';
import { ECSConfig } from '../ecs-config.js';

// ─── Test Signal ──────────────────────────────────────────────

interface TestData {
  id: number;
  value: string;
}

class TestSignal extends Signal<TestData> {
  constructor(config: ECSConfig) {
    super(config);
  }
}

// ─── Helpers ──────────────────────────────────────────────────

function createSignal(opts?: Partial<ConstructorParameters<typeof ECSConfig>[0]>) {
  const config = new ECSConfig({ fps: 60, ...opts });
  return new TestSignal(config);
}

function collect<T>(emitter: { subscribe: (fn: (e: T) => void) => () => void }) {
  const events: T[] = [];
  emitter.subscribe((e) => events.push(e));
  return events;
}

// ─── Tests ────────────────────────────────────────────────────

describe('Signal', () => {
  let signal: TestSignal;

  beforeEach(() => {
    signal = createSignal();
  });

  // ═══════════════════════════════════════════════════════════
  // Basic lifecycle
  // ═══════════════════════════════════════════════════════════

  describe('emit → Predicted', () => {
    it('should fire Predicted on first emit', () => {
      const predicted = collect(signal.Predicted);

      signal.emit(5, { id: 1, value: 'a' });

      expect(predicted).toHaveLength(1);
      expect(predicted[0]).toEqual({ tick: 5, data: { id: 1, value: 'a' } });
    });

    it('should fire Predicted for each unique data at the same tick', () => {
      const predicted = collect(signal.Predicted);

      signal.emit(5, { id: 1, value: 'a' });
      signal.emit(5, { id: 2, value: 'b' });

      expect(predicted).toHaveLength(2);
    });

    it('should not fire duplicate Predicted for identical data at same tick', () => {
      const predicted = collect(signal.Predicted);

      signal.emit(5, { id: 1, value: 'a' });
      signal.emit(5, { id: 1, value: 'a' });

      expect(predicted).toHaveLength(1);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Verification with verifiedTick
  // ═══════════════════════════════════════════════════════════

  describe('_onTick (verifiedTick) → Verified / Cancelled', () => {
    it('should fire Verified when verifiedTick reaches the emit tick', () => {
      const verified = collect(signal.Verified);

      signal.emit(5, { id: 1, value: 'hit' });
      signal._onTick(5);

      expect(verified).toHaveLength(1);
      expect(verified[0]).toEqual({ tick: 5, data: { id: 1, value: 'hit' } });
    });

    it('should not fire Verified when verifiedTick is below emit tick', () => {
      const verified = collect(signal.Verified);

      signal.emit(10, { id: 1, value: 'x' });
      signal._onTick(9);

      expect(verified).toHaveLength(0);
    });

    it('should fire Verified for multiple ticks when verifiedTick jumps forward', () => {
      const verified = collect(signal.Verified);

      signal.emit(1, { id: 1, value: 'a' });
      signal.emit(3, { id: 2, value: 'b' });
      signal.emit(5, { id: 3, value: 'c' });

      // Jump verifiedTick from -1 to 5 — should verify ticks 0..5
      signal._onTick(5);

      expect(verified).toHaveLength(3);
      expect(verified[0].tick).toBe(1);
      expect(verified[1].tick).toBe(3);
      expect(verified[2].tick).toBe(5);
    });

    it('should not re-verify already verified ticks', () => {
      const verified = collect(signal.Verified);

      signal.emit(1, { id: 1, value: 'a' });
      signal._onTick(1);
      expect(verified).toHaveLength(1);

      // Call again with same verifiedTick — no new events
      signal._onTick(1);
      expect(verified).toHaveLength(1);
    });

    it('should verify incrementally as verifiedTick advances', () => {
      const verified = collect(signal.Verified);

      signal.emit(1, { id: 1, value: 'a' });
      signal.emit(5, { id: 2, value: 'b' });

      signal._onTick(3); // verifies tick 0..3 → only tick 1 has data
      expect(verified).toHaveLength(1);
      expect(verified[0].tick).toBe(1);

      signal._onTick(5); // verifies tick 4..5 → tick 5 has data
      expect(verified).toHaveLength(2);
      expect(verified[1].tick).toBe(5);
    });

    it('should handle ticks with no signals silently', () => {
      const verified = collect(signal.Verified);
      const cancelled = collect(signal.Cancelled);

      // No emissions, just advance verifiedTick
      signal._onTick(100);

      expect(verified).toHaveLength(0);
      expect(cancelled).toHaveLength(0);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Local / single-player: immediate verification
  // ═══════════════════════════════════════════════════════════

  describe('local / single-player (verifiedTick = currentTick)', () => {
    it('should verify immediately when verifiedTick equals emit tick', () => {
      const predicted = collect(signal.Predicted);
      const verified = collect(signal.Verified);

      // Simulate local: emit at tick 1, verify at tick 1
      signal.emit(1, { id: 1, value: 'local' });
      signal._onTick(1);

      expect(predicted).toHaveLength(1);
      expect(verified).toHaveLength(1);
      expect(verified[0].tick).toBe(1);
    });

    it('should verify each tick immediately in sequence', () => {
      const verified = collect(signal.Verified);

      for (let tick = 1; tick <= 5; tick++) {
        signal.emit(tick, { id: tick, value: `t${tick}` });
        signal._onTick(tick);
      }

      expect(verified).toHaveLength(5);
      for (let i = 0; i < 5; i++) {
        expect(verified[i].tick).toBe(i + 1);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Multiplayer: delayed verification
  // ═══════════════════════════════════════════════════════════

  describe('multiplayer (verifiedTick lags behind currentTick)', () => {
    it('should not verify until server confirms', () => {
      const verified = collect(signal.Verified);

      // Simulation runs ticks 1..10, but server hasn't confirmed anything
      for (let tick = 1; tick <= 10; tick++) {
        signal.emit(tick, { id: tick, value: `t${tick}` });
        signal._onTick(-1); // verifiedTick = -1 means nothing confirmed
      }

      expect(verified).toHaveLength(0);
    });

    it('should verify in batch when server confirms multiple ticks', () => {
      const verified = collect(signal.Verified);

      // Client emits at ticks 1, 3, 5
      signal.emit(1, { id: 1, value: 'a' });
      signal.emit(3, { id: 3, value: 'c' });
      signal.emit(5, { id: 5, value: 'e' });

      // Server confirms up to tick 4 (serverTick=5 → verifiedTick=4)
      signal._onTick(4);

      // Ticks 1 and 3 are verified, tick 5 is not yet
      expect(verified).toHaveLength(2);
      expect(verified[0].tick).toBe(1);
      expect(verified[1].tick).toBe(3);
    });

    it('should verify remaining ticks when server catches up', () => {
      const verified = collect(signal.Verified);

      signal.emit(1, { id: 1, value: 'a' });
      signal.emit(5, { id: 5, value: 'e' });
      signal.emit(8, { id: 8, value: 'h' });

      // First batch: server confirms up to tick 3
      signal._onTick(3);
      expect(verified).toHaveLength(1); // tick 1

      // Second batch: server confirms up to tick 7
      signal._onTick(7);
      expect(verified).toHaveLength(2); // + tick 5

      // Third batch: server confirms up to tick 10
      signal._onTick(10);
      expect(verified).toHaveLength(3); // + tick 8
    });

    it('should simulate realistic multiplayer timing with input delay', () => {
      const predicted = collect(signal.Predicted);
      const verified = collect(signal.Verified);

      // Simulate: client at tick 20, server confirms up to tick 15
      // Events emitted during simulation at ticks 12, 14, 17, 19
      signal.emit(12, { id: 12, value: 'hit' });
      signal.emit(14, { id: 14, value: 'hit' });
      signal.emit(17, { id: 17, value: 'hit' });
      signal.emit(19, { id: 19, value: 'hit' });

      expect(predicted).toHaveLength(4);

      // Server confirms: serverTick=16, verifiedTick=15
      signal._onTick(15);
      expect(verified).toHaveLength(2); // ticks 12, 14

      // Server confirms: serverTick=20, verifiedTick=19
      signal._onTick(19);
      expect(verified).toHaveLength(4); // + ticks 17, 19
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Rollback scenarios
  // ═══════════════════════════════════════════════════════════

  describe('rollback + re-simulation', () => {
    it('should not duplicate Predicted when same event re-emitted after rollback', () => {
      const predicted = collect(signal.Predicted);

      // First simulation: emit at tick 5
      signal.emit(5, { id: 1, value: 'shot' });
      expect(predicted).toHaveLength(1);

      // Rollback to tick 3 — clears pending for ticks > 3
      signal._onBeforeRollback(3);

      // Re-simulate tick 5 with same data
      signal.emit(5, { id: 1, value: 'shot' });

      // Should NOT fire Predicted again (it's in awaitingVerification)
      expect(predicted).toHaveLength(1);
    });

    it('should fire Verified when re-emitted data matches after rollback', () => {
      const verified = collect(signal.Verified);

      // First simulation: emit at tick 5
      signal.emit(5, { id: 1, value: 'shot' });

      // Rollback to tick 3, re-simulate
      signal._onBeforeRollback(3);
      signal.emit(5, { id: 1, value: 'shot' });

      // Verify — pending and awaiting both have the data
      signal._onTick(5);
      expect(verified).toHaveLength(1);
      expect(verified[0].data).toEqual({ id: 1, value: 'shot' });
    });

    it('should fire Cancelled when event disappears after rollback', () => {
      const cancelled = collect(signal.Cancelled);

      // First simulation: emit at tick 5
      signal.emit(5, { id: 1, value: 'shot' });

      // Rollback to tick 3, re-simulate tick 5 WITHOUT the event
      signal._onBeforeRollback(3);
      // (don't re-emit)

      // Verify — awaiting has data but pending doesn't
      signal._onTick(5);
      expect(cancelled).toHaveLength(1);
      expect(cancelled[0].data).toEqual({ id: 1, value: 'shot' });
    });

    it('should fire Cancelled for old data and Predicted for new data after rollback changes event', () => {
      const predicted = collect(signal.Predicted);
      const verified = collect(signal.Verified);
      const cancelled = collect(signal.Cancelled);

      // First simulation: emit "shot" at tick 5
      signal.emit(5, { id: 1, value: 'shot' });
      expect(predicted).toHaveLength(1);

      // Rollback to tick 3, re-simulate with different data
      signal._onBeforeRollback(3);
      signal.emit(5, { id: 2, value: 'miss' });

      // "miss" is new → fires Predicted
      expect(predicted).toHaveLength(2);
      expect(predicted[1].data).toEqual({ id: 2, value: 'miss' });

      // Verify tick 5
      signal._onTick(5);

      // "shot" was predicted but not in pending → Cancelled
      expect(cancelled).toHaveLength(1);
      expect(cancelled[0].data).toEqual({ id: 1, value: 'shot' });

      // "miss" is in pending and awaiting → Verified
      expect(verified).toHaveLength(1);
      expect(verified[0].data).toEqual({ id: 2, value: 'miss' });
    });

    it('should handle rollback before any verification', () => {
      const predicted = collect(signal.Predicted);
      const cancelled = collect(signal.Cancelled);
      const verified = collect(signal.Verified);

      // Emit events at ticks 3, 5, 7
      signal.emit(3, { id: 3, value: 'a' });
      signal.emit(5, { id: 5, value: 'b' });
      signal.emit(7, { id: 7, value: 'c' });
      expect(predicted).toHaveLength(3);

      // Rollback to tick 4 — clears pending for ticks > 4
      signal._onBeforeRollback(4);

      // Re-simulate: tick 5 same, tick 7 gone
      signal.emit(5, { id: 5, value: 'b' }); // same — no new Predicted
      // tick 7 not re-emitted

      // Verify all up to tick 7
      signal._onTick(7);

      // tick 3: was in pending (not cleared by rollback to 4), verified
      expect(verified).toHaveLength(2); // ticks 3 and 5
      expect(verified[0].tick).toBe(3);
      expect(verified[1].tick).toBe(5);

      // tick 7: was predicted but not re-emitted → cancelled
      expect(cancelled).toHaveLength(1);
      expect(cancelled[0].tick).toBe(7);
    });

    it('should handle multiple rollbacks before verification', () => {
      const predicted = collect(signal.Predicted);
      const cancelled = collect(signal.Cancelled);
      const verified = collect(signal.Verified);

      // Simulation 1: emit at tick 5
      signal.emit(5, { id: 1, value: 'v1' });

      // Rollback to tick 3
      signal._onBeforeRollback(3);

      // Simulation 2: emit different at tick 5
      signal.emit(5, { id: 1, value: 'v2' });

      // Rollback again to tick 3
      signal._onBeforeRollback(3);

      // Simulation 3: emit yet another at tick 5
      signal.emit(5, { id: 1, value: 'v3' });

      // v1 and v2 predicted, v3 predicted
      expect(predicted).toHaveLength(3);

      // Verify
      signal._onTick(5);

      // v3 is in pending → matched? v1, v2, v3 are all in awaitingVerification
      // pending only has v3 (from simulation 3)
      // v1 → cancelled, v2 → cancelled, v3 → verified
      expect(verified).toHaveLength(1);
      expect(verified[0].data.value).toBe('v3');
      expect(cancelled).toHaveLength(2);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Multiplayer rollback: server sends late input causing rollback
  // ═══════════════════════════════════════════════════════════

  describe('multiplayer rollback scenario', () => {
    it('should handle: predict → remote input causes rollback → re-simulate → verify with delay', () => {
      const predicted = collect(signal.Predicted);
      const verified = collect(signal.Verified);
      const cancelled = collect(signal.Cancelled);

      // Client simulates ticks 1..10
      // At tick 5, emits a "hit" event (predicted based on local input)
      signal.emit(5, { id: 1, value: 'hit' });
      expect(predicted).toHaveLength(1);

      // Server sends fanout with remote input at tick 4 → rollback to tick 4
      // The remote input changes simulation: "hit" at tick 5 still happens
      signal._onBeforeRollback(4);
      signal.emit(5, { id: 1, value: 'hit' }); // re-emitted (same data)
      expect(predicted).toHaveLength(1); // no duplicate

      // Server confirms ticks up to 8 (serverTick=9, verifiedTick=8)
      signal._onTick(8);

      expect(verified).toHaveLength(1);
      expect(verified[0].data).toEqual({ id: 1, value: 'hit' });
      expect(cancelled).toHaveLength(0);
    });

    it('should cancel prediction when remote input changes outcome after rollback', () => {
      const predicted = collect(signal.Predicted);
      const verified = collect(signal.Verified);
      const cancelled = collect(signal.Cancelled);

      // Client predicts "hit" at tick 5
      signal.emit(5, { id: 1, value: 'hit' });
      expect(predicted).toHaveLength(1);

      // Remote input at tick 3 changes simulation → rollback to 3
      // After re-simulation, the hit doesn't happen anymore
      signal._onBeforeRollback(3);
      // (tick 5 re-simulated but event NOT emitted)

      // Server confirms up to tick 6
      signal._onTick(6);

      expect(verified).toHaveLength(0);
      expect(cancelled).toHaveLength(1);
      expect(cancelled[0].data).toEqual({ id: 1, value: 'hit' });
    });

    it('should handle partial verification: some ticks verified, rollback on unverified ticks', () => {
      const verified = collect(signal.Verified);
      const cancelled = collect(signal.Cancelled);

      // Events at ticks 3, 6, 9
      signal.emit(3, { id: 3, value: 'a' });
      signal.emit(6, { id: 6, value: 'b' });
      signal.emit(9, { id: 9, value: 'c' });

      // Server confirms up to tick 5 → tick 3 verified
      signal._onTick(5);
      expect(verified).toHaveLength(1);
      expect(verified[0].tick).toBe(3);

      // Rollback to tick 5 (remote input at tick 5)
      // Ticks > 5 pending cleared → ticks 6 and 9 cleared
      signal._onBeforeRollback(5);

      // Re-simulate: tick 6 same, tick 9 different
      signal.emit(6, { id: 6, value: 'b' }); // same
      signal.emit(9, { id: 99, value: 'new' }); // different

      // Server confirms up to tick 10
      signal._onTick(10);

      // tick 3: already verified (not re-processed)
      // tick 6: verified (re-emitted same data)
      // tick 9: "c" cancelled, "new" verified
      expect(verified).toHaveLength(3); // tick 3 + 6 + 9(new)
      expect(cancelled).toHaveLength(1); // tick 9(c)
      expect(cancelled[0].data).toEqual({ id: 9, value: 'c' });
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Full multiplayer simulation flow
  // ═══════════════════════════════════════════════════════════

  describe('full multiplayer flow simulation', () => {
    it('should handle realistic tick-by-tick multiplayer with delayed verification', () => {
      const predicted = collect(signal.Predicted);
      const verified = collect(signal.Verified);
      const cancelled = collect(signal.Cancelled);

      // Simulate client running at tick N, server confirming ~5 ticks behind
      // Tick 1-4: nothing happens
      for (let t = 1; t <= 4; t++) {
        signal._onTick(-1); // server hasn't confirmed anything
      }

      // Tick 5: player collects a coin (predicted)
      signal.emit(5, { id: 1, value: 'coin' });
      signal._onTick(-1); // still no server confirmation
      expect(predicted).toHaveLength(1);
      expect(verified).toHaveLength(0);

      // Ticks 6-8: nothing, server starts confirming
      signal._onTick(2); // server confirmed up to tick 3 (verifiedTick=2)
      expect(verified).toHaveLength(0); // tick 5 not yet verified

      // Tick 9: another event
      signal.emit(9, { id: 2, value: 'powerup' });
      signal._onTick(4); // server confirmed up to 5 (verifiedTick=4)
      expect(verified).toHaveLength(0); // tick 5 not at 4

      // Tick 10: server catches up
      signal._onTick(7); // server confirmed up to 8 (verifiedTick=7)
      expect(verified).toHaveLength(1); // tick 5 verified!
      expect(verified[0].data).toEqual({ id: 1, value: 'coin' });

      // Tick 15: server confirms more
      signal._onTick(12);
      expect(verified).toHaveLength(2); // tick 9 verified
      expect(verified[1].data).toEqual({ id: 2, value: 'powerup' });
      expect(cancelled).toHaveLength(0);
    });

    it('should handle rollback mid-verification-window', () => {
      const predicted = collect(signal.Predicted);
      const verified = collect(signal.Verified);
      const cancelled = collect(signal.Cancelled);

      // Phase 1: Client simulates ticks 1..20, emitting at 5, 10, 15
      signal.emit(5, { id: 5, value: 'a' });
      signal.emit(10, { id: 10, value: 'b' });
      signal.emit(15, { id: 15, value: 'c' });
      expect(predicted).toHaveLength(3);

      // Server confirms up to tick 7
      signal._onTick(7);
      expect(verified).toHaveLength(1); // tick 5

      // Rollback to tick 8 (remote input at tick 8)
      signal._onBeforeRollback(8);

      // Re-simulate: tick 10 doesn't happen, tick 15 happens with new data
      signal.emit(15, { id: 15, value: 'c-new' });

      // Server confirms up to tick 16
      signal._onTick(16);

      // tick 5: already verified in the first _onTick(7) call
      // tick 10: predicted "b" but not re-emitted → cancelled
      // tick 15: "c" predicted but "c-new" in pending → "c" cancelled; "c-new" predicted + verified
      expect(verified).toHaveLength(2); // tick 5 (earlier) + tick 15(c-new)
      expect(cancelled).toHaveLength(2); // tick 10(b) + tick 15(c)
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Edge cases
  // ═══════════════════════════════════════════════════════════

  describe('edge cases', () => {
    it('should handle verifiedTick = -1 (nothing confirmed)', () => {
      const verified = collect(signal.Verified);

      signal.emit(0, { id: 0, value: 'x' });
      signal._onTick(-1);

      expect(verified).toHaveLength(0);
    });

    it('should handle emit at tick 0', () => {
      const verified = collect(signal.Verified);

      signal.emit(0, { id: 0, value: 'zero' });
      signal._onTick(0);

      expect(verified).toHaveLength(1);
      expect(verified[0].tick).toBe(0);
    });

    it('should handle multiple events at same tick', () => {
      const verified = collect(signal.Verified);
      const cancelled = collect(signal.Cancelled);

      signal.emit(5, { id: 1, value: 'a' });
      signal.emit(5, { id: 2, value: 'b' });
      signal.emit(5, { id: 3, value: 'c' });

      signal._onTick(5);

      expect(verified).toHaveLength(3);
      expect(cancelled).toHaveLength(0);
    });

    it('should handle multiple events at same tick, partial cancellation after rollback', () => {
      const verified = collect(signal.Verified);
      const cancelled = collect(signal.Cancelled);

      // Emit 3 events at tick 5
      signal.emit(5, { id: 1, value: 'a' });
      signal.emit(5, { id: 2, value: 'b' });
      signal.emit(5, { id: 3, value: 'c' });

      // Rollback, re-emit only 2
      signal._onBeforeRollback(4);
      signal.emit(5, { id: 1, value: 'a' });
      signal.emit(5, { id: 3, value: 'c' });

      signal._onTick(5);

      expect(verified).toHaveLength(2);
      expect(cancelled).toHaveLength(1);
      expect(cancelled[0].data).toEqual({ id: 2, value: 'b' });
    });

    it('should handle duplicate data across different ticks independently', () => {
      const verified = collect(signal.Verified);

      signal.emit(3, { id: 1, value: 'same' });
      signal.emit(7, { id: 1, value: 'same' });

      signal._onTick(7);

      expect(verified).toHaveLength(2);
      expect(verified[0].tick).toBe(3);
      expect(verified[1].tick).toBe(7);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // _dataEquals
  // ═══════════════════════════════════════════════════════════

  describe('_dataEquals (shallow comparison)', () => {
    it('should match identical objects', () => {
      const predicted = collect(signal.Predicted);

      signal.emit(1, { id: 1, value: 'a' });
      signal.emit(1, { id: 1, value: 'a' }); // duplicate

      expect(predicted).toHaveLength(1); // proves _dataEquals matched
    });

    it('should not match objects with different values', () => {
      const predicted = collect(signal.Predicted);

      signal.emit(1, { id: 1, value: 'a' });
      signal.emit(1, { id: 1, value: 'b' });

      expect(predicted).toHaveLength(2);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // dispose
  // ═══════════════════════════════════════════════════════════

  describe('dispose', () => {
    it('should reset _lastVerifiedTick so verification restarts from -1', () => {
      const verified = collect(signal.Verified);

      signal.emit(1, { id: 1, value: 'a' });
      signal._onTick(1);
      expect(verified).toHaveLength(1);

      signal.dispose();

      // After dispose, re-subscribe (old subscriptions cleared)
      const verified2 = collect(signal.Verified);
      signal.emit(1, { id: 1, value: 'b' });
      signal._onTick(1);
      expect(verified2).toHaveLength(1);
      expect(verified2[0].tick).toBe(1);
    });

    it('should clear all pending and awaiting data', () => {
      const cancelled = collect(signal.Cancelled);

      signal.emit(5, { id: 1, value: 'x' });
      signal.dispose();

      const cancelled2 = collect(signal.Cancelled);
      signal._onTick(5);

      expect(cancelled).toHaveLength(0);
      expect(cancelled2).toHaveLength(0);
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// SignalsRegistry
// ═══════════════════════════════════════════════════════════════

describe('SignalsRegistry', () => {
  let registry: SignalsRegistry;
  let signal1: TestSignal;
  let signal2: TestSignal;

  beforeEach(() => {
    const config = new ECSConfig({ fps: 60 });
    signal1 = new TestSignal(config);
    signal2 = new TestSignal(config);
    registry = new SignalsRegistry();
    registry.init([signal1, signal2]);
  });

  it('should forward verifiedTick to all signals', () => {
    const v1 = collect(signal1.Verified);
    const v2 = collect(signal2.Verified);

    signal1.emit(3, { id: 1, value: 'a' });
    signal2.emit(3, { id: 2, value: 'b' });

    registry.onTick(3);

    expect(v1).toHaveLength(1);
    expect(v2).toHaveLength(1);
  });

  it('should forward onBeforeRollback to all signals', () => {
    const c1 = collect(signal1.Cancelled);
    const c2 = collect(signal2.Cancelled);

    signal1.emit(5, { id: 1, value: 'a' });
    signal2.emit(5, { id: 2, value: 'b' });

    registry.onBeforeRollback(3);
    // Don't re-emit → both cancelled

    registry.onTick(5);

    expect(c1).toHaveLength(1);
    expect(c2).toHaveLength(1);
  });

  it('should dispose all signals', () => {
    signal1.emit(5, { id: 1, value: 'a' });
    signal2.emit(5, { id: 2, value: 'b' });

    registry.dispose();

    const v1 = collect(signal1.Verified);
    const v2 = collect(signal2.Verified);
    const c1 = collect(signal1.Cancelled);
    const c2 = collect(signal2.Cancelled);

    signal1._onTick(5);
    signal2._onTick(5);

    // After dispose, data is cleared, _lastVerifiedTick is -1
    // But no events because awaiting and pending were cleared
    expect(v1).toHaveLength(0);
    expect(v2).toHaveLength(0);
    expect(c1).toHaveLength(0);
    expect(c2).toHaveLength(0);
  });

  it('should throw on double init', () => {
    const reg = new SignalsRegistry();
    const config = new ECSConfig({ fps: 60 });
    reg.init([new TestSignal(config)]);
    expect(() => reg.init([new TestSignal(config)])).toThrow('Signals already registered');
  });
});
