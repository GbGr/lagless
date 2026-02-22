import { FC, useMemo } from 'react';
import { FilterViews } from '@lagless/pixi-react';
import { useRunner } from './runner-provider';
import { PlayerFilter, CollectibleFilter } from '@lagless/sync-test-simulation';
import { PlayerView } from './player-view';
import { CollectibleView } from './collectible-view';

export const SyncTestView: FC = () => {
  const runner = useRunner();

  const playerFilter = useMemo(() => {
    return runner.DIContainer.resolve(PlayerFilter);
  }, [runner]);

  const collectibleFilter = useMemo(() => {
    return runner.DIContainer.resolve(CollectibleFilter);
  }, [runner]);

  return (
    <>
      <FilterViews filter={collectibleFilter} View={CollectibleView} />
      <FilterViews filter={playerFilter} View={PlayerView} />
    </>
  );
};
