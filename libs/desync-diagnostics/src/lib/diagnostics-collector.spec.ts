import { DiagnosticsCollector } from './diagnostics-collector.js';
import type { DiagnosticsConfig } from './types.js';

// ─── Mocks ──────────────────────────────────────────────────

function createMockRunner(options?: { maxPlayers?: number }) {
  const maxPlayers = options?.maxPlayers ?? 4;
  let tickHandler: ((tick: number) => void) | null = null;
  let rollbackHandler: ((tick: number) => void) | null = null;
  let currentTick = 0;
  let hashAtTickMap = new Map<number, number>();
  let memHash = 0;
  let verifiedTick = -1;
  const rpcsByTick = new Map<number, Array<{ meta: { playerSlot: number }; inputId: number }>>();

  const runner = {
    Config: { maxPlayers },
    Simulation: {
      tick: 0,
      addTickHandler: (fn: (tick: number) => void) => {
        tickHandler = fn;
        return () => { tickHandler = null; };
      },
      addRollbackHandler: (fn: (tick: number) => void) => {
        rollbackHandler = fn;
        return () => { rollbackHandler = null; };
      },
      getHashAtTick: (tick: number) => hashAtTickMap.get(tick),
      mem: {
        getHash: () => memHash,
      },
    },
    InputProviderInstance: {
      get verifiedTick() { return verifiedTick; },
      rpcHistory: {
        getRPCsAtTick: (tick: number) => rpcsByTick.get(tick) ?? [],
        getRPCCountAtTick: (tick: number) => (rpcsByTick.get(tick) ?? []).length,
      },
    },
  };

  return {
    runner: runner as unknown as Parameters<typeof DiagnosticsCollector['prototype']['dispose']> extends [] ? any : any,
    fireTick: (tick: number) => {
      currentTick = tick;
      runner.Simulation.tick = tick;
      tickHandler?.(tick);
    },
    fireRollback: (tick: number) => {
      // Simulate real ECSSimulation behavior: tick is restored BEFORE handler fires
      runner.Simulation.tick = tick;
      rollbackHandler?.(tick);
    },
    setHashAtTick: (tick: number, hash: number) => hashAtTickMap.set(tick, hash),
    setMemHash: (hash: number) => { memHash = hash; },
    setVerifiedTick: (vt: number) => { verifiedTick = vt; },
    setRPCsAtTick: (tick: number, rpcs: Array<{ meta: { playerSlot: number }; inputId: number }>) => {
      rpcsByTick.set(tick, rpcs);
    },
    get tickHandler() { return tickHandler; },
    get rollbackHandler() { return rollbackHandler; },
  };
}

// ─── Tests ──────────────────────────────────────────────────

describe('DiagnosticsCollector', () => {
  it('should record tick data via tick handler', () => {
    const { runner, fireTick, setHashAtTick, setVerifiedTick } = createMockRunner();
    const collector = new DiagnosticsCollector(runner, { bufferSize: 100 });

    setHashAtTick(1, 0xABCD);
    setVerifiedTick(0);
    fireTick(1);

    expect(collector.count).toBe(1);

    const timeline = collector.getTimeline();
    expect(timeline).toHaveLength(1);
    expect(timeline[0].tick).toBe(1);
    expect(timeline[0].hash).toBe(0xABCD);
    expect(timeline[0].verifiedTick).toBe(0);
    expect(timeline[0].wasRollback).toBe(false);

    collector.dispose();
  });

  it('should fall back to mem.getHash() when hashHistory misses', () => {
    const { runner, fireTick, setMemHash, setVerifiedTick } = createMockRunner();
    const collector = new DiagnosticsCollector(runner, { bufferSize: 100 });

    setMemHash(0x1234);
    setVerifiedTick(0);
    fireTick(1);

    const timeline = collector.getTimeline();
    expect(timeline[0].hash).toBe(0x1234);

    collector.dispose();
  });

  it('should record input counts per player slot', () => {
    const { runner, fireTick, setHashAtTick, setVerifiedTick, setRPCsAtTick } = createMockRunner({ maxPlayers: 4 });
    const collector = new DiagnosticsCollector(runner, { bufferSize: 100 });

    setHashAtTick(5, 0);
    setVerifiedTick(4);
    setRPCsAtTick(5, [
      { meta: { playerSlot: 0 }, inputId: 1 },
      { meta: { playerSlot: 0 }, inputId: 2 },
      { meta: { playerSlot: 1 }, inputId: 1 },
    ]);
    fireTick(5);

    const timeline = collector.getTimeline();
    expect(timeline[0].inputCountBySlot[0]).toBe(2);
    expect(timeline[0].inputCountBySlot[1]).toBe(1);
    expect(timeline[0].inputCountBySlot[2]).toBe(0);
    expect(timeline[0].inputCountBySlot[3]).toBe(0);

    collector.dispose();
  });

  it('should wrap ring buffer when full', () => {
    const { runner, fireTick, setHashAtTick, setVerifiedTick } = createMockRunner();
    const bufferSize = 5;
    const collector = new DiagnosticsCollector(runner, { bufferSize });

    setVerifiedTick(0);
    for (let t = 1; t <= 8; t++) {
      setHashAtTick(t, t * 100);
      fireTick(t);
    }

    // Buffer should contain ticks 4-8 (last 5)
    expect(collector.count).toBe(5);
    const timeline = collector.getTimeline();
    expect(timeline.map(r => r.tick)).toEqual([4, 5, 6, 7, 8]);
    expect(timeline.map(r => r.hash)).toEqual([400, 500, 600, 700, 800]);

    collector.dispose();
  });

  it('should record rollback events', () => {
    const { runner, fireTick, fireRollback, setHashAtTick, setVerifiedTick } = createMockRunner();
    const collector = new DiagnosticsCollector(runner, { bufferSize: 100 });

    setVerifiedTick(0);
    // Simulate ticks 1-10
    for (let t = 1; t <= 10; t++) {
      setHashAtTick(t, t);
      fireTick(t);
    }

    // Rollback to tick 5
    fireRollback(5);

    const rollbacks = collector.getRollbacks();
    expect(rollbacks).toHaveLength(1);
    expect(rollbacks[0].atSimTick).toBe(10);
    expect(rollbacks[0].rollbackToTick).toBe(5);
    expect(rollbacks[0].timestamp).toBeGreaterThan(0);

    const stats = collector.getStats();
    expect(stats.totalRollbacks).toBe(1);
    expect(stats.lastRollbackTick).toBe(5);

    collector.dispose();
  });

  it('should mark re-simulated ticks as wasRollback=true', () => {
    const { runner, fireTick, fireRollback, setHashAtTick, setVerifiedTick } = createMockRunner();
    const collector = new DiagnosticsCollector(runner, { bufferSize: 100 });

    setVerifiedTick(0);
    // Initial simulation: ticks 1-10
    for (let t = 1; t <= 10; t++) {
      setHashAtTick(t, t);
      fireTick(t);
    }

    // Rollback to tick 8 (atSimTick=10)
    fireRollback(8);

    // Re-simulate ticks 8, 9, 10 (these should be marked as rollback)
    for (let t = 8; t <= 10; t++) {
      setHashAtTick(t, t + 1000); // different hash post-rollback
      fireTick(t);
    }

    // Then simulate tick 11 (should NOT be marked as rollback)
    setHashAtTick(11, 11);
    fireTick(11);

    const timeline = collector.getTimeline();
    // Find tick 8, 9, 10, 11 entries (the latest ones)
    const tick8 = timeline.find(r => r.tick === 8 && r.hash === 1008);
    const tick9 = timeline.find(r => r.tick === 9 && r.hash === 1009);
    const tick10 = timeline.find(r => r.tick === 10 && r.hash === 1010);
    const tick11 = timeline.find(r => r.tick === 11);

    expect(tick8?.wasRollback).toBe(true);
    expect(tick9?.wasRollback).toBe(true);
    expect(tick10?.wasRollback).toBe(true);
    expect(tick11?.wasRollback).toBe(false);

    collector.dispose();
  });

  it('should detect verifiedTick gaps', () => {
    const { runner, fireTick, setHashAtTick, setVerifiedTick } = createMockRunner();
    const collector = new DiagnosticsCollector(runner, { bufferSize: 100 });

    setHashAtTick(1, 1);
    setVerifiedTick(0);
    fireTick(1);

    setHashAtTick(2, 2);
    setVerifiedTick(1); // +1, no gap
    fireTick(2);

    setHashAtTick(3, 3);
    setVerifiedTick(5); // +4, gap!
    fireTick(3);

    setHashAtTick(4, 4);
    setVerifiedTick(6); // +1, no gap
    fireTick(4);

    const stats = collector.getStats();
    expect(stats.verifiedTickGapCount).toBe(1);

    collector.dispose();
  });

  it('should provide correct stats', () => {
    const { runner, fireTick, setHashAtTick, setVerifiedTick } = createMockRunner();
    const collector = new DiagnosticsCollector(runner, { bufferSize: 100 });

    setVerifiedTick(0);
    for (let t = 1; t <= 5; t++) {
      setHashAtTick(t, t * 10);
      fireTick(t);
    }

    const stats = collector.getStats();
    expect(stats.ticksRecorded).toBe(5);
    expect(stats.totalRollbacks).toBe(0);
    expect(stats.latestHash).toBe(50);
    expect(stats.oldestTick).toBe(1);
    expect(stats.newestTick).toBe(5);

    collector.dispose();
  });

  it('should dispose and stop recording', () => {
    const { runner, fireTick, setHashAtTick, setVerifiedTick, tickHandler } = createMockRunner();
    const collector = new DiagnosticsCollector(runner, { bufferSize: 100 });

    setVerifiedTick(0);
    setHashAtTick(1, 1);
    fireTick(1);
    expect(collector.count).toBe(1);

    collector.dispose();

    // Handler should be removed
    expect(tickHandler).toBeNull();

    // Double dispose should be safe
    collector.dispose();
  });

  it('should cap rollback events at maxRollbackEvents', () => {
    const { runner, fireTick, fireRollback, setHashAtTick, setVerifiedTick } = createMockRunner();
    const collector = new DiagnosticsCollector(runner, { bufferSize: 100, maxRollbackEvents: 3 });

    setVerifiedTick(0);
    for (let t = 1; t <= 5; t++) {
      setHashAtTick(t, t);
      fireTick(t);
    }

    // Fire 4 rollbacks — only last 3 should remain
    for (let i = 0; i < 4; i++) {
      fireRollback(i + 1);
    }

    const rollbacks = collector.getRollbacks();
    expect(rollbacks).toHaveLength(3);
    expect(rollbacks[0].rollbackToTick).toBe(2);
    expect(rollbacks[2].rollbackToTick).toBe(4);

    collector.dispose();
  });

  it('should handle empty buffer stats gracefully', () => {
    const { runner } = createMockRunner();
    const collector = new DiagnosticsCollector(runner, { bufferSize: 100 });

    const stats = collector.getStats();
    expect(stats.ticksRecorded).toBe(0);
    expect(stats.latestHash).toBe(0);
    expect(stats.oldestTick).toBe(0);
    expect(stats.newestTick).toBe(0);

    const timeline = collector.getTimeline();
    expect(timeline).toHaveLength(0);

    collector.dispose();
  });

  it('should record physicsHash when physicsHashFn is provided', () => {
    let callCount = 0;
    const { runner, fireTick, setHashAtTick, setVerifiedTick } = createMockRunner();
    const collector = new DiagnosticsCollector(runner, {
      bufferSize: 100,
      physicsHashFn: () => {
        callCount++;
        return 0xDEAD;
      },
    });

    setHashAtTick(1, 0xABCD);
    setVerifiedTick(0);
    fireTick(1);

    const timeline = collector.getTimeline();
    expect(timeline[0].physicsHash).toBe(0xDEAD);
    expect(callCount).toBe(1);

    const stats = collector.getStats();
    expect(stats.latestPhysicsHash).toBe(0xDEAD);

    collector.dispose();
  });

  it('should record physicsHash as 0 when physicsHashFn is not provided', () => {
    const { runner, fireTick, setHashAtTick, setVerifiedTick } = createMockRunner();
    const collector = new DiagnosticsCollector(runner, { bufferSize: 100 });

    setHashAtTick(1, 0xABCD);
    setVerifiedTick(0);
    fireTick(1);

    const timeline = collector.getTimeline();
    expect(timeline[0].physicsHash).toBe(0);

    const stats = collector.getStats();
    expect(stats.latestPhysicsHash).toBe(0);

    collector.dispose();
  });
});
