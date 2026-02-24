import { FC, useRef } from 'react';
import { Application, extend } from '@pixi/react';
import { RunnerProvider, RunnerTicker } from './runner-provider';
import { Container, Graphics, Text } from 'pixi.js';
import { GravityPongView } from './gravity-pong-view';
import { Background } from './background';
import { HUD } from './components/hud';
import { DebugPanelWrapper } from './components/debug-panel';

extend({
  Container,
  Graphics,
  Text,
});

export const GameView: FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <RunnerProvider>
      <div style={styles.wrapper} ref={containerRef}>
        <HUD />
        <DebugPanelWrapper />
        <Application
          autoDensity
          resolution={devicePixelRatio || 1}
          resizeTo={containerRef}
          background={0x030810}
        >
          <RunnerTicker>
            <Background />
            <GravityPongView />
          </RunnerTicker>
        </Application>
      </div>
    </RunnerProvider>
  );
};

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    position: 'fixed',
  },
};
