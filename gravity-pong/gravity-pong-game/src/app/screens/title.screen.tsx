import { FC } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStartMatch, ProviderStore } from '../hooks/use-start-match';
import { useStartMultiplayerMatch } from '../hooks/use-start-multiplayer-match';
import { ReplayInputProvider } from '@lagless/core';
import { GravityPongInputRegistry } from '@lagless/gravity-pong-simulation';
import { useRef } from 'react';

export const TitleScreen: FC = () => {
  const { isBusy, startMatch } = useStartMatch();
  const multiplayer = useStartMultiplayerMatch();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isMultiplayerBusy = multiplayer.state !== 'idle';

  const handleReplayFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const buffer = await file.arrayBuffer();
    const provider = ReplayInputProvider.createFromReplay(buffer, GravityPongInputRegistry);
    ProviderStore.set(provider);
    navigate('/game');
  };

  return (
    <div style={styles.screen}>
      <div style={styles.title}>Gravity Pong</div>
      <div style={styles.subtitle}>Physics-based multiplayer pong</div>
      <div style={styles.actions}>
        <button style={styles.button} onClick={startMatch} disabled={isMultiplayerBusy || isBusy}>
          {isBusy ? 'Starting...' : 'Play Local'}
        </button>
        <button
          style={styles.buttonPrimary}
          onClick={isMultiplayerBusy ? multiplayer.cancel : multiplayer.startMatch}
          disabled={isBusy}
        >
          {multiplayer.state === 'queuing' && `In Queue${multiplayer.queuePosition ? ` #${multiplayer.queuePosition}` : ''}...`}
          {multiplayer.state === 'connecting' && 'Connecting...'}
          {multiplayer.state === 'error' && `Error: ${multiplayer.error}`}
          {multiplayer.state === 'idle' && 'Play Online'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".replay"
          style={{ display: 'none' }}
          onChange={handleReplayFile}
        />
        <button
          style={styles.button}
          onClick={() => fileInputRef.current?.click()}
          disabled={isMultiplayerBusy || isBusy}
        >
          Watch Replay
        </button>
      </div>
      <div style={styles.controls}>
        <div style={styles.controlsTitle}>Controls</div>
        <div>Click & Drag — Aim and shoot</div>
        <div>F3 — Debug Panel</div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  screen: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#030810',
    fontFamily: "'Courier New', monospace",
    color: '#e0e0e0',
  },
  title: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#ff8844',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 48,
  },
  actions: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    alignItems: 'center',
  },
  button: {
    padding: '12px 32px',
    fontSize: 18,
    cursor: 'pointer',
    background: '#222',
    color: '#e0e0e0',
    border: '2px solid #555',
    borderRadius: 6,
    fontFamily: "'Courier New', monospace",
    minWidth: 220,
  },
  buttonPrimary: {
    padding: '12px 32px',
    fontSize: 18,
    cursor: 'pointer',
    background: '#1a3a6a',
    color: '#88aaff',
    border: '2px solid #4488ff',
    borderRadius: 6,
    fontFamily: "'Courier New', monospace",
    minWidth: 220,
  },
  controls: {
    marginTop: 48,
    textAlign: 'center' as const,
    color: '#555',
    fontSize: 13,
  },
  controlsTitle: {
    color: '#888',
    fontWeight: 'bold',
    marginBottom: 4,
  },
};
