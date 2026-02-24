import { FC, useEffect, useRef } from 'react';
import { Graphics } from 'pixi.js';
import { GravityPongArena } from '@lagless/gravity-pong-simulation';

export const Background: FC = () => {
  const graphicsRef = useRef<Graphics>(null);

  useEffect(() => {
    const g = graphicsRef.current;
    if (!g) return;

    const w = GravityPongArena.width;
    const h = GravityPongArena.height;

    g.clear();

    // Dark space background
    g.rect(0, 0, w, h);
    g.fill({ color: 0x030810 });

    // Stars
    const starSeed = 42;
    let rng = starSeed;
    const nextRng = () => {
      rng = (rng * 1103515245 + 12345) & 0x7fffffff;
      return rng / 0x7fffffff;
    };

    for (let i = 0; i < 400; i++) {
      const sx = nextRng() * w;
      const sy = nextRng() * h;
      const size = nextRng() * 1.5 + 0.5;
      const brightness = nextRng() * 0.6 + 0.2;
      g.circle(sx, sy, size);
      g.fill({ color: 0xffffff, alpha: brightness });
    }

    // Nebula clouds
    for (let i = 0; i < 3; i++) {
      const nx = nextRng() * w;
      const ny = nextRng() * h;
      const nr = 60 + nextRng() * 80;
      const colors = [0x221144, 0x112244, 0x441122];
      g.circle(nx, ny, nr);
      g.fill({ color: colors[i % colors.length], alpha: 0.08 });
    }

    // Arena border
    g.rect(0, 0, w, h);
    g.stroke({ color: 0x1a2040, width: 2, alpha: 0.5 });
  }, []);

  return <pixiGraphics ref={graphicsRef} />;
};
