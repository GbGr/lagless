import { FC, useEffect, useState } from 'react';
import { useNetStats } from './use-net-stats.js';
import { panelStyles as styles } from './styles.js';
import type { DebugPanelProps, LogEntry } from './types.js';

export const DebugPanel: FC<DebugPanelProps> = ({
  runner,
  toggleKey = 'F3',
  onDivergence,
  showConnectionControls = true,
  children,
}) => {
  const [visible, setVisible] = useState(false);
  const [eventLog, setEventLog] = useState<LogEntry[]>([]);

  const { stats, relayProvider } = useNetStats(runner);

  // Toggle visibility
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === toggleKey) {
        e.preventDefault();
        setVisible((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleKey]);

  // Log divergence events
  useEffect(() => {
    if (!onDivergence) return;

    return onDivergence((data) => {
      setEventLog((prev) => [
        { tick: data.atTick, message: `DIVERGENCE: P${data.slotA} (0x${data.hashA.toString(16)}) vs P${data.slotB} (0x${data.hashB.toString(16)})` },
        ...prev.slice(0, 49),
      ]);
    });
  }, [onDivergence]);

  if (!visible) return null;

  return (
    <div style={styles.panel}>
      <div style={styles.title}>DEBUG ({toggleKey})</div>

      {relayProvider && (
        <div style={styles.section}>
          <div>
            <span style={styles.label}>CONN </span>
            {stats.clockReady ? 'ready' : `warmup (${stats.sampleCount})`}
          </div>
          <div>
            <span style={styles.label}>RTT  </span>
            {stats.rttMs.toFixed(1)}ms ({stats.sampleCount})
          </div>
          <div>
            <span style={styles.label}>JIT  </span>
            {stats.jitterMs.toFixed(1)}ms
          </div>
          <div>
            <span style={styles.label}>IDLY </span>
            {stats.inputDelayTicks}t / {stats.inputDelayMs.toFixed(0)}ms
          </div>
          <div>
            <span style={styles.label}>NUDG </span>
            {stats.nudgerActive ? `${stats.nudgerDebtMs.toFixed(1)}ms` : 'off'}
          </div>
          <div>
            <span style={styles.label}>TICK </span>
            {stats.localTick}
            <span style={styles.label}> RB </span>
            {stats.rollbackCount}
          </div>
          <div>
            <span style={styles.label}>FPS  </span>
            {stats.fps.toFixed(0)}
          </div>
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

      {showConnectionControls && relayProvider && (
        <div style={{ ...styles.section, pointerEvents: 'auto' }}>
          <button style={styles.button} onClick={() => relayProvider.connection?.disconnect()}>
            Disconnect
          </button>
          <button style={styles.button} onClick={() => relayProvider.connection?.connect()}>
            Reconnect
          </button>
        </div>
      )}

      {children}
    </div>
  );
};
