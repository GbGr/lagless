import type { DiagnosticsCollector } from './diagnostics-collector.js';

const REPORT_VERSION = 2;

export interface DiagnosticsReportConfig {
  fps: number;
  maxPlayers: number;
  frameLength: number;
  snapshotRate: number;
  maxEntities: number;
}

export interface DiagnosticsReportSummary {
  totalTicks: number;
  totalRollbacks: number;
  firstDivergenceTick: number | null;
  verifiedTickGapCount: number;
  latestPhysicsHash: number;
  oldestTick: number;
  newestTick: number;
}

export interface DiagnosticsReportTickRecord {
  tick: number;
  hash: number;
  physicsHash: number;
  velocityHash: number;
  verifiedTick: number;
  wasRollback: boolean;
  inputCountBySlot: number[];
}

export interface DiagnosticsReportRPC {
  inputId: number;
  seq: number;
  playerSlot: number;
  ordinal: number;
  data: unknown;
}

export interface DiagnosticsReport {
  version: number;
  generatedAt: string;
  playerSlot: number;
  config: DiagnosticsReportConfig;
  summary: DiagnosticsReportSummary;
  timeline: DiagnosticsReportTickRecord[];
  rollbacks: Array<{ atSimTick: number; rollbackToTick: number; timestamp: number }>;
  inputHistory: Record<string, DiagnosticsReportRPC[]>;
}

export interface CombinedDiagnosticsReport {
  version: number;
  generatedAt: string;
  clients: DiagnosticsReport[];
  divergenceAnalysis?: import('./divergence-analysis.js').DivergenceAnalysis;
}

export function generateReport(collector: DiagnosticsCollector): DiagnosticsReport {
  const runner = collector.runner;
  const config = runner.Config;
  const provider = runner.InputProviderInstance;
  const stats = collector.getStats();
  const timeline = collector.getTimeline();
  const rollbacks = collector.getRollbacks();

  // Build input history for ticks in the timeline
  const inputHistory: Record<string, DiagnosticsReportRPC[]> = {};
  for (const record of timeline) {
    const rpcs = provider.rpcHistory.getRPCsAtTick(record.tick);
    if (rpcs.length > 0) {
      inputHistory[String(record.tick)] = rpcs.map((rpc) => ({
        inputId: rpc.inputId,
        seq: rpc.meta.seq,
        playerSlot: rpc.meta.playerSlot,
        ordinal: rpc.meta.ordinal,
        data: rpc.data,
      }));
    }
  }

  // Convert timeline to JSON-safe format (Uint8Array → number[])
  const timelineRecords: DiagnosticsReportTickRecord[] = timeline.map((r) => ({
    tick: r.tick,
    hash: r.hash,
    physicsHash: r.physicsHash,
    velocityHash: r.velocityHash,
    verifiedTick: r.verifiedTick,
    wasRollback: r.wasRollback,
    inputCountBySlot: Array.from(r.inputCountBySlot),
  }));

  return {
    version: REPORT_VERSION,
    generatedAt: new Date().toISOString(),
    playerSlot: provider.playerSlot,
    config: {
      fps: config.fps,
      maxPlayers: config.maxPlayers,
      frameLength: config.frameLength,
      snapshotRate: config.snapshotRate,
      maxEntities: config.maxEntities,
    },
    summary: {
      totalTicks: stats.ticksRecorded,
      totalRollbacks: stats.totalRollbacks,
      firstDivergenceTick: null, // TODO: detect from hash comparison if available
      verifiedTickGapCount: stats.verifiedTickGapCount,
      latestPhysicsHash: stats.latestPhysicsHash,
      oldestTick: stats.oldestTick,
      newestTick: stats.newestTick,
    },
    timeline: timelineRecords,
    rollbacks: [...rollbacks],
    inputHistory,
  };
}
