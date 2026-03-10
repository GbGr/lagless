import { FC, useCallback, useRef } from 'react';
import type { DevPlayerState } from '../types';

interface IframeGridProps {
  state: DevPlayerState;
}

const BORDER_COLORS: Record<string, string> = {
  idle: '#30363d',
  queuing: '#1f6feb',
  connecting: '#1f6feb',
  playing: '#238636',
  error: '#da3633',
};

export const IframeGrid: FC<IframeGridProps> = ({ state }) => {
  const iframeRefs = useRef<Map<string, HTMLIFrameElement>>(new Map());

  const setIframeRef = useCallback((id: string, el: HTMLIFrameElement | null) => {
    if (el) iframeRefs.current.set(id, el);
    else iframeRefs.current.delete(id);
  }, []);

  const reloadInstance = useCallback((id: string) => {
    const iframe = iframeRefs.current.get(id);
    if (iframe) { const src = iframe.src; iframe.src = src; }
  }, []);

  if (!state.running) {
    return <div style={styles.empty}>Select a game and press Start</div>;
  }

  const instances = Array.from(state.instances.values());
  const cols = instances.length <= 2 ? instances.length : instances.length <= 4 ? 2 : Math.min(4, Math.ceil(Math.sqrt(instances.length)));

  return (
    <div style={{ ...styles.grid, gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {instances.map((inst) => {
        const borderColor = BORDER_COLORS[inst.matchState] || '#30363d';
        const now = Date.now();
        const stale = inst.stats && (now - inst.stats.lastUpdate > 3000);
        const src = buildIframeSrc(state.preset.gameUrl, state.preset.serverUrl, state.sessionScope, inst.id, state.diagnosticsEnabled);

        return (
          <div key={inst.id} style={{ ...styles.cell, borderColor }}>
            <div style={styles.overlay}>
              <span style={styles.badge}>
                #{inst.index} P{inst.stats?.playerSlot ?? '?'} T:{inst.stats?.tick ?? 0}
              </span>
              {stale && <span style={styles.staleBadge}>STALE</span>}
              <button style={styles.reloadBtn} onClick={() => reloadInstance(inst.id)} title="Reload">&#x21bb;</button>
            </div>
            <iframe
              ref={(el) => setIframeRef(inst.id, el)}
              src={src}
              style={styles.iframe}
              allow="autoplay"
              data-instance-id={inst.id}
            />
          </div>
        );
      })}
    </div>
  );
};

function buildIframeSrc(gameUrl: string, serverUrl: string, scope: string, instanceId: string, diagnostics: boolean): string {
  const url = new URL(gameUrl);
  url.searchParams.set('devBridge', 'true');
  url.searchParams.set('instanceId', instanceId);
  url.searchParams.set('serverUrl', serverUrl);
  url.searchParams.set('scope', scope);
  url.searchParams.set('autoMatch', 'true');
  url.searchParams.set('diagnostics', String(diagnostics));
  return url.toString();
}

const styles: Record<string, React.CSSProperties> = {
  grid: {
    display: 'grid',
    gap: 4,
    flex: 1,
    padding: 4,
    minHeight: 0,
  },
  cell: {
    position: 'relative',
    border: '2px solid #30363d',
    borderRadius: 4,
    overflow: 'hidden',
    background: '#010409',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '3px 6px',
    background: 'rgba(0,0,0,0.7)',
    zIndex: 10,
    fontSize: 11,
    fontFamily: 'monospace',
  },
  badge: { color: '#8b949e' },
  staleBadge: { color: '#f85149', fontWeight: 'bold' },
  reloadBtn: {
    marginLeft: 'auto',
    background: 'none',
    border: 'none',
    color: '#8b949e',
    cursor: 'pointer',
    fontSize: 14,
    padding: '0 4px',
  },
  iframe: {
    width: '100%',
    height: '100%',
    border: 'none',
    display: 'block',
  },
  empty: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    color: '#484f58',
    fontSize: 18,
  },
};
