import { useImperativeHandle, useRef } from 'react';
import { Container, Graphics } from 'pixi.js';
import { filterView, FilterViewRef } from '@lagless/pixi-react';
import { useRunner } from './runner-provider';
import { Transform2d, Goal, GravityPongArena } from '@lagless/gravity-pong-simulation';

const GOAL_COLORS = [0xff6644, 0x4488ff];

export const GoalView = filterView(({ entity }, ref) => {
  const runner = useRunner();
  const containerRef = useRef<Container>(null);
  const graphicsRef = useRef<Graphics>(null);

  const transform2d = runner.DIContainer.resolve(Transform2d);
  const goal = runner.DIContainer.resolve(Goal);

  useImperativeHandle(ref, (): FilterViewRef => ({
    onCreate() {
      const g = graphicsRef.current;
      if (!g) return;

      const slot = goal.unsafe.ownerSlot[entity];
      const halfWidth = goal.unsafe.halfWidth[entity];
      const color = GOAL_COLORS[slot % GOAL_COLORS.length];

      g.clear();

      // Glow behind
      g.rect(-halfWidth, -3, halfWidth * 2, 6);
      g.fill({ color, alpha: 0.15 });

      // Goal line
      g.moveTo(-halfWidth, 0);
      g.lineTo(halfWidth, 0);
      g.stroke({ color, width: 3, alpha: 0.8 });

      // Edge markers
      g.circle(-halfWidth, 0, 3);
      g.fill({ color, alpha: 0.6 });
      g.circle(halfWidth, 0, 3);
      g.fill({ color, alpha: 0.6 });

      this.onUpdate();
    },
    onUpdate() {
      const c = containerRef.current;
      if (!c) return;
      c.x = transform2d.unsafe.positionX[entity];
      c.y = transform2d.unsafe.positionY[entity];
    },
    onDestroy() {},
  }));

  return (
    <pixiContainer ref={containerRef}>
      <pixiGraphics ref={graphicsRef} />
    </pixiContainer>
  );
});
