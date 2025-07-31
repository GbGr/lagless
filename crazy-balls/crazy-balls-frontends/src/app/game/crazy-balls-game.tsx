import { FC, useRef } from 'react';
import { SimulationRunnerProvider } from './simulation-runner-provider';
import styled from '@emotion/styled';
import { Application, extend } from '@pixi/react';

import { Container, Graphics, Sprite } from 'pixi.js';
import { DebugRenderer } from './debug-renderer';
import { RapierInit } from './rapier-init';
import { SimulationTicker } from './simulation-ticker';

extend({
  Container,
  Graphics,
  Sprite,
});

const CrazyBallsGameViewport = styled.div`
  width: 100%;
  height: 100%;
`;

export const CrazyBallsGame: FC = () => {
  const viewportRef = useRef<HTMLDivElement>(null);

  return (
    <RapierInit>
      <CrazyBallsGameViewport ref={viewportRef}>
        <SimulationRunnerProvider>
          <Application resizeTo={viewportRef} backgroundColor={0xFFFFFF} resolution={window.devicePixelRatio}>
            <SimulationTicker />
            {/*<DebugRenderer />*/}
          </Application>
        </SimulationRunnerProvider>
      </CrazyBallsGameViewport>
    </RapierInit>
  );
};
