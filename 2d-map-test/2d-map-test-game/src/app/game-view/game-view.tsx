import { FC, useRef } from 'react';
import { Application, extend } from '@pixi/react';
import { RunnerProvider, RunnerTicker, useRunner } from './runner-provider';
import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { MapTestView } from './map-test-view';
import { ViewportProvider } from './viewport-provider';
import { DebugPanel } from './components/debug-panel';
import { MapData } from '@lagless/2d-map-test-simulation';

extend({ Container, Graphics, Sprite, Text, Viewport });

const GameContent: FC = () => {
  const runner = useRunner();
  const mapData = runner.DIContainer.resolve(MapData);

  return (
    <ViewportProvider worldWidth={mapData.map.width} worldHeight={mapData.map.height}>
      <MapTestView />
    </ViewportProvider>
  );
};

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
          background={0x2c3e50}
        >
          <RunnerTicker>
            <GameContent />
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
