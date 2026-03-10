import { FC, useCallback, useEffect, useRef, useState } from 'react';
import type { DevPlayerState, PerformanceStatsData } from '../types';
import type { DiagnosticsReport, CombinedDiagnosticsReport } from '@lagless/desync-diagnostics';
import { analyzeDivergence } from '@lagless/desync-diagnostics';

interface DiagnosticsPanelProps {
  state: DevPlayerState;
  diagnosticsEnabled: boolean;
}

function downloadJson(data: unknown, filename: string): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type ClientCollectionStatus = 'waiting' | 'received' | 'timeout';

let nextRequestId = 0;

export const DiagnosticsPanel: FC<DiagnosticsPanelProps> = ({ state, diagnosticsEnabled }) => {
  const instances = Array.from(state.instances.values());
  const iframeRefs = useRef<Map<string, HTMLIFrameElement>>(new Map());
  const [requesting, setRequesting] = useState<Set<string>>(new Set());
  const [clientStatuses, setClientStatuses] = useState<Map<string, ClientCollectionStatus>>(new Map());
  const [collecting, setCollecting] = useState(false);

  // Collect iframe references from the DOM
  useEffect(() => {
    const iframes = document.querySelectorAll<HTMLIFrameElement>('iframe[data-instance-id]');
    const map = new Map<string, HTMLIFrameElement>();
    iframes.forEach((iframe) => {
      const id = iframe.getAttribute('data-instance-id');
      if (id) map.set(id, iframe);
    });
    iframeRefs.current = map;
  });

  const requestReport = useCallback((instanceId: string) => {
    const iframe = iframeRefs.current.get(instanceId);
    if (!iframe) {
      console.warn(`[DiagnosticsPanel] No iframe ref for instance ${instanceId}. Known refs:`, [...iframeRefs.current.keys()]);
      return;
    }
    if (!iframe.contentWindow) {
      console.warn(`[DiagnosticsPanel] iframe for ${instanceId} has no contentWindow`);
      return;
    }
    iframe.contentWindow.postMessage({ type: 'dev-bridge:request-diagnostics-report' }, '*');
    setRequesting((prev) => new Set(prev).add(instanceId));
  }, []);

  const requestAndDownload = useCallback((instanceId: string) => {
    requestReport(instanceId);
    const handler = (event: MessageEvent) => {
      const data = event.data;
      if (data?.type === 'dev-bridge:diagnostics-report' && data.instanceId === instanceId) {
        clearTimeout(timeout);
        window.removeEventListener('message', handler);
        setRequesting((prev) => {
          const next = new Set(prev);
          next.delete(instanceId);
          return next;
        });
        downloadJson(data.report, `desync-report-slot${data.report.playerSlot}-${Date.now()}.json`);
      }
    };
    window.addEventListener('message', handler);
    const timeout = setTimeout(() => {
      window.removeEventListener('message', handler);
      setRequesting((prev) => {
        const next = new Set(prev);
        next.delete(instanceId);
        return next;
      });
    }, 15000);
  }, [requestReport]);

  const downloadAll = useCallback(() => {
    const instanceIds = instances.map((inst) => inst.id);
    const requestId = ++nextRequestId;
    const collected = new Map<string, DiagnosticsReport>();
    const retryCount = new Map<string, number>();
    const MAX_RETRIES = 2;
    const RETRY_INTERVAL_MS = 10000;
    const TOTAL_TIMEOUT_MS = 30000;

    // Initialize statuses
    const initialStatuses = new Map<string, ClientCollectionStatus>();
    for (const id of instanceIds) {
      initialStatuses.set(id, 'waiting');
      retryCount.set(id, 0);
    }
    setClientStatuses(new Map(initialStatuses));

    // Request all
    for (const id of instanceIds) {
      requestReport(id);
    }

    setCollecting(true);

    const finalize = () => {
      if (requestId !== nextRequestId) return; // stale request — don't corrupt current state
      clearTimeout(totalTimeout);
      clearInterval(retryInterval);
      window.removeEventListener('message', handler);
      setRequesting(new Set());
      setCollecting(false);

      // Mark non-received as timeout
      setClientStatuses((prev) => {
        const next = new Map(prev);
        for (const id of instanceIds) {
          if (next.get(id) === 'waiting') next.set(id, 'timeout');
        }
        return next;
      });

      if (collected.size > 0) {
        const clients = instanceIds.map((id) => collected.get(id)!).filter(Boolean);
        const combined: CombinedDiagnosticsReport = {
          version: clients[0]?.version ?? 2,
          generatedAt: new Date().toISOString(),
          clients,
          divergenceAnalysis: clients.length >= 2 ? analyzeDivergence(clients) : undefined,
        };
        const suffix = collected.size === instanceIds.length ? '' : '-partial';
        downloadJson(combined, `desync-combined${suffix}-${Date.now()}.json`);
      }
    };

    const handler = (event: MessageEvent) => {
      const data = event.data;
      if (data?.type !== 'dev-bridge:diagnostics-report') return;
      if (!instanceIds.includes(data.instanceId)) {
        console.warn(`[DiagnosticsPanel] Unknown instanceId ${data.instanceId}, expected: ${instanceIds.join(', ')}`);
        return;
      }
      if (collected.has(data.instanceId)) return; // ignore duplicates

      // Verify this response belongs to our current request
      if (requestId !== nextRequestId) return;

      collected.set(data.instanceId, data.report);

      setRequesting((prev) => {
        const next = new Set(prev);
        next.delete(data.instanceId);
        return next;
      });
      setClientStatuses((prev) => {
        const next = new Map(prev);
        next.set(data.instanceId, 'received');
        return next;
      });

      if (collected.size === instanceIds.length) {
        finalize();
      }
    };
    window.addEventListener('message', handler);

    // Retry interval: re-send request to non-responding clients
    const retryInterval = setInterval(() => {
      if (requestId !== nextRequestId) {
        clearInterval(retryInterval);
        return;
      }
      for (const id of instanceIds) {
        if (collected.has(id)) continue;
        const count = retryCount.get(id) ?? 0;
        if (count < MAX_RETRIES) {
          retryCount.set(id, count + 1);
          requestReport(id);
        }
      }
    }, RETRY_INTERVAL_MS);

    // Total timeout
    const totalTimeout = setTimeout(finalize, TOTAL_TIMEOUT_MS);
  }, [instances, requestReport]);

  const hasDiagnostics = instances.some((inst) => inst.diagnosticsSummary);
  if (!hasDiagnostics) return null;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>Diagnostics</span>
        <button style={styles.btn} onClick={downloadAll} disabled={collecting || !diagnosticsEnabled}>
          {collecting ? 'Collecting...' : 'Download All'}
        </button>
      </div>

      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>#</th>
            <th style={styles.th}>Ticks</th>
            <th style={styles.th}>Rollbacks</th>
            <th style={styles.th}>Last RB</th>
            <th style={styles.th}>VT Gaps</th>
            <th style={styles.th}>ECS Hash</th>
            <th style={styles.th}>Phys Hash</th>
            <th style={styles.th}>Vel Hash</th>
            <th style={styles.th}></th>
          </tr>
        </thead>
        <tbody>
          {instances.map((inst) => {
            const d = inst.diagnosticsSummary;
            if (!d) return null;
            const isRequesting = requesting.has(inst.id);
            const collectionStatus = clientStatuses.get(inst.id);
            return (
              <tr key={inst.id}>
                <td style={styles.td}>
                  {inst.index}
                  {collectionStatus === 'received' && <span style={{ color: '#3fb950', marginLeft: 4 }}>✓</span>}
                  {collectionStatus === 'waiting' && <span style={{ color: '#d29922', marginLeft: 4 }}>⏳</span>}
                  {collectionStatus === 'timeout' && <span style={{ color: '#f85149', marginLeft: 4 }}>✗</span>}
                </td>
                <td style={styles.td}>{d.ticksRecorded}</td>
                <td style={styles.td}>{d.rollbackCount}</td>
                <td style={styles.td}>{d.lastRollbackTick || '-'}</td>
                <td style={{ ...styles.td, color: d.verifiedTickGapCount > 0 ? '#f0883e' : '#c9d1d9' }}>
                  {d.verifiedTickGapCount}
                </td>
                <td style={styles.tdMono}>{(d.latestHash >>> 0).toString(16).padStart(8, '0')}</td>
                <td style={styles.tdMono}>
                  {d.latestPhysicsHash ? (d.latestPhysicsHash >>> 0).toString(16).padStart(8, '0') : '-'}
                </td>
                <td style={styles.tdMono}>
                  {d.latestVelocityHash ? (d.latestVelocityHash >>> 0).toString(16).padStart(8, '0') : '-'}
                </td>
                <td style={styles.td}>
                  <button
                    style={styles.dlBtn}
                    onClick={() => requestAndDownload(inst.id)}
                    disabled={isRequesting || !diagnosticsEnabled}
                  >
                    {isRequesting ? '...' : 'Download'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {diagnosticsEnabled && <PerformanceSection instances={instances} />}
    </div>
  );
};

const PerformanceSection: FC<{ instances: import('../types').InstanceState[] }> = ({ instances }) => {
  const withPerf = instances.filter((inst) => inst.performanceStats);
  if (withPerf.length === 0) return null;

  return (
    <div style={{ marginTop: 8, borderTop: '1px solid #30363d', paddingTop: 6 }}>
      <span style={styles.title}>Performance</span>
      {withPerf.map((inst) => (
        <InstancePerformance key={inst.id} index={inst.index} stats={inst.performanceStats!} />
      ))}
    </div>
  );
};

function timingColor(ms: number): string {
  if (ms > 1) return '#f85149';
  if (ms > 0.5) return '#d29922';
  return '#3fb950';
}

function fmtMs(ms: number): string {
  return ms.toFixed(2) + 'ms';
}

const InstancePerformance: FC<{ index: number; stats: PerformanceStatsData }> = ({ index, stats }) => {
  const sorted = [...stats.systems].sort((a, b) => b.avg - a.avg);
  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ fontSize: 10, color: '#8b949e', marginBottom: 2 }}>Instance {index}</div>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>System</th>
            <th style={{ ...styles.th, textAlign: 'right' }}>Latest</th>
            <th style={{ ...styles.th, textAlign: 'right' }}>Min</th>
            <th style={{ ...styles.th, textAlign: 'right' }}>Max</th>
            <th style={{ ...styles.th, textAlign: 'right' }}>Avg</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((sys) => (
            <tr key={sys.name}>
              <td style={styles.td}>{sys.name}</td>
              <td style={{ ...styles.tdMono, textAlign: 'right' }}>{fmtMs(sys.latest)}</td>
              <td style={{ ...styles.tdMono, textAlign: 'right' }}>{fmtMs(sys.min)}</td>
              <td style={{ ...styles.tdMono, textAlign: 'right' }}>{fmtMs(sys.max)}</td>
              <td style={{ ...styles.tdMono, textAlign: 'right', color: timingColor(sys.avg) }}>{fmtMs(sys.avg)}</td>
            </tr>
          ))}
          {stats.snapshotTime && stats.snapshotTime.avg > 0 ? (
            <tr style={{ borderTop: '1px solid #30363d' }}>
              <td style={{ ...styles.td, color: '#8b949e' }}>Snapshot</td>
              <td style={{ ...styles.tdMono, textAlign: 'right' }}>{fmtMs(stats.snapshotTime.latest)}</td>
              <td style={{ ...styles.tdMono, textAlign: 'right' }}>{fmtMs(stats.snapshotTime.min)}</td>
              <td style={{ ...styles.tdMono, textAlign: 'right' }}>{fmtMs(stats.snapshotTime.max)}</td>
              <td style={{ ...styles.tdMono, textAlign: 'right', color: timingColor(stats.snapshotTime.avg) }}>{fmtMs(stats.snapshotTime.avg)}</td>
            </tr>
          ) : (
            <tr style={{ borderTop: '1px solid #30363d' }}>
              <td style={{ ...styles.td, color: '#8b949e' }}>Snapshot</td>
              <td style={{ ...styles.tdMono, textAlign: 'right', color: '#484f58' }} colSpan={4}>&mdash;</td>
            </tr>
          )}
          {stats.overheadTime && stats.overheadTime.avg > 0 ? (
            <tr style={{ borderTop: '1px solid #30363d' }}>
              <td style={{ ...styles.td, color: '#8b949e' }}>Overhead</td>
              <td style={{ ...styles.tdMono, textAlign: 'right' }}>{fmtMs(stats.overheadTime.latest)}</td>
              <td style={{ ...styles.tdMono, textAlign: 'right' }}>{fmtMs(stats.overheadTime.min)}</td>
              <td style={{ ...styles.tdMono, textAlign: 'right' }}>{fmtMs(stats.overheadTime.max)}</td>
              <td style={{ ...styles.tdMono, textAlign: 'right', color: timingColor(stats.overheadTime.avg) }}>{fmtMs(stats.overheadTime.avg)}</td>
            </tr>
          ) : (
            <tr style={{ borderTop: '1px solid #30363d' }}>
              <td style={{ ...styles.td, color: '#8b949e' }}>Overhead</td>
              <td style={{ ...styles.tdMono, textAlign: 'right', color: '#484f58' }} colSpan={4}>&mdash;</td>
            </tr>
          )}
          <tr style={{ borderTop: '1px solid #30363d' }}>
            <td style={{ ...styles.td, fontWeight: 600 }}>Total</td>
            <td style={{ ...styles.tdMono, textAlign: 'right', fontWeight: 600 }}>{fmtMs(stats.tickTime.latest)}</td>
            <td style={{ ...styles.tdMono, textAlign: 'right', fontWeight: 600 }}>{fmtMs(stats.tickTime.min)}</td>
            <td style={{ ...styles.tdMono, textAlign: 'right', fontWeight: 600 }}>{fmtMs(stats.tickTime.max)}</td>
            <td style={{ ...styles.tdMono, textAlign: 'right', fontWeight: 600, color: timingColor(stats.tickTime.avg) }}>{fmtMs(stats.tickTime.avg)}</td>
          </tr>
          <tr>
            <td style={{ ...styles.td, fontWeight: 600, color: '#3fb950' }}>Total (net)</td>
            <td style={{ ...styles.tdMono, textAlign: 'right', fontWeight: 600 }}>{fmtMs(Math.max(0, stats.tickTime.latest - (stats.overheadTime?.latest ?? 0)))}</td>
            <td style={{ ...styles.tdMono, textAlign: 'right', fontWeight: 600 }}>{fmtMs(Math.max(0, stats.tickTime.min - (stats.overheadTime?.min ?? 0)))}</td>
            <td style={{ ...styles.tdMono, textAlign: 'right', fontWeight: 600 }}>{fmtMs(Math.max(0, stats.tickTime.max - (stats.overheadTime?.max ?? 0)))}</td>
            <td style={{ ...styles.tdMono, textAlign: 'right', fontWeight: 600, color: '#3fb950' }}>{fmtMs(Math.max(0, stats.tickTime.avg - (stats.overheadTime?.avg ?? 0)))}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    background: '#161b22',
    borderTop: '1px solid #30363d',
    padding: 8,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  title: {
    fontSize: 10,
    color: '#8b949e',
    textTransform: 'uppercase',
    fontWeight: 600,
  },
  btn: {
    background: '#21262d',
    color: '#c9d1d9',
    border: '1px solid #30363d',
    borderRadius: 3,
    padding: '2px 8px',
    fontSize: 10,
    cursor: 'pointer',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  th: {
    textAlign: 'left',
    padding: '3px 8px',
    borderBottom: '1px solid #30363d',
    color: '#8b949e',
    fontWeight: 600,
    fontSize: 10,
    textTransform: 'uppercase',
  },
  td: { padding: '2px 8px', color: '#c9d1d9' },
  tdMono: { padding: '2px 8px', color: '#79c0ff', fontFamily: 'monospace' },
  dlBtn: {
    background: '#238636',
    color: '#fff',
    border: 'none',
    borderRadius: 3,
    padding: '1px 6px',
    fontSize: 10,
    cursor: 'pointer',
  },
};
