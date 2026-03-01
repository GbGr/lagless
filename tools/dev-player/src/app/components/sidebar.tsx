import { FC, useState } from 'react';
import type { DevPlayerState } from '../types';
import { useLatencyControl } from '../hooks/use-latency-control';

interface SidebarProps {
  state: DevPlayerState;
}

export const Sidebar: FC<SidebarProps> = ({ state }) => {
  const { setGlobalLatency, setPlayerLatency, clearPlayerLatency } = useLatencyControl(state.preset.serverUrl);

  const [globalDelay, setGlobalDelay] = useState(0);
  const [globalJitter, setGlobalJitter] = useState(0);

  // Per-player: slot → delay
  const [playerDelays, setPlayerDelays] = useState<Record<number, number>>({});

  const handleGlobalApply = () => {
    setGlobalLatency(globalDelay, globalJitter, 0);
  };

  const handlePlayerApply = (slot: number, delay: number) => {
    setPlayerLatency(slot, delay, 0, 0);
  };

  const handleClearAll = () => {
    clearPlayerLatency();
    setPlayerDelays({});
  };

  const slots = Array.from(state.instances.values())
    .filter((inst) => inst.stats)
    .map((inst) => inst.stats!.playerSlot)
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort((a, b) => a - b);

  return (
    <div style={styles.sidebar}>
      <div style={styles.sectionTitle}>Global Latency</div>
      <div style={styles.row}>
        <label style={styles.sliderLabel}>Delay {globalDelay}ms</label>
        <input
          type="range"
          min={0}
          max={500}
          step={10}
          value={globalDelay}
          onChange={(e) => setGlobalDelay(Number(e.target.value))}
          style={styles.slider}
        />
      </div>
      <div style={styles.row}>
        <label style={styles.sliderLabel}>Jitter {globalJitter}ms</label>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={globalJitter}
          onChange={(e) => setGlobalJitter(Number(e.target.value))}
          style={styles.slider}
        />
      </div>
      <button style={styles.applyBtn} onClick={handleGlobalApply}>Apply Global</button>

      {slots.length > 0 && (
        <>
          <div style={{ ...styles.sectionTitle, marginTop: 16 }}>Per-Player Latency</div>
          {slots.map((slot) => (
            <div key={slot} style={styles.row}>
              <label style={styles.sliderLabel}>P{slot}: {playerDelays[slot] ?? 0}ms</label>
              <input
                type="range"
                min={0}
                max={500}
                step={10}
                value={playerDelays[slot] ?? 0}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setPlayerDelays((prev) => ({ ...prev, [slot]: v }));
                  handlePlayerApply(slot, v);
                }}
                style={styles.slider}
              />
            </div>
          ))}
          <button style={styles.clearBtn} onClick={handleClearAll}>Clear Per-Player</button>
        </>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    width: 220,
    background: '#161b22',
    borderLeft: '1px solid #30363d',
    padding: 12,
    flexShrink: 0,
    overflowY: 'auto',
    fontSize: 12,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 600,
    color: '#8b949e',
    textTransform: 'uppercase' as const,
    marginBottom: 8,
  },
  row: { marginBottom: 8 },
  sliderLabel: { display: 'block', color: '#c9d1d9', marginBottom: 2 },
  slider: { width: '100%', accentColor: '#58a6ff' },
  applyBtn: {
    width: '100%',
    background: '#21262d',
    color: '#c9d1d9',
    border: '1px solid #30363d',
    borderRadius: 4,
    padding: '4px 0',
    fontSize: 11,
    cursor: 'pointer',
  },
  clearBtn: {
    width: '100%',
    background: '#21262d',
    color: '#f85149',
    border: '1px solid #30363d',
    borderRadius: 4,
    padding: '4px 0',
    fontSize: 11,
    cursor: 'pointer',
    marginTop: 8,
  },
};
