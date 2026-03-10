import type { DiagnosticsReport } from './report-generator.js';

// ─── Child → Parent (game iframe → dev-player) ──────────────

export interface DiagnosticsSummaryMessage {
  type: 'dev-bridge:diagnostics-summary';
  instanceId: string;
  rollbackCount: number;
  lastRollbackTick: number;
  verifiedTickGapCount: number;
  ticksRecorded: number;
  latestHash: number;
  latestPhysicsHash: number;
  latestVelocityHash: number;
}

export interface DiagnosticsReportMessage {
  type: 'dev-bridge:diagnostics-report';
  instanceId: string;
  report: DiagnosticsReport;
}

export interface PerformanceStatsMessage {
  type: 'dev-bridge:performance-stats';
  instanceId: string;
  tickTime: { latest: number; min: number; max: number; avg: number };
  snapshotTime: { latest: number; min: number; max: number; avg: number };
  overheadTime: { latest: number; min: number; max: number; avg: number };
  systems: Array<{ name: string; latest: number; min: number; max: number; avg: number }>;
}

export type DiagnosticsChildMessage =
  | DiagnosticsSummaryMessage
  | DiagnosticsReportMessage
  | PerformanceStatsMessage;

// ─── Parent → Child (dev-player → game iframe) ──────────────

export interface RequestDiagnosticsReportMessage {
  type: 'dev-bridge:request-diagnostics-report';
}

export type DiagnosticsParentMessage =
  | RequestDiagnosticsReportMessage;
