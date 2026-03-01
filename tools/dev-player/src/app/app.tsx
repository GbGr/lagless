import { FC, useEffect, useReducer } from 'react';
import { createInitialState, reducer } from './store';
import { useBridgeMessages } from './hooks/use-bridge-messages';
import { useLocalStorage } from './hooks/use-local-storage';
import { TopBar } from './components/top-bar';
import { IframeGrid } from './components/iframe-grid';
import { Sidebar } from './components/sidebar';
import { Dashboard } from './components/dashboard';
import type { GamePreset } from './types';
import { PRESETS } from './types';

export const App: FC = () => {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState);
  const { loadLastConfig } = useLocalStorage();

  // Restore last config on mount
  useEffect(() => {
    const last = loadLastConfig();
    if (last) {
      const preset = PRESETS.find((p) => p.label === last.preset.label) || last.preset;
      dispatch({ type: 'SET_PRESET', preset });
      dispatch({ type: 'SET_COUNT', count: last.instanceCount });
    }
  }, [loadLastConfig]);

  useBridgeMessages(state.running, dispatch);

  // Periodic tick for staleness detection
  useEffect(() => {
    if (!state.running) return;
    const timer = setInterval(() => dispatch({ type: 'TICK' }), 1000);
    return () => clearInterval(timer);
  }, [state.running]);

  return (
    <div style={styles.layout}>
      <TopBar
        state={state}
        onPresetChange={(preset: GamePreset) => dispatch({ type: 'SET_PRESET', preset })}
        onCountChange={(count: number) => dispatch({ type: 'SET_COUNT', count })}
        onStart={() => dispatch({ type: 'START' })}
        onStop={() => dispatch({ type: 'STOP' })}
      />
      <div style={styles.main}>
        <div style={styles.center}>
          <IframeGrid state={state} />
          <Dashboard state={state} />
        </div>
        {state.running && <Sidebar state={state} />}
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  layout: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    overflow: 'hidden',
  },
  main: {
    display: 'flex',
    flex: 1,
    minHeight: 0,
  },
  center: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minWidth: 0,
  },
};
