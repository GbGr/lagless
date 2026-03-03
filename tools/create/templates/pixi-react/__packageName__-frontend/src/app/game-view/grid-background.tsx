import { FC, useEffect, useRef } from 'react';
import { Graphics } from 'pixi.js';
import { <%= projectName %>Arena } from '<%= packageName %>-simulation';

export const GridBackground: FC = () => {
  const graphicsRef = useRef<Graphics>(null);

  useEffect(() => {
    const g = graphicsRef.current;
    if (!g) return;

<% if (simulationType === 'physics3d') { -%>
    // physics3d: world units → screen pixels (top-down view)
    const SCALE = 20;
    const OFFSET_X = 400;
    const OFFSET_Y = 300;
    const arenaW = <%= projectName %>Arena.width;
    const arenaH = <%= projectName %>Arena.depth;
    const screenW = arenaW * SCALE;
    const screenH = arenaH * SCALE;
    const startX = OFFSET_X - screenW / 2;
    const startY = OFFSET_Y - screenH / 2;
    const step = 100;

    g.clear();

    for (let x = startX; x <= startX + screenW; x += step) {
      g.moveTo(x, startY);
      g.lineTo(x, startY + screenH);
    }
    for (let y = startY; y <= startY + screenH; y += step) {
      g.moveTo(startX, y);
      g.lineTo(startX + screenW, y);
    }
    g.stroke({ color: 0x333355, width: 1, alpha: 0.4 });

    g.rect(startX, startY, screenW, screenH);
    g.stroke({ color: 0x6666aa, width: 3, alpha: 0.8 });
<% } else { -%>
    const w = <%= projectName %>Arena.width;
    const h = <%= projectName %>Arena.height;
    const step = 100;

    g.clear();

    for (let x = 0; x <= w; x += step) {
      g.moveTo(x, 0);
      g.lineTo(x, h);
    }
    for (let y = 0; y <= h; y += step) {
      g.moveTo(0, y);
      g.lineTo(w, y);
    }
    g.stroke({ color: 0x333355, width: 1, alpha: 0.4 });

    g.rect(0, 0, w, h);
    g.stroke({ color: 0x6666aa, width: 3, alpha: 0.8 });
<% } -%>
  }, []);

  return <pixiGraphics ref={graphicsRef} />;
};
