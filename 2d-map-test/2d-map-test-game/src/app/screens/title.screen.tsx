import { FC, useEffect } from 'react';
import { useStartMatch } from '../hooks/use-start-match';
import { useStartMultiplayerMatch } from '../hooks/use-start-multiplayer-match';
import { DevBridge } from '@lagless/react';

export const TitleScreen: FC = () => {
  const { isBusy, startMatch } = useStartMatch();
  const multiplayer = useStartMultiplayerMatch();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autoMatch') === 'true' && multiplayer.state === 'idle') {
      multiplayer.startMatch();
    }
    const bridge = DevBridge.fromUrlParams();
    if (!bridge) return;
    bridge.sendMatchState(multiplayer.state === 'idle' ? 'idle' : multiplayer.state);
    return bridge.onParentMessage((msg) => {
      if (msg.type === 'dev-bridge:start-match' && multiplayer.state === 'idle') {
        multiplayer.startMatch();
      }
    });
  }, [multiplayer.state]);

  const isMultiplayerBusy = multiplayer.state !== 'idle';

  return (
    <div style={styles.screen}>
      <div style={styles.title}>2D Map Test</div>
      <div style={styles.subtitle}>Multiplayer Map Generation Testbench</div>
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
      </div>
      <div style={{ marginTop: 24 }}>
        <a href="/map-demo" style={styles.buttonPrimary}>Map Generator Demo</a>
      </div>
      <div style={styles.controls}>
        <div style={styles.controlsTitle}>Controls</div>
        <div>WASD / Arrow Keys — Move</div>
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
    background: '#000',
    fontFamily: "'Courier New', monospace",
    color: '#e0e0e0',
  },
  title: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#88aaff',
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
