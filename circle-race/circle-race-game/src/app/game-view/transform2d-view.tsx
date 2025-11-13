import { Container, Graphics } from 'pixi.js';
import { PlayerResources } from '@lagless/core';
import { animatePromise } from '@lagless/animate';
import { interpolateTransform2dCursorToRef } from '@lagless/misc';
import { useCallback, useImperativeHandle, useMemo, useRef } from 'react';
import { PlayerResource, Transform2d } from '@lagless/circle-race-simulation';
import { useRunner } from './runner-provider';
import { useViewport } from './viewport-provider';
import { filterView, FilterView } from './filter-views';

export const Transform2dView: FilterView = filterView(({ entity }, ref) => {
  const runner = useRunner();
  const viewport = useViewport();
  const playerResource = useMemo(() => {
    return runner.DIContainer
      .resolve(PlayerResources)
      .get(PlayerResource, runner.InputProviderInstance.playerSlot);
  }, [runner]);
  const transform2d = useMemo(() => runner.DIContainer.resolve(Transform2d), [runner]);
  const simulation = useMemo(() => runner.Simulation, [runner]);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const containerRef = useRef<Container>(null!);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const circleInRef = useRef<Graphics>(null!);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const circleRef = useRef<Graphics>(null!);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const circleOutRef = useRef<Graphics>(null!);

  useImperativeHandle(
    ref,
    () => {
      return {
        onCreate() {
          const t2d = transform2d.getCursor(entity);
          interpolateTransform2dCursorToRef(t2d, simulation.interpolationFactor, containerRef.current);

          if (playerResource.safe.entity === entity) {
            viewport.follow(containerRef.current);
          }

          animatePromise((x) => {
            circleInRef.current.alpha = x;
            circleInRef.current.scale.set((1 - x) * 2);
          }, 300)
            .then(() => circleRef.current.alpha = 1);
        },
        onUpdate() {
          const t2d = transform2d.getCursor(entity);
          interpolateTransform2dCursorToRef(t2d, simulation.interpolationFactor, containerRef.current);
        },
        async onDestroy() {
          console.log('onDestroy', entity);
          circleOutRef.current.alpha = 1;
          circleOutRef.current.scale.set(0);
          await animatePromise((x) => {
            circleRef.current.alpha = 1 - x;
            circleOutRef.current.scale.set(x);
          }, 1_000);
        },
      };
    },
    [entity, playerResource.safe.entity, simulation.interpolationFactor, transform2d, viewport]
  );

  const drawCircle = useCallback((g: Graphics) => {
    g.clear();
    g.circle(0, 0, 20);
    g.fill(0xff0000);
  }, []);

  const drawCircleIn = useCallback((g: Graphics) => {
    g.clear();
    g.circle(0, 0, 300);
    g.fill(0xff0000);
  }, []);

  const drawCircleOut = useCallback((g: Graphics) => {
    g.clear();
    g.circle(0, 0, 300);
    g.fill(0xff0000);
  }, []);

  return (
    <pixiContainer ref={containerRef}>
      <pixiGraphics ref={circleInRef} alpha={0} draw={drawCircleIn} />
      <pixiGraphics ref={circleRef} alpha={0} draw={drawCircle} />
      <pixiGraphics ref={circleOutRef} alpha={0} draw={drawCircleOut} />
    </pixiContainer>
  );
});
