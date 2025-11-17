import { FC, useCallback, useEffect, useRef } from 'react';
import { Graphics, Sprite, Texture } from 'pixi.js';
import { CircleSumoArena } from '@lagless/circle-sumo-simulation';

export const Arena: FC = () => {
  const drawMask = useCallback((g: Graphics) => {
    console.log('draw');
    g.clear();
    g.circle(0, 0, CircleSumoArena.radius);
    g.fill(0xffffff);
  }, []);
  const drawStroke = useCallback((g: Graphics) => {
    g.clear();
    g.strokeStyle = {
      width: CircleSumoArena.dangerStrokeWidth,
      color: 0xff0000,
    };
    g.circle(0, 0, CircleSumoArena.radius);
    g.stroke();
  }, []);
  const spriteRef = useRef<Sprite>(null);
  const maskGraphicsRef = useRef<Graphics>(null);
  const strokeGraphicsRef = useRef<Graphics>(null);

  useEffect(() => {
    if (spriteRef.current === null || maskGraphicsRef.current === null) {
      throw new Error('refs not initialized');
    }
    spriteRef.current.mask = maskGraphicsRef.current;
  }, []);

  return (
    <pixiContainer>
      <pixiSprite
        x={0}
        y={0}
        anchor={0.5}
        tint={0x338bff}
        ref={spriteRef}
        texture={Texture.WHITE}
        width={CircleSumoArena.radius * 2}
        height={CircleSumoArena.radius * 2}
      />
      <pixiGraphics draw={drawMask} ref={maskGraphicsRef} x={0} y={0} />
      <pixiGraphics draw={drawStroke} ref={strokeGraphicsRef} x={0} y={0} />
    </pixiContainer>
  );
};
