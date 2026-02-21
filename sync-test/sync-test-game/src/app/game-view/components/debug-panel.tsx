import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRunner } from '../runner-provider';
import { RelayInputProvider, RelayConnection } from '@lagless/relay-client';
import { PlayerResources, ECSConfig } from '@lagless/core';
import { PlayerResource, DivergenceSignal } from '@lagless/sync-test-simulation';

interface NetStats {
  connected: boolean;
  clockReady: boolean;
  sampleCount: number;
  rttMs: number;
  jitterMs: number;
  inputDelayTicks: number;
  nudgerDebtMs: number;
  localTick: number;
  rollbackCount: number;
}

interface LogEntry {
  tick: number;
  message: string;
}

export const DebugPanel: FC = () => {
  const runner = useRunner();
  const [visible, setVisible] = useState(false);
  const [stats, setStats] = useState<NetStats | null>(null);
  const [hashTable, setHashTable] = useState<{ slot: number; hash: string; tick: number }[]>([]);
  const [eventLog, setEventLog] = useState<LogEntry[]>([]);
  const connectionRef = useRef<RelayConnection | null>(null);

  const relayProvider =
    runner.InputProviderInstance instanceof RelayInputProvider
      ? runner.InputProviderInstance
      : null;

  const _ECSConfig = useMemo(() => runner.DIContainer.resolve(ECSConfig), [runner]);
  const _PlayerResources = useMemo(() => runner.DIContainer.resolve(PlayerResources), [runner]);

  // Store connection ref for disconnect/reconnect
  useEffect(() => {
    if (relayProvider) {
      connectionRef.current = (relayProvider as unknown as { _connection?: RelayConnection })._connection ?? null;
    }
  }, [relayProvider]);

  // F3 toggle
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F3') {
        e.preventDefault();
        setVisible((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Log divergence events
  useEffect(() => {
    const signal = runner.DIContainer.resolve(DivergenceSignal);
    const unsub = signal.Predicted.subscribe((e) => {
      setEventLog((prev) => [
        { tick: e.tick, message: `DIVERGENCE: P${e.data.slotA} vs P${e.data.slotB}` },
        ...prev.slice(0, 49),
      ]);
    });
    return () => unsub();
  }, [runner]);

  const updateStats = useCallback(() => {
    if (!relayProvider) return;

    const clockSync = relayProvider.clockSync;
    const nudger = runner.Simulation.clock.phaseNudger;
    const frameLength = runner.Config.frameLength;

    setStats({
      connected: true,
      clockReady: clockSync.isReady,
      sampleCount: clockSync.sampleCount,
      rttMs: clockSync.rttEwmaMs,
      jitterMs: clockSync.jitterEwmaMs,
      inputDelayTicks: relayProvider.currentInputDelay,
      nudgerDebtMs: nudger.currentDebtMs,
      localTick: runner.Simulation.tick,
      rollbackCount: relayProvider.rollbackCount,
    });

    // Hash table
    const maxPlayers = _ECSConfig.maxPlayers;
    const table: { slot: number; hash: string; tick: number }[] = [];
    for (let i = 0; i < maxPlayers; i++) {
      const pr = _PlayerResources.get(PlayerResource, i);
      if (pr.safe.connected || pr.safe.lastReportedHashTick > 0) {
        table.push({
          slot: i,
          hash: pr.safe.lastReportedHash.toString(16).padStart(8, '0'),
          tick: pr.safe.lastReportedHashTick,
        });
      }
    }
    setHashTable(table);
  }, [relayProvider, runner, _ECSConfig, _PlayerResources]);

  useEffect(() => {
    if (!relayProvider) return;
    return runner.Simulation.addTickHandler(updateStats);
  }, [relayProvider, runner, updateStats]);

  if (!visible) return null;

  return (
    <div style={styles.panel}>
      <div style={styles.title}>DEBUG (F3)</div>

      {stats && (
        <div style={styles.section}>
          <div>
            <span style={styles.label}>CONN </span>
            {stats.clockReady ? 'ready' : `warmup (${stats.sampleCount})`}
          </div>
          <div>
            <span style={styles.label}>RTT </span>
            {stats.rttMs.toFixed(1)}ms
          </div>
          <div>
            <span style={styles.label}>JIT </span>
            {stats.jitterMs.toFixed(1)}ms
          </div>
          <div>
            <span style={styles.label}>IDLY </span>
            {stats.inputDelayTicks}t
          </div>
          <div>
            <span style={styles.label}>NUDG </span>
            {stats.nudgerDebtMs.toFixed(1)}ms
          </div>
          <div>
            <span style={styles.label}>TICK </span>
            {stats.localTick}
            <span style={styles.label}> RB </span>
            {stats.rollbackCount}
          </div>
        </div>
      )}

      {hashTable.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Hash Table</div>
          {hashTable.map((h) => (
            <div key={h.slot}>
              P{h.slot}: {h.hash} @{h.tick}
            </div>
          ))}
        </div>
      )}

      {eventLog.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Events</div>
          {eventLog.slice(0, 10).map((e, i) => (
            <div key={i} style={{ color: e.message.includes('DIVERGENCE') ? '#ff4444' : '#cccccc' }}>
              [{e.tick}] {e.message}
            </div>
          ))}
        </div>
      )}

      {relayProvider && (
        <div style={{ ...styles.section, pointerEvents: 'auto' }}>
          <button style={styles.button} onClick={() => connectionRef.current?.disconnect()}>
            Disconnect
          </button>
          <button style={styles.button} onClick={() => connectionRef.current?.connect()}>
            Reconnect
          </button>
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position: 'fixed',
    bottom: 8,
    right: 8,
    padding: '8px 10px',
    fontFamily: "'Courier New', monospace",
    fontSize: 11,
    lineHeight: '1.5',
    color: '#c8ffc8',
    background: 'rgba(0, 0, 0, 0.75)',
    borderRadius: 4,
    pointerEvents: 'none',
    userSelect: 'none',
    zIndex: 1000,
    whiteSpace: 'pre',
    maxWidth: 280,
    maxHeight: '60vh',
    overflow: 'auto',
  },
  title: {
    color: '#ffcc00',
    fontWeight: 'bold',
    marginBottom: 4,
  },
  section: {
    marginBottom: 6,
  },
  sectionTitle: {
    color: '#88aaff',
    fontWeight: 'bold',
    marginBottom: 2,
  },
  label: {
    color: '#88aaff',
  },
  button: {
    marginRight: 4,
    padding: '2px 8px',
    fontSize: 10,
    cursor: 'pointer',
    background: '#333',
    color: '#eee',
    border: '1px solid #666',
    borderRadius: 3,
  },
};
