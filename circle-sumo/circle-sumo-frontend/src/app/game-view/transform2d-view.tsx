import { Assets, Container, Sprite, Texture } from 'pixi.js';
import { EntitiesManager, PlayerResources } from '@lagless/core';
import { interpolateTransform2dCursorToRef } from '@lagless/misc';
import { useImperativeHandle, useMemo, useRef } from 'react';
import { CircleBody, CircleSumoArena, PlayerResource, Transform2d } from '@lagless/circle-sumo-simulation';
import { useRunner } from './runner-provider';
import { filterView, FilterView } from './filter-views';
import BODY from '../../assets/textures/BODY.png';
import JAMS from '../../assets/textures/JAMS.png';
import EYES from '../../assets/textures/EYES.png';
import SHADOW from '../../assets/textures/SHADOW.png';
import EYES_CLOSED from '../../assets/textures/EYES_CLOSED.png';
import { useViewport } from './viewport-provider';
import { DirectionArrowHandle, DirectionArrowView } from './components/direction-arrow-view';

const JAMS_COLORS = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff];

export const Transform2dView: FilterView = filterView(({ entity }, ref) => {
  const runner = useRunner();
  const viewport = useViewport();

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const bodySpriteRef = useRef<Sprite>(null!);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const containerRef = useRef<Container>(null!);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const closedEyesSpriteRef = useRef<Sprite>(null!);
  const directionLogicRef = useRef<DirectionArrowHandle | null>(null);

  const _EntitiesManager = useMemo(() => runner.DIContainer.resolve(EntitiesManager), [runner]);
  const _PlayerResources = useMemo(() => runner.DIContainer.resolve(PlayerResources), [runner]);

  const playerResource = useMemo(() => {
    return _PlayerResources.get(PlayerResource, runner.InputProviderInstance.playerSlot);
  }, [_PlayerResources, runner]);

  const transform2d = useMemo(() => runner.DIContainer.resolve(Transform2d), [runner]);
  const simulation = useMemo(() => runner.Simulation, [runner]);

  const isLocalPlayer = playerResource.safe.entity === entity;
  const playerSize = useMemo(() => CircleSumoArena.playerRadius * 2, []);
  const playerScale = useMemo(() => playerSize / (Assets.get(BODY) as Texture).width, [playerSize]);

  useImperativeHandle(
    ref,
    () => ({
      onCreate() {
        closedEyesSpriteRef.current.visible = false;
        const t2d = transform2d.getCursor(entity);
        interpolateTransform2dCursorToRef(t2d, simulation.interpolationFactor, containerRef.current);

        // Sync direction arrow with initial transform
        directionLogicRef.current?.onTransformUpdated(containerRef.current);

        if (isLocalPlayer) {
          viewport.follow(containerRef.current);
        }
      },
      onUpdate() {
        const t2d = transform2d.getCursor(entity);
        interpolateTransform2dCursorToRef(t2d, simulation.interpolationFactor, containerRef.current);

        // Keep arrow attached to updated transform
        directionLogicRef.current?.onTransformUpdated(containerRef.current);

        closedEyesSpriteRef.current.visible = !_EntitiesManager.hasComponent(entity, CircleBody);
      },
      async onDestroy() {
        // Nothing special here for now
      },
    }),
    [_EntitiesManager, entity, isLocalPlayer, simulation.interpolationFactor, transform2d, viewport]
  );

  return (
    <>
      {isLocalPlayer ? <DirectionArrowView ref={directionLogicRef} bodySpriteRef={bodySpriteRef} /> : null}

      <pixiContainer ref={containerRef}>
        <pixiContainer x={6} scale={1.17}>
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
          <pixiSprite
            interactive={false}
            eventMode={'none'}
            anchor={0.5}
            scale={playerScale}
            texture={Assets.get(JAMS)}
            tint={JAMS_COLORS[entity]}
          />
          <pixiSprite
            interactive={false}
            eventMode={'none'}
            anchor={0.5}
            scale={playerScale}
            texture={Assets.get(EYES)}
          />
          <pixiSprite
            ref={closedEyesSpriteRef}
            interactive={false}
            eventMode={'none'}
            anchor={0.5}
            scale={playerScale}
            texture={Assets.get(EYES_CLOSED)}
          />
        </pixiContainer>
      </pixiContainer>
    </>
  );
});
