<% if (simulationType === 'physics3d') { -%>
import { useImperativeHandle, useRef } from 'react';
import { Container, Graphics } from 'pixi.js';
import { filterView, FilterViewRef } from '@lagless/pixi-react';
import { useRunner } from './runner-provider';
import { PlayerBody, <%= projectName %>Arena, Transform3d } from '<%= packageName %>-simulation';
import { VisualSmoother2d } from '@lagless/misc';

const PLAYER_COLORS = [0xff4444, 0x4488ff, 0x44ff44, 0xffff44];

// Top-down rendering: 3D positionX → screen X, positionZ → screen Y
const SCALE = 20; // pixels per world unit
const OFFSET_X = 400;
const OFFSET_Y = 300;

export const PlayerView = filterView(({ entity }, ref) => {
  const runner = useRunner();
  const containerRef = useRef<Container>(null);
  const graphicsRef = useRef<Graphics>(null);
  const smootherRef = useRef<VisualSmoother2d>(new VisualSmoother2d());

  const transform3d = runner.DIContainer.resolve(Transform3d);
  const playerBody = runner.DIContainer.resolve(PlayerBody);

  useImperativeHandle(ref, (): FilterViewRef => ({
    onCreate() {
      const g = graphicsRef.current;
      if (!g) return;
      const slot = playerBody.unsafe.playerSlot[entity];
      const radius = playerBody.unsafe.radius[entity] * SCALE;
      const color = PLAYER_COLORS[slot % PLAYER_COLORS.length];
      g.clear();
      g.circle(0, 0, radius);
      g.fill(color);
      g.circle(0, 0, radius);
      g.stroke({ color: 0xffffff, width: 2, alpha: 0.3 });
    },
    onUpdate() {
      const container = containerRef.current;
      if (!container) return;
      const smoother = smootherRef.current;
      const factor = runner.Simulation.interpolationFactor;

      // Map 3D (X, Z) to 2D screen space (top-down view)
      smoother.update(
        transform3d.unsafe.prevPositionX[entity] * SCALE + OFFSET_X,
        transform3d.unsafe.prevPositionZ[entity] * SCALE + OFFSET_Y,
        transform3d.unsafe.positionX[entity] * SCALE + OFFSET_X,
        transform3d.unsafe.positionZ[entity] * SCALE + OFFSET_Y,
        factor,
      );

      container.x = smoother.x;
      container.y = smoother.y;
    },
    onDestroy() {
      // cleanup
    },
  }));

  return (
    <pixiContainer ref={containerRef}>
      <pixiGraphics ref={graphicsRef} />
    </pixiContainer>
  );
});
<% } else { -%>
import { useImperativeHandle, useRef } from 'react';
import { Container, Graphics } from 'pixi.js';
import { filterView, FilterViewRef } from '@lagless/pixi-react';
import { useRunner } from './runner-provider';
import { PlayerBody, <%= projectName %>Arena, Transform2d } from '<%= packageName %>-simulation';
import { VisualSmoother2d } from '@lagless/misc';

const PLAYER_COLORS = [0xff4444, 0x4488ff, 0x44ff44, 0xffff44];

export const PlayerView = filterView(({ entity }, ref) => {
  const runner = useRunner();
  const containerRef = useRef<Container>(null);
  const graphicsRef = useRef<Graphics>(null);
  const smootherRef = useRef<VisualSmoother2d>(new VisualSmoother2d());

  const transform2d = runner.DIContainer.resolve(Transform2d);
  const playerBody = runner.DIContainer.resolve(PlayerBody);

  useImperativeHandle(ref, (): FilterViewRef => ({
    onCreate() {
      const g = graphicsRef.current;
      if (!g) return;
      const slot = playerBody.unsafe.playerSlot[entity];
      const radius = playerBody.unsafe.radius[entity];
      const color = PLAYER_COLORS[slot % PLAYER_COLORS.length];
      g.clear();
      g.circle(0, 0, radius);
      g.fill(color);
      g.circle(0, 0, radius);
      g.stroke({ color: 0xffffff, width: 2, alpha: 0.3 });
    },
    onUpdate() {
      const container = containerRef.current;
      if (!container) return;
      const smoother = smootherRef.current;
      const factor = runner.Simulation.interpolationFactor;

      smoother.update(
        transform2d.unsafe.prevPositionX[entity],
        transform2d.unsafe.prevPositionY[entity],
        transform2d.unsafe.positionX[entity],
        transform2d.unsafe.positionY[entity],
        factor,
      );

      container.x = smoother.x;
      container.y = smoother.y;
    },
    onDestroy() {
      // cleanup
    },
  }));

  return (
    <pixiContainer ref={containerRef}>
      <pixiGraphics ref={graphicsRef} />
    </pixiContainer>
  );
});
<% } -%>
