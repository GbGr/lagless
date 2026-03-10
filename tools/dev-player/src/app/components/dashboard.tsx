import { FC, useEffect, useRef } from 'react';
import type { DevPlayerState } from '../types';
import { DiagnosticsPanel } from './diagnostics-panel';

interface DashboardProps {
  state: DevPlayerState;
  diagnosticsEnabled: boolean;
}

// Ring buffer for hash timeline
const TIMELINE_SIZE = 300;
const HASH_TABLE_ROWS = 3;

interface TickHashEntry {
  tick: number;
  hashes: Map<string, number>; // instanceId → verifiedHash
}

export const Dashboard: FC<DashboardProps> = ({ state, diagnosticsEnabled }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hashBufferRef = useRef<TickHashEntry[]>([]);
  const hashScrollRef = useRef<HTMLDivElement>(null);

  // Refs to bridge current state into the rAF draw loop (avoids stale closure)
  const totalInstancesRef = useRef(0);
  const minVerifiedTickRef = useRef(0);

  const instances = Array.from(state.instances.values());

  // Update refs on every render
  const playingInstances = instances.filter((inst) => inst.stats);
  totalInstancesRef.current = state.instances.size;
  minVerifiedTickRef.current = playingInstances.length > 0
    ? Math.min(...playingInstances.map((inst) => inst.stats!.verifiedTick))
    : 0;

  // Update hash buffer from instance stats (using verified hashes for rollback-safe comparison)
  useEffect(() => {
    const buffer = hashBufferRef.current;

    for (const inst of state.instances.values()) {
      if (!inst.stats || inst.stats.verifiedHashTick == null || inst.stats.verifiedHash == null) continue;
      const tick = inst.stats.verifiedHashTick;
      let entry = buffer.find((e) => e.tick === tick);
      if (!entry) {
        entry = { tick, hashes: new Map() };
        buffer.push(entry);
        // Keep sorted and trimmed
        buffer.sort((a, b) => a.tick - b.tick);
        while (buffer.length > TIMELINE_SIZE) buffer.shift();
      }
      entry.hashes.set(inst.id, inst.stats.verifiedHash);
    }

    // Auto-scroll hash table to bottom
    if (hashScrollRef.current) {
      hashScrollRef.current.scrollTop = hashScrollRef.current.scrollHeight;
    }
  });

  // Canvas rendering via rAF
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let raf: number;

    const draw = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);

      const w = rect.width;
      const h = rect.height;
      ctx.fillStyle = '#0d1117';
      ctx.fillRect(0, 0, w, h);

      const buffer = hashBufferRef.current;
      if (buffer.length === 0) {
        raf = requestAnimationFrame(draw);
        return;
      }

      const totalInstances = totalInstancesRef.current;
      const minVerifiedTick = minVerifiedTickRef.current;
      const dotR = Math.max(1.5, Math.min(3, w / buffer.length / 2));

      for (let i = 0; i < buffer.length; i++) {
        const entry = buffer[i];
        const x = (i / Math.max(1, buffer.length - 1)) * (w - dotR * 2) + dotR;
        const y = h / 2;

        const allHashes = Array.from(entry.hashes.values());
        const complete = allHashes.length >= totalInstances;
        const verified = entry.tick <= minVerifiedTick;

        let color: string;
        if (complete && verified) {
          const allSame = allHashes.every((h) => h === allHashes[0]);
          color = allSame ? '#3fb950' : '#f85149';
        } else {
          color = '#8b949e';
        }

        ctx.beginPath();
        ctx.arc(x, y, dotR, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Hash comparison table data
  const tableEntries = hashBufferRef.current.slice(-HASH_TABLE_ROWS);
  const instanceIds = instances.map((inst) => inst.id).sort();
  const minVerifiedTick = minVerifiedTickRef.current;

  return (
    <div style={styles.container}>
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>#</th>
              <th style={styles.th}>Slot</th>
              <th style={styles.th}>Tick</th>
              <th style={styles.th}>VfTick</th>
              {diagnosticsEnabled && <th style={styles.th}>Hash</th>}
              <th style={styles.th}>FPS</th>
              <th style={styles.th}>RTT</th>
              <th style={styles.th}>Jitter</th>
              <th style={styles.th}>InpDly</th>
              <th style={styles.th}>Rollbacks</th>
              <th style={styles.th}>State</th>
            </tr>
          </thead>
          <tbody>
            {instances.map((inst) => {
              const s = inst.stats;
              return (
                <tr key={inst.id}>
                  <td style={styles.td}>{inst.index}</td>
                  <td style={styles.td}>{s?.playerSlot ?? '-'}</td>
                  <td style={styles.td}>{s?.tick ?? 0}</td>
                  <td style={styles.td}>{s?.verifiedTick ?? '-'}</td>
                  {diagnosticsEnabled && <td style={styles.tdMono}>{s ? (s.hash >>> 0).toString(16).padStart(8, '0') : '-'}</td>}
                  <td style={styles.td}>{s?.fps ?? '-'}</td>
                  <td style={styles.td}>{s ? `${s.rtt.toFixed(0)}ms` : '-'}</td>
                  <td style={styles.td}>{s ? `${s.jitter.toFixed(0)}ms` : '-'}</td>
                  <td style={styles.td}>{s?.inputDelay ?? '-'}</td>
                  <td style={styles.td}>{s?.rollbacks ?? 0}</td>
                  <td style={styles.td}>
                    <span style={{ color: inst.matchState === 'playing' ? '#3fb950' : inst.matchState === 'error' ? '#f85149' : '#8b949e' }}>
                      {inst.matchState}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {diagnosticsEnabled && tableEntries.length > 0 && (
        <div style={styles.hashTableWrap}>
          <div style={styles.hashTableTitle}>Hash Comparison</div>
          <div ref={hashScrollRef} style={styles.hashTableScroll}>
            <table style={styles.hashTable}>
              <thead>
                <tr>
                  <th style={styles.hashTh}>Tick</th>
                  {instanceIds.map((id) => {
                    const inst = state.instances.get(id);
                    return <th key={id} style={styles.hashTh}>#{inst?.index ?? '?'}</th>;
                  })}
                </tr>
              </thead>
              <tbody>
                {tableEntries.map((entry) => {
                  const allHashes = Array.from(entry.hashes.values());
                  const complete = allHashes.length >= state.instances.size;
                  const verified = entry.tick <= minVerifiedTick;
                  const allMatch = complete && allHashes.every((h) => h === allHashes[0]);

                  // Find majority hash for highlighting divergent cells
                  const hashCounts = new Map<number, number>();
                  for (const h of allHashes) {
                    hashCounts.set(h, (hashCounts.get(h) || 0) + 1);
                  }
                  let majorityHash = allHashes[0];
                  let majorityCount = 0;
                  for (const [h, c] of hashCounts) {
                    if (c > majorityCount) { majorityHash = h; majorityCount = c; }
                  }

                  return (
                    <tr key={entry.tick}>
                      <td style={styles.hashTdTick}>{entry.tick}</td>
                      {instanceIds.map((id) => {
                        const hash = entry.hashes.get(id);
                        if (hash === undefined) {
                          return <td key={id} style={styles.hashTdMissing}>--</td>;
                        }
                        const fullHex = (hash >>> 0).toString(16).padStart(8, '0');
                        const shortHex = fullHex.slice(-4);

                        let cellStyle: React.CSSProperties;
                        if (!verified || !complete) {
                          cellStyle = styles.hashTdPending;
                        } else if (allMatch) {
                          cellStyle = styles.hashTdMatch;
                        } else if (hash === majorityHash) {
                          cellStyle = styles.hashTdMatch;
                        } else {
                          cellStyle = styles.hashTdDiverge;
                        }

                        return (
                          <td key={id} style={cellStyle} title={fullHex}>
                            {shortHex}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {diagnosticsEnabled && (
        <div style={styles.timelineWrap}>
          <div style={styles.timelineTitle}>Hash Timeline</div>
          <canvas ref={canvasRef} style={styles.canvas} />
          <div style={styles.legend}>
            <span><span style={{ ...styles.dot, background: '#3fb950' }} /> Match</span>
            <span><span style={{ ...styles.dot, background: '#f85149' }} /> Diverge</span>
            <span><span style={{ ...styles.dot, background: '#8b949e' }} /> Pending</span>
          </div>
        </div>
      )}

      <DiagnosticsPanel state={state} diagnosticsEnabled={diagnosticsEnabled} />
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    background: '#161b22',
    borderTop: '1px solid #30363d',
    padding: 8,
    flexShrink: 0,
    maxHeight: '40vh',
    overflowY: 'auto',
  },
  tableWrap: { marginBottom: 8 },
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
    textTransform: 'uppercase' as const,
  },
  td: { padding: '2px 8px', color: '#c9d1d9' },
  tdMono: { padding: '2px 8px', color: '#79c0ff', fontFamily: 'monospace' },
  hashTableWrap: { marginBottom: 8 },
  hashTableTitle: {
    fontSize: 10,
    color: '#8b949e',
    textTransform: 'uppercase' as const,
    fontWeight: 600,
    marginBottom: 4,
  },
  hashTableScroll: {
    maxHeight: 160,
    overflowY: 'auto' as const,
    border: '1px solid #30363d',
    borderRadius: 3,
    background: '#0d1117',
  },
  hashTable: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: 10,
    fontFamily: 'monospace',
  },
  hashTh: {
    position: 'sticky' as const,
    top: 0,
    textAlign: 'center' as const,
    padding: '3px 6px',
    borderBottom: '1px solid #30363d',
    background: '#161b22',
    color: '#8b949e',
    fontWeight: 600,
    fontSize: 9,
    zIndex: 1,
  },
  hashTdTick: {
    padding: '1px 6px',
    color: '#8b949e',
    textAlign: 'right' as const,
    borderRight: '1px solid #21262d',
  },
  hashTdMissing: {
    padding: '1px 6px',
    color: '#484f58',
    textAlign: 'center' as const,
    background: '#0d1117',
  },
  hashTdPending: {
    padding: '1px 6px',
    color: '#8b949e',
    textAlign: 'center' as const,
    background: '#0d1117',
  },
  hashTdMatch: {
    padding: '1px 6px',
    color: '#3fb950',
    textAlign: 'center' as const,
    background: '#0d2818',
  },
  hashTdDiverge: {
    padding: '1px 6px',
    color: '#f85149',
    textAlign: 'center' as const,
    background: '#3d1117',
    fontWeight: 'bold',
  },
  timelineWrap: {},
  timelineTitle: {
    fontSize: 10,
    color: '#8b949e',
    textTransform: 'uppercase' as const,
    fontWeight: 600,
    marginBottom: 4,
  },
  canvas: { width: '100%', height: 24, display: 'block', borderRadius: 3, background: '#0d1117' },
  legend: {
    display: 'flex',
    gap: 12,
    fontSize: 10,
    color: '#8b949e',
    marginTop: 4,
    alignItems: 'center',
  },
  dot: {
    display: 'inline-block',
    width: 8,
    height: 8,
    borderRadius: '50%',
    marginRight: 3,
    verticalAlign: 'middle',
  },
};
