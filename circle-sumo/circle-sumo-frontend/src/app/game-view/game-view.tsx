import { FC, useRef } from 'react';
import { Application, extend } from '@pixi/react';
import { RunnerProvider, RunnerTicker } from './runner-provider';
import { Container, Graphics, RenderLayer, Sprite } from 'pixi.js';
import { CircleSumoView } from './circle-sumo-view';
import { InputDrainer } from './input-drainer';
import { ViewportProvider } from './viewport-provider';
import { Viewport } from 'pixi-viewport';
import { AssetsLoader } from './assets-loader';
import { Arena } from './components/arena';

extend({
  Container,
  Graphics,
  Sprite,
  Viewport,
  RenderLayer,
});

export const GameView: FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <AssetsLoader>
      <RunnerProvider>
        <div className="w-full h-full" ref={containerRef}>
          <Application
            autoDensity
            resolution={devicePixelRatio || 1}
            resizeTo={containerRef}
            background={0x3a3a3a}
            onInit={(app) => {
              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              // @ts-expect-error
              globalThis['__PIXI_APP__'] = app;
            }}
          >
            <ViewportProvider>
              <Arena />
              <RunnerTicker>
                <InputDrainer />
                <CircleSumoView />
              </RunnerTicker>
            </ViewportProvider>
          </Application>
        </div>
      </RunnerProvider>
    </AssetsLoader>
  );
};
