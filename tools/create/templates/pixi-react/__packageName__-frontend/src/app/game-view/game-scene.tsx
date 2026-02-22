import { FC, useMemo } from 'react';
import { FilterViews } from '@lagless/pixi-react';
import { useRunner } from './runner-provider';
import { PlayerFilter } from '<%= packageName %>-simulation';
import { PlayerView } from './player-view';

export const GameScene: FC = () => {
  const runner = useRunner();
  const playerFilter = useMemo(() => runner.DIContainer.resolve(PlayerFilter), [runner]);

  return (
    <FilterViews filter={playerFilter} View={PlayerView} />
  );
};
