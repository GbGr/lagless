import { useImperativeHandle, useRef } from 'react';
import { Container, Graphics } from 'pixi.js';
import { filterView, FilterViewRef } from '@lagless/pixi-react';
import { useRunner } from './runner-provider';
import { SyncTestArena, Transform2d } from '@lagless/sync-test-simulation';

export const CollectibleView = filterView(({ entity }, ref) => {
  const runner = useRunner();
  const containerRef = useRef<Container>(null);
  const graphicsRef = useRef<Graphics>(null);

  const transform2d = runner.DIContainer.resolve(Transform2d);

  useImperativeHandle(ref, (): FilterViewRef => ({
    onCreate() {
      const g = graphicsRef.current;
      if (!g) return;
      g.clear();
      g.circle(0, 0, SyncTestArena.coinRadius);
      g.fill({ color: 0xffd700, alpha: 0.9 });
      g.stroke({ color: 0xffaa00, width: 2, alpha: 0.8 });

      this.onUpdate();
    },
    onUpdate() {
      const c = containerRef.current;
      if (!c) return;
      const factor = runner.Simulation.interpolationFactor;
      const px = transform2d.unsafe.prevPositionX[entity];
      const py = transform2d.unsafe.prevPositionY[entity];
      const cx = transform2d.unsafe.positionX[entity];
      const cy = transform2d.unsafe.positionY[entity];
      c.x = px + (cx - px) * factor;
      c.y = py + (cy - py) * factor;

      // Pulse animation
      const tick = runner.Simulation.tick;
      const pulse = 1 + Math.sin(tick * 0.1) * 0.08;
      c.scale.set(pulse);
    },
    onDestroy() {
      // nothing to clean up
    },
  }));

  return (
    <pixiContainer ref={containerRef}>
      <pixiGraphics ref={graphicsRef} />
    </pixiContainer>
  );
});
