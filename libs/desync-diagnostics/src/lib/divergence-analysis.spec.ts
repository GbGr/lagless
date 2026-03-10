import { analyzeDivergence } from './divergence-analysis.js';
import type { DiagnosticsReport } from './report-generator.js';

function makeReport(
  playerSlot: number,
  timeline: Array<{ tick: number; hash: number; physicsHash: number; wasRollback?: boolean }>,
  rollbacks?: Array<{ atSimTick: number; rollbackToTick: number; timestamp: number }>,
): DiagnosticsReport {
  return {
    version: 2,
    generatedAt: new Date().toISOString(),
    playerSlot,
    config: { fps: 60, maxPlayers: 4, frameLength: 16.67, snapshotRate: 1, maxEntities: 1000 },
    summary: {
      totalTicks: timeline.length,
      totalRollbacks: rollbacks?.length ?? 0,
      firstDivergenceTick: null,
      verifiedTickGapCount: 0,
      latestPhysicsHash: timeline.length > 0 ? timeline[timeline.length - 1].physicsHash : 0,
      oldestTick: timeline.length > 0 ? timeline[0].tick : 0,
      newestTick: timeline.length > 0 ? timeline[timeline.length - 1].tick : 0,
    },
    timeline: timeline.map((t) => ({
      tick: t.tick,
      hash: t.hash,
      physicsHash: t.physicsHash,
      velocityHash: 0,
      verifiedTick: t.tick - 1,
      wasRollback: t.wasRollback ?? false,
      inputCountBySlot: [0, 0, 0, 0],
    })),
    rollbacks: rollbacks ?? [],
    inputHistory: {},
  };
}

describe('analyzeDivergence', () => {
  it('should return no divergence when all clients match', () => {
    const timeline = [
      { tick: 1, hash: 100, physicsHash: 1000 },
      { tick: 2, hash: 200, physicsHash: 2000 },
      { tick: 3, hash: 300, physicsHash: 3000 },
    ];
    const result = analyzeDivergence([
      makeReport(0, timeline),
      makeReport(1, timeline),
    ]);

    expect(result.firstEcsDivergenceTick).toBeNull();
    expect(result.firstPhysicsDivergenceTick).toBeNull();
  });

  it('should find first ECS divergence tick', () => {
    const result = analyzeDivergence([
      makeReport(0, [
        { tick: 1, hash: 100, physicsHash: 1000 },
        { tick: 2, hash: 200, physicsHash: 2000 },
        { tick: 3, hash: 999, physicsHash: 3000 },
      ]),
      makeReport(1, [
        { tick: 1, hash: 100, physicsHash: 1000 },
        { tick: 2, hash: 200, physicsHash: 2000 },
        { tick: 3, hash: 300, physicsHash: 3000 },
      ]),
    ]);

    expect(result.firstEcsDivergenceTick).toBe(3);
    expect(result.firstPhysicsDivergenceTick).toBeNull();
  });

  it('should find first physics divergence tick', () => {
    const result = analyzeDivergence([
      makeReport(0, [
        { tick: 1, hash: 100, physicsHash: 1000 },
        { tick: 2, hash: 200, physicsHash: 9999 },
      ]),
      makeReport(1, [
        { tick: 1, hash: 100, physicsHash: 1000 },
        { tick: 2, hash: 200, physicsHash: 2000 },
      ]),
    ]);

    expect(result.firstEcsDivergenceTick).toBeNull();
    expect(result.firstPhysicsDivergenceTick).toBe(2);
  });

  it('should use LAST occurrence of a tick in timeline (rollback resimulation)', () => {
    // Client 0 has tick 2 twice — original (hash=200) and resimulated (hash=250)
    // The final hash is 250, which matches client 1's hash of 250
    const result = analyzeDivergence([
      makeReport(0, [
        { tick: 1, hash: 100, physicsHash: 1000 },
        { tick: 2, hash: 200, physicsHash: 2000 },  // original — stale
        { tick: 3, hash: 300, physicsHash: 3000 },
        { tick: 2, hash: 250, physicsHash: 2500, wasRollback: true },  // resimulated — final
        { tick: 3, hash: 350, physicsHash: 3500, wasRollback: true },
      ]),
      makeReport(1, [
        { tick: 1, hash: 100, physicsHash: 1000 },
        { tick: 2, hash: 250, physicsHash: 2500 },
        { tick: 3, hash: 350, physicsHash: 3500 },
      ]),
    ]);

    expect(result.firstEcsDivergenceTick).toBeNull();
    expect(result.firstPhysicsDivergenceTick).toBeNull();
  });

  it('should build checkpoint comparison at specified interval', () => {
    const timeline = Array.from({ length: 120 }, (_, i) => ({
      tick: i + 1,
      hash: (i + 1) * 10,
      physicsHash: (i + 1) * 100,
    }));

    const result = analyzeDivergence([
      makeReport(0, timeline),
      makeReport(1, timeline),
    ], 60);

    // Checkpoint at tick 60 and 120
    expect(result.checkpointComparison.length).toBe(2);
    expect(result.checkpointComparison[0].tick).toBe(60);
    expect(result.checkpointComparison[0].ecsMatch).toBe(true);
    expect(result.checkpointComparison[0].physicsMatch).toBe(true);
    expect(result.checkpointComparison[1].tick).toBe(120);
  });

  it('should detect rollback overlap windows', () => {
    const timeline = Array.from({ length: 20 }, (_, i) => ({
      tick: i + 1,
      hash: (i + 1) * 10,
      physicsHash: (i + 1) * 100,
    }));

    const result = analyzeDivergence([
      makeReport(0, timeline, [
        { atSimTick: 15, rollbackToTick: 10, timestamp: 1000 },
      ]),
      makeReport(1, timeline, [
        { atSimTick: 16, rollbackToTick: 12, timestamp: 1001 },
      ]),
    ]);

    // Overlap: client 0 resims 10-15, client 1 resims 12-16 → overlap is 12-15
    expect(result.rollbackOverlapWindows.length).toBeGreaterThan(0);
    const window = result.rollbackOverlapWindows[0];
    expect(window.startTick).toBe(12);
    expect(window.endTick).toBe(15);
    expect(window.affectedSlots).toContain(0);
    expect(window.affectedSlots).toContain(1);
  });

  it('should return no divergence for a single client', () => {
    const result = analyzeDivergence([
      makeReport(0, [
        { tick: 1, hash: 100, physicsHash: 1000 },
      ]),
    ]);

    expect(result.firstEcsDivergenceTick).toBeNull();
    expect(result.firstPhysicsDivergenceTick).toBeNull();
    expect(result.checkpointComparison).toHaveLength(0);
    expect(result.rollbackOverlapWindows).toHaveLength(0);
  });

  it('should handle clients with empty timelines', () => {
    const result = analyzeDivergence([
      makeReport(0, []),
      makeReport(1, []),
    ]);

    expect(result.firstEcsDivergenceTick).toBeNull();
    expect(result.firstPhysicsDivergenceTick).toBeNull();
    expect(result.checkpointComparison).toHaveLength(0);
    expect(result.rollbackOverlapWindows).toHaveLength(0);
  });
});
