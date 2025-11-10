import { filterView, FilterView } from './filter-views';
import { useCallback, useImperativeHandle, useMemo, useRef } from 'react';
import { Container, Graphics } from 'pixi.js';
import { useRunner } from './runner-provider';
import { Transform2d } from '@lagless/circle-race-simulation';
import { animatePromise } from '@lagless/animate';
import { interpolateTransform2dCursorToRef } from '@lagless/misc';
import { useViewport } from './viewport-provider';

export const Transform2dView: FilterView = filterView(({ entity }, ref) => {
  const runner = useRunner();
  const viewport = useViewport();
  const simulation = useMemo(() => runner.Simulation, [runner]);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const containerRef = useRef<Container>(null!);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const circleInRef = useRef<Graphics>(null!);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const circleRef = useRef<Graphics>(null!);
  const transform2d = useMemo(() => runner.DIContainer.resolve(Transform2d), [runner]);

  useImperativeHandle(
    ref,
    () => {
      return {
        onCreate() {
          const t2d = transform2d.getCursor(entity);
          interpolateTransform2dCursorToRef(t2d, simulation.interpolationFactor, containerRef.current);

          viewport.follow(containerRef.current);

          animatePromise((x) => {
            circleInRef.current.alpha = x;
            circleInRef.current.scale.set((1 - x) * 2);
          }, 300)
            .then(() => circleRef.current.alpha = 1)
        },
        onUpdate() {
          const t2d = transform2d.getCursor(entity);
          interpolateTransform2dCursorToRef(t2d, simulation.interpolationFactor, containerRef.current);

          viewport.follow(containerRef.current);
        },
        async onDestroy() {
          console.log('onDestroy', entity);
        },
      };
    },
    [entity, simulation, transform2d, viewport]
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

  return (
    <pixiContainer ref={containerRef}>
      <pixiGraphics ref={circleInRef} alpha={0} draw={drawCircleIn} />
      <pixiGraphics ref={circleRef} alpha={0} draw={drawCircle} />
    </pixiContainer>
  );
});
