import { useImperativeHandle, useRef } from 'react';
import { Container, Graphics } from 'pixi.js';
import { filterView, FilterViewRef } from '@lagless/pixi-react';
import { useRunner } from './runner-provider';
import { PlayerBody, MapTestArena, Transform2d } from '@lagless/2d-map-test-simulation';
import { VisualSmoother2d } from '@lagless/misc';

const PLAYER_COLORS = [0xff4444, 0x4488ff, 0x44cc44, 0xffcc00];

export const PlayerView = filterView(({ entity }, ref) => {
  const runner = useRunner();
  const containerRef = useRef<Container>(null);
  const graphicsRef = useRef<Graphics>(null);
  const smoother = useRef(new VisualSmoother2d({ positionJumpThreshold: 0.01, smoothingHalfLifeMs: 50 })).current;

  const transform2d = runner.DIContainer.resolve(Transform2d);
  const playerBody = runner.DIContainer.resolve(PlayerBody);

  useImperativeHandle(ref, (): FilterViewRef => ({
    onCreate() {
      const g = graphicsRef.current;
      if (!g) return;
      const slot = playerBody.unsafe.playerSlot[entity];
      const radius = playerBody.unsafe.radius[entity] || MapTestArena.playerRadius;
      const color = PLAYER_COLORS[slot % PLAYER_COLORS.length];
      g.clear();
      g.circle(0, 0, radius);
      g.fill({ color, alpha: 0.9 });
      g.stroke({ color: 0xffffff, width: 2, alpha: 0.6 });

      this.onUpdate();
    },
    onUpdate() {
      const c = containerRef.current;
      if (!c) return;
      smoother.update(
        transform2d.unsafe.prevPositionX[entity],
        transform2d.unsafe.prevPositionY[entity],
        transform2d.unsafe.positionX[entity],
        transform2d.unsafe.positionY[entity],
        0, 0,
        runner.Simulation.interpolationFactor,
      );
      c.x = smoother.x;
      c.y = smoother.y;
    },
    onDestroy() {
      // nothing to clean up
    },
  }));

  const slot = playerBody.unsafe.playerSlot[entity];

  return (
    <pixiContainer ref={containerRef}>
      <pixiGraphics ref={graphicsRef} draw={() => {
        // drawing is handled in onCreate and onUpdate, so we don't need to do anything here
      }} />
      <pixiText
        text={`P${slot}`}
        anchor={0.5}
        y={-(MapTestArena.playerRadius + 12)}
        style={{ fontSize: 14, fill: 0xffffff, fontFamily: 'Courier New' }}
      />
    </pixiContainer>
  );
});
