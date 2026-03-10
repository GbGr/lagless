import { generateReport } from './report-generator.js';
import type { DiagnosticsCollector } from './diagnostics-collector.js';
import type { TickRecord, RollbackEvent, DiagnosticsStats } from './types.js';

function createMockCollector(overrides?: {
  timeline?: TickRecord[];
  rollbacks?: RollbackEvent[];
  stats?: Partial<DiagnosticsStats>;
  playerSlot?: number;
  maxPlayers?: number;
  fps?: number;
  verifiedTick?: number;
}) {
  const timeline: TickRecord[] = overrides?.timeline ?? [
    { tick: 1, hash: 100, physicsHash: 1000, velocityHash: 10000, verifiedTick: 0, wasRollback: false, inputCountBySlot: new Uint8Array([1, 0, 0, 0]) },
    { tick: 2, hash: 200, physicsHash: 2000, velocityHash: 20000, verifiedTick: 1, wasRollback: false, inputCountBySlot: new Uint8Array([1, 1, 0, 0]) },
    { tick: 3, hash: 300, physicsHash: 3000, velocityHash: 30000, verifiedTick: 2, wasRollback: true, inputCountBySlot: new Uint8Array([0, 1, 0, 0]) },
  ];

  const rollbacks: RollbackEvent[] = overrides?.rollbacks ?? [
    { atSimTick: 3, rollbackToTick: 2, timestamp: 1000 },
  ];

  const stats: DiagnosticsStats = {
    ticksRecorded: timeline.length,
    totalRollbacks: rollbacks.length,
    lastRollbackTick: rollbacks.length > 0 ? rollbacks[rollbacks.length - 1].rollbackToTick : 0,
    verifiedTickGapCount: 0,
    latestHash: timeline.length > 0 ? timeline[timeline.length - 1].hash : 0,
    latestPhysicsHash: timeline.length > 0 ? timeline[timeline.length - 1].physicsHash : 0,
    latestVelocityHash: timeline.length > 0 ? timeline[timeline.length - 1].velocityHash : 0,
    oldestTick: timeline.length > 0 ? timeline[0].tick : 0,
    newestTick: timeline.length > 0 ? timeline[timeline.length - 1].tick : 0,
    ...overrides?.stats,
  };

  const rpcsByTick = new Map<number, Array<{ inputId: number; meta: { seq: number; playerSlot: number; ordinal: number }; data: unknown }>>();
  rpcsByTick.set(1, [{ inputId: 1, meta: { seq: 1, playerSlot: 0, ordinal: 1 }, data: { directionX: 1, directionY: 0 } }]);
  rpcsByTick.set(2, [
    { inputId: 1, meta: { seq: 2, playerSlot: 0, ordinal: 1 }, data: { directionX: 0, directionY: 1 } },
    { inputId: 1, meta: { seq: 1, playerSlot: 1, ordinal: 1 }, data: { directionX: -1, directionY: 0 } },
  ]);

  return {
    getTimeline: () => timeline,
    getRollbacks: () => rollbacks,
    getStats: () => stats,
    runner: {
      Config: {
        maxPlayers: overrides?.maxPlayers ?? 4,
        fps: overrides?.fps ?? 60,
        frameLength: 1000 / (overrides?.fps ?? 60),
        snapshotRate: 1,
        maxEntities: 1000,
        seed: new Uint8Array(16),
      },
      InputProviderInstance: {
        playerSlot: overrides?.playerSlot ?? 0,
        verifiedTick: overrides?.verifiedTick ?? 2,
        rpcHistory: {
          getRPCsAtTick: (tick: number) => rpcsByTick.get(tick) ?? [],
        },
      },
    },
  } as unknown as DiagnosticsCollector;
}

describe('generateReport', () => {
  it('should produce a valid report with all required fields', () => {
    const collector = createMockCollector();
    const report = generateReport(collector);

    expect(report.version).toBe(2);
    expect(report.generatedAt).toBeTypeOf('string');
    expect(report.playerSlot).toBe(0);

    // Config
    expect(report.config.fps).toBe(60);
    expect(report.config.maxPlayers).toBe(4);

    // Summary
    expect(report.summary.totalTicks).toBe(3);
    expect(report.summary.totalRollbacks).toBe(1);

    // Timeline
    expect(report.timeline).toHaveLength(3);
    expect(report.timeline[0].tick).toBe(1);
    expect(report.timeline[0].hash).toBe(100);

    // Rollbacks
    expect(report.rollbacks).toHaveLength(1);
    expect(report.rollbacks[0].rollbackToTick).toBe(2);
  });

  it('should include input history for ticks in the timeline', () => {
    const collector = createMockCollector();
    const report = generateReport(collector);

    expect(report.inputHistory).toBeDefined();
    // Tick 1 has 1 RPC, tick 2 has 2 RPCs, tick 3 has 0 RPCs
    expect(report.inputHistory['1']).toHaveLength(1);
    expect(report.inputHistory['2']).toHaveLength(2);
    expect(report.inputHistory['3']).toBeUndefined(); // no RPCs at tick 3
  });

  it('should serialize to JSON without errors', () => {
    const collector = createMockCollector();
    const report = generateReport(collector);

    // Uint8Array should be converted to regular array for JSON serialization
    const json = JSON.stringify(report);
    expect(json).toBeTypeOf('string');

    const parsed = JSON.parse(json);
    expect(parsed.timeline[0].inputCountBySlot).toEqual([1, 0, 0, 0]);
  });

  it('should handle empty collector gracefully', () => {
    const collector = createMockCollector({
      timeline: [],
      rollbacks: [],
      stats: { ticksRecorded: 0, totalRollbacks: 0, latestHash: 0, latestPhysicsHash: 0, latestVelocityHash: 0, oldestTick: 0, newestTick: 0 },
    });
    const report = generateReport(collector);

    expect(report.timeline).toHaveLength(0);
    expect(report.rollbacks).toHaveLength(0);
    expect(report.summary.totalTicks).toBe(0);
    expect(Object.keys(report.inputHistory)).toHaveLength(0);
  });

  it('should include physicsHash per tick record', () => {
    const collector = createMockCollector();
    const report = generateReport(collector);

    expect(report.timeline[0].physicsHash).toBe(1000);
    expect(report.timeline[1].physicsHash).toBe(2000);
    expect(report.timeline[2].physicsHash).toBe(3000);
  });

  it('should include latestPhysicsHash in summary', () => {
    const collector = createMockCollector();
    const report = generateReport(collector);

    expect(report.summary.latestPhysicsHash).toBe(3000);
  });
});
