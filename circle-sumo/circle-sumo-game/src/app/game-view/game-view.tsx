import './game-view.scss';
import { FC, useRef } from 'react';
import { Application, extend } from '@pixi/react';
import { RunnerProvider, RunnerTicker } from './runner-provider';
import { BitmapText, Container, Graphics, RenderLayer, Sprite } from 'pixi.js';
import { CircleSumoView } from './circle-sumo-view';
import { ViewportProvider } from './viewport-provider';
import { Viewport } from 'pixi-viewport';
import { Arena } from './components/arena';
import { StartGameCountdown } from './components/start-game-countdown';
import { PlayerWorld } from './player-world';
import { HUD } from './components/hud/hud';
import { GameOver } from './components/game-over/game-over';
import { NetDebug } from './components/net-debug/net-debug';

extend({
  Container,
  Graphics,
  Sprite,
  Viewport,
  RenderLayer,
  BitmapText,
});

export const GameView: FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <RunnerProvider>
      <div className="game-view-wrapper" ref={containerRef}>
        <HUD />
        <GameOver />
        <NetDebug />
        <Application
          autoDensity
          resolution={devicePixelRatio || 1}
          resizeTo={containerRef}
          background={0x08102e}
          onInit={(app) => {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-expect-error
            globalThis['__PIXI_APP__'] = app;
          }}
        >
          <ViewportProvider>
            <PlayerWorld>
              <Arena />
              <RunnerTicker>
                <CircleSumoView />
              </RunnerTicker>
            </PlayerWorld>
            <StartGameCountdown />
          </ViewportProvider>
        </Application>
      </div>
    </RunnerProvider>
  );
};
