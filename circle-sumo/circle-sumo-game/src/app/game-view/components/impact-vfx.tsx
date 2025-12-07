import { FC, useEffect, useMemo } from 'react';
import { useRunner } from '../runner-provider';
import { HighImpactSignal } from '@lagless/circle-sumo-simulation';
import { useVFXContainer } from '@lagless/pixi-react';

export const ImpactVfx: FC = () => {
  const runner = useRunner();
  const { containerRef, spawn } = useVFXContainer();
  const _HighImpactSignal = useMemo(() => runner.DIContainer.resolve(HighImpactSignal), [runner]);

  useEffect(() => {
    return _HighImpactSignal.Predicted.subscribe(({ data }) => {
      if (data.power < 0.5) return;

      spawn('TrianglesImpact', [data.x, -data.y, 0], {
        scale: data.power,
        duration: 350,
      });
    });
  }, [_HighImpactSignal, spawn]);

  return (
    <pixiContainer ref={containerRef} />
  );
};
