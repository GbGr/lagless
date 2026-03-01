import { FC, useEffect, useRef } from 'react';
import { Graphics } from 'pixi.js';
import { SyncTestArena } from '@lagless/sync-test-simulation';

export const GridBackground: FC = () => {
  const graphicsRef = useRef<Graphics>(null);

  useEffect(() => {
    const g = graphicsRef.current;
    if (!g) return;

    const w = SyncTestArena.width;
    const h = SyncTestArena.height;
    const step = 100;

    g.clear();

    // Grid lines
    for (let x = 0; x <= w; x += step) {
      g.moveTo(x, 0);
      g.lineTo(x, h);
    }
    for (let y = 0; y <= h; y += step) {
      g.moveTo(0, y);
      g.lineTo(w, y);
    }
    g.stroke({ color: 0x333355, width: 1, alpha: 0.4 });

    // Arena border
    g.rect(0, 0, w, h);
    g.stroke({ color: 0x6666aa, width: 3, alpha: 0.8 });
  }, []);

  return <pixiGraphics ref={graphicsRef} draw={() => {/* drawing handled in useEffect */}} />;
};
