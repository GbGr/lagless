import { FC, useMemo } from 'react';
import { FilterViews } from '@lagless/pixi-react';
import { useRunner } from './runner-provider';
import { Transform2dFilter } from '@lagless/circle-sumo-simulation';
import { Transform2dView } from './transform2d-view';
import { ImpactVfx } from './components/impact-vfx';

export const CircleSumoView: FC = () => {
  const runner = useRunner();
  const transform2dFilter = useMemo(() => {
    return runner.DIContainer.resolve(Transform2dFilter);
  }, [runner]);

  return (
    <>
      <ImpactVfx />
      <FilterViews filter={transform2dFilter} View={Transform2dView} />
    </>
  );
};
