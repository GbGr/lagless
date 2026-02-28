import { FC, useEffect } from 'react';
import { useStartMatch } from '../hooks/use-start-match';
import { useStartMultiplayerMatch } from '../hooks/use-start-multiplayer-match';
import { DevBridge } from '@lagless/react';

export const TitleScreen: FC = () => {
  const { isBusy, startMatch } = useStartMatch();
  const { state, queuePosition, error, startMatch: startMultiplayer, cancel } = useStartMultiplayerMatch();

  // Dev-bridge: auto-match on URL param or parent command
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autoMatch') === 'true' && state === 'idle') {
      startMultiplayer();
    }
    const bridge = DevBridge.fromUrlParams();
    if (!bridge) return;
    bridge.sendMatchState(state === 'idle' ? 'idle' : state);
    return bridge.onParentMessage((msg) => {
      if (msg.type === 'dev-bridge:start-match' && state === 'idle') {
        startMultiplayer();
      }
    });
  }, [state]);

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Roblox-Like 3D Test</h1>
      <p style={styles.subtitle}>Character controller, physics, animation</p>

      <div style={styles.buttons}>
        <button style={styles.button} onClick={startMatch} disabled={isBusy}>
          Play Local
        </button>
        <button
          style={styles.button}
          onClick={state === 'queuing' ? cancel : startMultiplayer}
          disabled={state === 'connecting'}
        >
          {state === 'queuing' ? `Queuing (${queuePosition ?? '?'})... Cancel` : 'Play Online'}
        </button>
      </div>

      {error && <p style={styles.error}>{error}</p>}

      <div style={styles.controls}>
        <h3>Controls</h3>
        <p>WASD - Move | Shift - Sprint | Space - Jump | Mouse - Look</p>
        <p>F3 - Debug Panel</p>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    gap: 16,
  },
  title: { fontSize: 48, margin: 0 },
  subtitle: { fontSize: 18, color: '#888', margin: 0 },
  buttons: { display: 'flex', gap: 16, marginTop: 24 },
  button: {
    padding: '12px 32px',
    fontSize: 18,
    cursor: 'pointer',
    border: '2px solid #4a9eff',
    background: 'transparent',
    color: '#4a9eff',
    borderRadius: 8,
  },
  error: { color: '#ff4444' },
  controls: { marginTop: 32, textAlign: 'center', color: '#666' },
};
