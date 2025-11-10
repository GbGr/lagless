import { FC, useRef } from 'react';
import { Application, extend } from '@pixi/react';
import { RunnerProvider, RunnerTicker } from './runner-provider';
import { Container, Graphics, Sprite } from 'pixi.js';
import { CircleRaceView } from './circle-race-view';
import { VirtualJoystickProvider } from '@lagless/pixi-react';
import { InputDrainer } from './input-drainer';
import { ViewportProvider } from './viewport-provider';
import { Viewport } from 'pixi-viewport';
import { TerrainView } from './terrain/terrain-view';

extend({
  Container,
  Graphics,
  Sprite,
  Viewport,
});

export const GameView: FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <RunnerProvider>
      <div className="w-full h-full" ref={containerRef}>
        <Application resolution={devicePixelRatio || 1} resizeTo={containerRef} backgroundAlpha={0}>
          <VirtualJoystickProvider>
            <ViewportProvider>
              <TerrainView />
              <RunnerTicker>
                <InputDrainer />
                <CircleRaceView />
              </RunnerTicker>
            </ViewportProvider>
          </VirtualJoystickProvider>
        </Application>
      </div>
    </RunnerProvider>
  );
};
