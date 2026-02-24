import { FC, useMemo } from 'react';
import { FilterViews } from '@lagless/pixi-react';
import { useRunner } from './runner-provider';
import { BallFilter, GravitySourceFilter, GoalFilter } from '@lagless/gravity-pong-simulation';
import { BallView } from './ball-view';
import { PlanetView } from './planet-view';
import { GoalView } from './goal-view';
import { AimView } from './aim-view';

export const GravityPongView: FC = () => {
  const runner = useRunner();

  const ballFilter = useMemo(() => runner.DIContainer.resolve(BallFilter), [runner]);
  const gravitySourceFilter = useMemo(() => runner.DIContainer.resolve(GravitySourceFilter), [runner]);
  const goalFilter = useMemo(() => runner.DIContainer.resolve(GoalFilter), [runner]);

  return (
    <>
      <FilterViews filter={goalFilter} View={GoalView} />
      <FilterViews filter={gravitySourceFilter} View={PlanetView} />
      <FilterViews filter={ballFilter} View={BallView} />
      <AimView />
    </>
  );
};
