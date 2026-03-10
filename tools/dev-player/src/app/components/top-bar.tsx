import { FC, useState } from 'react';
import type { DevPlayerState, GamePreset } from '../types';
import { PRESETS } from '../types';
import { useLocalStorage } from '../hooks/use-local-storage';

interface TopBarProps {
  state: DevPlayerState;
  onPresetChange: (preset: GamePreset) => void;
  onCountChange: (count: number) => void;
  onDiagnosticsToggle: (enabled: boolean) => void;
  onStart: () => void;
  onStop: () => void;
}

export const TopBar: FC<TopBarProps> = ({ state, onPresetChange, onCountChange, onDiagnosticsToggle, onStart, onStop }) => {
  const { savedPresets, savePreset, loadPreset, deletePreset, saveLastConfig } = useLocalStorage();
  const [presetName, setPresetName] = useState('');

  const handleSave = () => {
    if (!presetName.trim()) return;
    savePreset(presetName.trim(), state.preset, state.instanceCount);
    setPresetName('');
  };

  const handleLoad = (name: string) => {
    const config = loadPreset(name);
    if (config) {
      onPresetChange(config.preset);
      onCountChange(config.instanceCount);
    }
  };

  const handleStart = () => {
    saveLastConfig(state.preset, state.instanceCount);
    onStart();
  };

  return (
    <div style={styles.bar}>
      <div style={styles.section}>
        <label style={styles.label}>Game</label>
        <select
          style={styles.select}
          value={state.preset.label}
          onChange={(e) => {
            const p = PRESETS.find((p) => p.label === e.target.value);
            if (p) onPresetChange(p);
          }}
          disabled={state.running}
        >
          {PRESETS.map((p) => (
            <option key={p.label} value={p.label}>{p.label}</option>
          ))}
        </select>
      </div>

      <div style={styles.section}>
        <label style={styles.label}>Instances</label>
        <input
          type="number"
          min={1}
          max={8}
          value={state.instanceCount}
          onChange={(e) => onCountChange(Number(e.target.value))}
          style={styles.numberInput}
          disabled={state.running}
        />
      </div>

      <div style={styles.section}>
        <label style={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={state.diagnosticsEnabled}
            onChange={(e) => onDiagnosticsToggle(e.target.checked)}
            style={styles.checkbox}
          />
          Diagnostics
        </label>
      </div>

      <div style={styles.section}>
        {!state.running ? (
          <button style={styles.startBtn} onClick={handleStart}>Start</button>
        ) : (
          <button style={styles.stopBtn} onClick={onStop}>Stop</button>
        )}
      </div>

      <div style={{ ...styles.section, marginLeft: 'auto' }}>
        <input
          style={styles.presetInput}
          placeholder="Preset name"
          value={presetName}
          onChange={(e) => setPresetName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
        />
        <button style={styles.smallBtn} onClick={handleSave} disabled={!presetName.trim()}>Save</button>
        {savedPresets.map((p) => (
          <span key={p.name} style={styles.presetTag}>
            <button style={styles.presetLoadBtn} onClick={() => handleLoad(p.name)}>{p.name}</button>
            <button style={styles.presetDeleteBtn} onClick={() => deletePreset(p.name)}>&times;</button>
          </span>
        ))}
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '8px 16px',
    background: '#161b22',
    borderBottom: '1px solid #30363d',
    flexShrink: 0,
  },
  section: { display: 'flex', alignItems: 'center', gap: 6 },
  label: { fontSize: 12, color: '#8b949e', textTransform: 'uppercase' as const },
  select: {
    background: '#21262d',
    color: '#c9d1d9',
    border: '1px solid #30363d',
    borderRadius: 4,
    padding: '4px 8px',
    fontSize: 13,
  },
  numberInput: {
    width: 50,
    background: '#21262d',
    color: '#c9d1d9',
    border: '1px solid #30363d',
    borderRadius: 4,
    padding: '4px 8px',
    fontSize: 13,
    textAlign: 'center' as const,
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 12,
    color: '#8b949e',
    cursor: 'pointer',
    userSelect: 'none' as const,
  },
  checkbox: {
    accentColor: '#238636',
    cursor: 'pointer',
  },
  startBtn: {
    background: '#238636',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    padding: '6px 20px',
    fontSize: 13,
    cursor: 'pointer',
    fontWeight: 600,
  },
  stopBtn: {
    background: '#da3633',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    padding: '6px 20px',
    fontSize: 13,
    cursor: 'pointer',
    fontWeight: 600,
  },
  presetInput: {
    background: '#21262d',
    color: '#c9d1d9',
    border: '1px solid #30363d',
    borderRadius: 4,
    padding: '4px 8px',
    fontSize: 12,
    width: 100,
  },
  smallBtn: {
    background: '#30363d',
    color: '#c9d1d9',
    border: '1px solid #30363d',
    borderRadius: 4,
    padding: '3px 10px',
    fontSize: 11,
    cursor: 'pointer',
  },
  presetTag: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 0,
    background: '#21262d',
    borderRadius: 4,
    border: '1px solid #30363d',
    overflow: 'hidden',
  },
  presetLoadBtn: {
    background: 'none',
    color: '#58a6ff',
    border: 'none',
    padding: '2px 8px',
    fontSize: 11,
    cursor: 'pointer',
  },
  presetDeleteBtn: {
    background: 'none',
    color: '#8b949e',
    border: 'none',
    borderLeft: '1px solid #30363d',
    padding: '2px 6px',
    fontSize: 13,
    cursor: 'pointer',
  },
};
