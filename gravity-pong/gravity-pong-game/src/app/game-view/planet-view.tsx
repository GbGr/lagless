import { useImperativeHandle, useRef } from 'react';
import { Container, Graphics } from 'pixi.js';
import { filterView, FilterViewRef } from '@lagless/pixi-react';
import { useRunner } from './runner-provider';
import { Transform2d, GravitySource } from '@lagless/gravity-pong-simulation';

const PLANET_COLORS = [
  { core: 0x6644aa, edge: 0x332266, atmo: 0x8866cc },
  { core: 0xaa6644, edge: 0x663322, atmo: 0xcc8866 },
  { core: 0x4488aa, edge: 0x224466, atmo: 0x66aacc },
  { core: 0x44aa66, edge: 0x226633, atmo: 0x66cc88 },
];

const BLACK_HOLE_COLOR = 0x110022;

export const PlanetView = filterView(({ entity }, ref) => {
  const runner = useRunner();
  const containerRef = useRef<Container>(null);
  const graphicsRef = useRef<Graphics>(null);

  const transform2d = runner.DIContainer.resolve(Transform2d);
  const gravitySource = runner.DIContainer.resolve(GravitySource);

  useImperativeHandle(ref, (): FilterViewRef => ({
    onCreate() {
      const g = graphicsRef.current;
      if (!g) return;

      const isBlackHole = gravitySource.unsafe.isBlackHole[entity] === 1;
      const radius = gravitySource.unsafe.radius[entity];

      g.clear();

      if (isBlackHole) {
        // Black hole: dark core with accretion ring
        g.circle(0, 0, radius + 8);
        g.fill({ color: 0x220044, alpha: 0.15 });
        g.circle(0, 0, radius + 4);
        g.fill({ color: 0x330066, alpha: 0.2 });
        g.circle(0, 0, radius);
        g.fill({ color: BLACK_HOLE_COLOR });
        // Accretion disk ring
        g.circle(0, 0, radius + 6);
        g.stroke({ color: 0x6622cc, width: 2, alpha: 0.4 });
        g.circle(0, 0, radius + 10);
        g.stroke({ color: 0x4411aa, width: 1, alpha: 0.2 });
      } else {
        const colorIdx = entity % PLANET_COLORS.length;
        const palette = PLANET_COLORS[colorIdx];

        // Atmosphere glow
        g.circle(0, 0, radius + 6);
        g.fill({ color: palette.atmo, alpha: 0.1 });

        // Planet body
        g.circle(0, 0, radius);
        g.fill({ color: palette.core });

        // Edge shading
        g.circle(0, 0, radius);
        g.stroke({ color: palette.edge, width: 3, alpha: 0.5 });

        // Atmosphere ring
        g.circle(0, 0, radius + 3);
        g.stroke({ color: palette.atmo, width: 1, alpha: 0.3 });
      }

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
