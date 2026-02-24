import { useImperativeHandle, useRef } from 'react';
import { Container, Graphics } from 'pixi.js';
import { filterView, FilterViewRef } from '@lagless/pixi-react';
import { useRunner } from './runner-provider';
import { Transform2d, Ball, GravityPongArena } from '@lagless/gravity-pong-simulation';
import { VisualSmoother2d } from '@lagless/misc';

const BALL_COLORS = [0xff6644, 0x4488ff];
const TRAIL_LENGTH = 30;

export const BallView = filterView(({ entity }, ref) => {
  const runner = useRunner();
  const containerRef = useRef<Container>(null);
  const ballGraphicsRef = useRef<Graphics>(null);
  const trailGraphicsRef = useRef<Graphics>(null);
  const smoother = useRef(new VisualSmoother2d({})).current;
  const trail = useRef<{ x: number; y: number }[]>([]).current;

  const transform2d = runner.DIContainer.resolve(Transform2d);
  const ball = runner.DIContainer.resolve(Ball);

  useImperativeHandle(ref, (): FilterViewRef => ({
    onCreate() {
      const g = ballGraphicsRef.current;
      if (!g) return;
      const slot = ball.unsafe.ownerSlot[entity];
      const color = BALL_COLORS[slot % BALL_COLORS.length];
      const r = GravityPongArena.ballRadius;

      g.clear();
      // Glow
      g.circle(0, 0, r + 4);
      g.fill({ color, alpha: 0.2 });
      // Ball
      g.circle(0, 0, r);
      g.fill({ color, alpha: 0.95 });
      g.stroke({ color: 0xffffff, width: 1.5, alpha: 0.5 });

      trail.length = 0;
      this.onUpdate();
    },
    onUpdate() {
      const c = containerRef.current;
      if (!c) return;

      const active = ball.unsafe.active[entity] === 1;
      c.visible = active || trail.length > 0;

      if (!active) {
        // Fade out trail
        if (trail.length > 0) trail.length = 0;
        this._drawTrail();
        return;
      }

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

      // Update trail
      trail.push({ x: smoother.x, y: smoother.y });
      if (trail.length > TRAIL_LENGTH) trail.shift();

      this._drawTrail();
    },
    _drawTrail() {
      const tg = trailGraphicsRef.current;
      if (!tg || trail.length < 2) {
        tg?.clear();
        return;
      }

      const slot = ball.unsafe.ownerSlot[entity];
      const color = BALL_COLORS[slot % BALL_COLORS.length];

      tg.clear();
      for (let i = 1; i < trail.length; i++) {
        const alpha = (i / trail.length) * 0.4;
        const width = (i / trail.length) * 3;
        tg.moveTo(trail[i - 1].x, trail[i - 1].y);
        tg.lineTo(trail[i].x, trail[i].y);
        tg.stroke({ color, width, alpha });
      }
    },
    onDestroy() {
      trail.length = 0;
    },
  } as FilterViewRef & { _drawTrail(): void }));

  return (
    <>
      <pixiGraphics ref={trailGraphicsRef} />
      <pixiContainer ref={containerRef}>
        <pixiGraphics ref={ballGraphicsRef} />
      </pixiContainer>
    </>
  );
});
