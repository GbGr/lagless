import { FC, RefObject, useCallback, useEffect, useMemo, useRef } from 'react';
import { Graphics, Sprite, Texture, Ticker } from 'pixi.js';
import { CircleSumoArena, PlayerResource } from '@lagless/circle-sumo-simulation';
import { useRunner } from '../runner-provider';
import { useTick } from '@pixi/react';
import { PlayerResources } from '@lagless/core';
import { GlowFilter } from 'pixi-filters';

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
      color: 0xff4d4d,
    };
    g.circle(0, 0, CircleSumoArena.radius);
    g.stroke();
  }, []);
  const spriteRef = useRef<Sprite>(null);
  const maskGraphicsRef = useRef<Graphics>(null);
  const strokeGraphicsRef = useRef<Graphics>(null);

  useArenaDangerZoneAnimation(strokeGraphicsRef);

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

const useArenaDangerZoneAnimation = (strokeGraphicsRef: RefObject<Graphics | null>) => {
  const runner = useRunner();
  const playerSlot = useMemo(() => runner.InputProviderInstance.playerSlot, [runner.InputProviderInstance.playerSlot]);
  const _PlayerResources = useMemo(() => runner.DIContainer.resolve(PlayerResources), [runner.DIContainer]);
  const playerResource = useMemo(() => _PlayerResources.get(PlayerResource, playerSlot), [_PlayerResources, playerSlot]);
  const animationStateRef = useRef<{ elapsedTime: number }>({ elapsedTime: 0 });
    const outlineFilter = useMemo(() => new GlowFilter({ color: 0xff0000, alpha: 0 }), []);

  useEffect(() => {
    if (!strokeGraphicsRef.current) throw new Error('graphics ref not initialized');

    strokeGraphicsRef.current.filters = [outlineFilter];
  }, [outlineFilter, strokeGraphicsRef]);

  useTick(useCallback((ticker: Ticker) => {
    if (!strokeGraphicsRef.current) throw new Error('graphics ref not initialized');

    if (playerResource.safe.isInDangerZone === 1) {
      animationStateRef.current.elapsedTime += ticker.deltaMS;
      outlineFilter.alpha = 0.5 + 0.5 * Math.sin((animationStateRef.current.elapsedTime / 500) * Math.PI * 2);
    } else {
      animationStateRef.current.elapsedTime = 0;
      outlineFilter.alpha = 0;
    }
  }, [outlineFilter, playerResource, strokeGraphicsRef]));
};
