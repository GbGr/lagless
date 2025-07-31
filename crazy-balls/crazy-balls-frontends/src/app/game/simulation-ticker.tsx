import { FC, useLayoutEffect } from 'react';
import { useTick } from '@pixi/react';
import { useSimulationRunner } from './simulation-runner-provider';

export const SimulationTicker: FC = () => {
  const { runner } = useSimulationRunner();

  useLayoutEffect(() => {
    runner.start();
  }, [runner]);

  useTick((ticker) => {
    runner.update(ticker.deltaMS);
  });

  return null;
};
