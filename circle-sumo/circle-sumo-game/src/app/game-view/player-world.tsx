import { createContext, FC, ReactNode, RefObject, useContext, useMemo, useRef } from 'react';
import { useRunner } from './runner-provider';
import { PlayerResources } from '@lagless/core';
import { Container } from 'pixi.js';
import { PlayerResource } from '@lagless/circle-sumo-simulation';
import { useTick } from '@pixi/react';
import { MathOps } from '@lagless/math';

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const PlayerWorldContext = createContext<RefObject<number>>(null!);

export const usePlayerWorldRotation = () => {
  return useContext(PlayerWorldContext);
};

export const PlayerWorld: FC<{ children: ReactNode }> = ({ children }) => {
  const runner = useRunner();
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const containerRef = useRef<Container>(null!);
  const worldRotationRef = useRef(0);
  const playerResource = useMemo(() => {
    return runner.DIContainer.resolve(PlayerResources).get(PlayerResource, runner.InputProviderInstance.playerSlot);
  }, [runner]);

  useTick(() => {
    const playerWorldRotation = MathOps.PI_HALF + playerResource.safe.initialRotation;
    containerRef.current.rotation = worldRotationRef.current = playerWorldRotation;
  });

  return (
    <pixiContainer ref={containerRef}>
      <PlayerWorldContext value={worldRotationRef}>
        {children}
      </PlayerWorldContext>
    </pixiContainer>
  );
};
