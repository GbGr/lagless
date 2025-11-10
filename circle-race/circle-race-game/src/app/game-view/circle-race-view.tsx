import { FC, useMemo } from 'react';
import { FilterViews } from './filter-views';
import { useRunner } from './runner-provider';
import { Transform2dFilter } from '@lagless/circle-race-simulation';
import { Transform2dView } from './transform2d-view';

export const CircleRaceView: FC = () => {
  const runner = useRunner();
  const transform2dFilter = useMemo(() => {
    return runner.DIContainer.resolve(Transform2dFilter);
  }, [runner]);

  return (
    <>
      <FilterViews filter={transform2dFilter} View={Transform2dView} />
    </>
  );
};
