export { DiagnosticsCollector } from './lib/diagnostics-collector.js';
export { hashBytes } from './lib/hash-bytes.js';
export { analyzeDivergence } from './lib/divergence-analysis.js';
export type { DivergenceAnalysis, CheckpointComparison, RollbackOverlapWindow } from './lib/divergence-analysis.js';
export { attachDesyncDiagnostics } from './lib/attach.js';
export { generateReport } from './lib/report-generator.js';
export type { DiagnosticsConfig, TickRecord, RollbackEvent, DiagnosticsStats } from './lib/types.js';
export type {
  DiagnosticsReport,
  CombinedDiagnosticsReport,
  DiagnosticsReportConfig,
  DiagnosticsReportSummary,
  DiagnosticsReportTickRecord,
  DiagnosticsReportRPC,
} from './lib/report-generator.js';
export { useDesyncDiagnostics, type UseDesyncDiagnosticsOptions } from './lib/use-desync-diagnostics.js';
export { PerformanceProfiler } from './lib/performance-profiler.js';
export type { PerformanceStats, SystemTimingStats, TimingStats } from './lib/performance-profiler.js';
export type {
  DiagnosticsSummaryMessage,
  DiagnosticsReportMessage,
  PerformanceStatsMessage,
  DiagnosticsChildMessage,
  RequestDiagnosticsReportMessage,
  DiagnosticsParentMessage,
} from './lib/diagnostics-protocol.js';
