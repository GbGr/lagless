import { Assets, Sprite, Texture } from 'pixi.js';
import SHADOW from '../../../assets/textures/SHADOW.png';
import BODY from '../../../assets/textures/BODY.png';
import JAMS from '../../../assets/textures/JAMS.png';
import EYES from '../../../assets/textures/EYES.png';
import EYES_CLOSED from '../../../assets/textures/EYES_CLOSED.png';
import { FC, RefObject, useMemo, useRef } from 'react';
import {
  CircleSumoArena,
  isDynamic,
  isDynamicGuard,
  isSolid,
  isSolidGuard,
  isStatic,
  isStaticGuard,
  PLAYER_PRESETS,
} from '@lagless/circle-sumo-simulation';
import { FabricPatternFilter } from '../filters/flow-stripe-noise.filter';
import { ScreenSpaceNoiseFilter } from '../filters/screen-space-noise.filter';
import { useTick } from '@pixi/react';

interface PlayerViewProps {
  skinId: number;
  bodySpriteRef: RefObject<Sprite>;
  closedEyesSpriteRef?: RefObject<Sprite>;
  unsafeX?: number;
  unsafeY?: number;
  unsafeScale?: number;
  unsafeRotation?: number;
}
export const PlayerView: FC<PlayerViewProps> = ({
  skinId,
  unsafeX = 6,
  unsafeY = 0,
  unsafeScale = 1.17,
  unsafeRotation = 0,
  bodySpriteRef,
  closedEyesSpriteRef,
}) => {
  const playerSize = useMemo(() => CircleSumoArena.playerRadius * 2, []);
  const playerScale = useMemo(() => playerSize / (Assets.get(BODY) as Texture).width, [playerSize]);

  return (
    <pixiContainer x={unsafeX} y={unsafeY} rotation={unsafeRotation} scale={unsafeScale}>
      <pixiSprite
        interactive={false}
        eventMode={'none'}
        anchor={0.5}
        scale={playerScale}
        texture={Assets.get(SHADOW)}
      />
      <pixiSprite
        ref={bodySpriteRef}
        interactive
        anchor={0.5}
        scale={playerScale}
        texture={Assets.get(BODY)}
        tint={0xf8c89b}
      />
      <Jams skinId={skinId} playerScale={playerScale} />
      <pixiSprite
        interactive={false}
        eventMode={'none'}
        anchor={0.5}
        scale={playerScale}
        texture={Assets.get(EYES)}
      />
      {!closedEyesSpriteRef ? null : (
        <pixiSprite
          ref={closedEyesSpriteRef}
          interactive={false}
          eventMode={'none'}
          anchor={0.5}
          scale={playerScale}
          texture={Assets.get(EYES_CLOSED)}
        />
      )}
    </pixiContainer>
  );
};

interface JamsProps {
  skinId: number;
  playerScale: number;
}
const Jams: FC<JamsProps> = ({
  skinId,
  playerScale,
}) => {
  const preset = PLAYER_PRESETS[skinId];
  const dynamicFilterRef = useRef<ScreenSpaceNoiseFilter | null>(null);

  useTick((ticker) => {
    if (dynamicFilterRef.current) {
      dynamicFilterRef.current.time += ticker.deltaMS;
    }
  });

  if (isSolid(skinId) && isSolidGuard(preset)) {
    return (
      <pixiSprite
        interactive={false}
        eventMode={'none'}
        anchor={0.5}
        scale={playerScale}
        texture={Assets.get(JAMS)}
        tint={preset.color}
      />
    );
  } else if (isStatic(skinId) && isStaticGuard(preset)) {
    const filter = new FabricPatternFilter({
      colorA: preset.colorA,
      colorB: preset.colorB,
    });

    return (
      <pixiSprite
        interactive={false}
        eventMode={'none'}
        anchor={0.5}
        scale={playerScale}
        texture={Assets.get(JAMS)}
        filters={[ filter ]}
      />
    );
  } else if (isDynamic(skinId) && isDynamicGuard(preset)) {
    const filter = new ScreenSpaceNoiseFilter({
      color1: preset.colorA,
      color2: preset.colorB,
    });
    dynamicFilterRef.current = filter;

    return (
      <pixiSprite
        interactive={false}
        eventMode={'none'}
        anchor={0.5}
        scale={playerScale}
        texture={Assets.get(JAMS)}
        filters={[ filter ]}
      />
    );
  }

  return null;
};
