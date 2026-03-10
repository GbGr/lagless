import { useEffect, useRef } from 'react';
import type { ECSRunner } from '@lagless/core';
import { DevBridge } from '@lagless/react';
import { attachDesyncDiagnostics } from './attach.js';
import { generateReport } from './report-generator.js';
import { PerformanceProfiler } from './performance-profiler.js';
import type { DiagnosticsCollector } from './diagnostics-collector.js';
import type { DiagnosticsSummaryMessage, DiagnosticsReportMessage, PerformanceStatsMessage, RequestDiagnosticsReportMessage } from './diagnostics-protocol.js';

const SUMMARY_EVERY_N_TICKS = 30;

export interface UseDesyncDiagnosticsOptions {
  physicsHashFn?: () => number;
  velocityHashFn?: () => number;
  /** When false, don't create collector or stream diagnostics. Defaults to true. */
  enabled?: boolean;
}

export function useDesyncDiagnostics(
  runner: ECSRunner | null,
  options?: UseDesyncDiagnosticsOptions,
): void {
  const collectorRef = useRef<DiagnosticsCollector | null>(null);
  const tickCountRef = useRef(0);
  const physicsHashFnRef = useRef(options?.physicsHashFn);
  physicsHashFnRef.current = options?.physicsHashFn;
  const velocityHashFnRef = useRef(options?.velocityHashFn);
  velocityHashFnRef.current = options?.velocityHashFn;
  const enabled = options?.enabled ?? true;

  useEffect(() => {
    if (!runner || !DevBridge.isActive() || !enabled) return;

    const bridgeParams = DevBridge.getUrlParams();
    const instanceId = bridgeParams?.instanceId || '0';
    const collector = attachDesyncDiagnostics(runner, {
      physicsHashFn: () => physicsHashFnRef.current?.() ?? 0,
      velocityHashFn: () => velocityHashFnRef.current?.() ?? 0,
    });
    collectorRef.current = collector;

    // Attach performance profiler
    const profiler = new PerformanceProfiler();
    profiler.attach(runner);

    // Stream summaries every N ticks
    const removeTickHandler = runner.Simulation.addTickHandler(() => {
      tickCountRef.current++;
      if (tickCountRef.current % SUMMARY_EVERY_N_TICKS !== 0) return;

      const stats = collector.getStats();
      const msg: DiagnosticsSummaryMessage = {
        type: 'dev-bridge:diagnostics-summary',
        instanceId,
        rollbackCount: stats.totalRollbacks,
        lastRollbackTick: stats.lastRollbackTick,
        verifiedTickGapCount: stats.verifiedTickGapCount,
        ticksRecorded: stats.ticksRecorded,
        latestHash: stats.latestHash,
        latestPhysicsHash: stats.latestPhysicsHash,
        latestVelocityHash: stats.latestVelocityHash,
      };
      window.parent.postMessage(msg, '*');

      // Stream performance stats
      const perfStats = profiler.getStats();
      const perfMsg: PerformanceStatsMessage = {
        type: 'dev-bridge:performance-stats',
        instanceId,
        tickTime: perfStats.tickTime,
        snapshotTime: perfStats.snapshotTime,
        overheadTime: perfStats.overheadTime,
        systems: perfStats.systems,
      };
      window.parent.postMessage(perfMsg, '*');
    });

    // Listen for report requests from dev-player
    const onMessage = (event: MessageEvent) => {
      const data = event.data;
      if (data && data.type === ('dev-bridge:request-diagnostics-report' satisfies RequestDiagnosticsReportMessage['type'])) {
        const report = generateReport(collector);
        const msg: DiagnosticsReportMessage = {
          type: 'dev-bridge:diagnostics-report',
          instanceId,
          report,
        };
        window.parent.postMessage(msg, '*');
      }
    };
    window.addEventListener('message', onMessage);

    return () => {
      removeTickHandler();
      window.removeEventListener('message', onMessage);
      profiler.dispose();
      collector.dispose();
      collectorRef.current = null;
    };
  }, [runner, enabled]);
}
