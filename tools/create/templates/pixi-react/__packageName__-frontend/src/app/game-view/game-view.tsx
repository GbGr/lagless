import { FC, useRef } from 'react';
import { Application, extend } from '@pixi/react';
import { RunnerProvider, RunnerTicker } from './runner-provider';
import { Container, Graphics, Text } from 'pixi.js';
import { GameScene } from './game-scene';
import { GridBackground } from './grid-background';
import { DebugPanel } from '../components/debug-panel';

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
        <DebugPanel />
        <Application
          autoDensity
          resolution={devicePixelRatio || 1}
          resizeTo={containerRef}
          background={0x0a0a1a}
        >
          <RunnerTicker>
            <GridBackground />
            <GameScene />
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
