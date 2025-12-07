import { Container, Graphics, Sprite } from 'pixi.js';
import { EntitiesManager, PlayerResources } from '@lagless/core';
import { interpolateTransform2dCursorToRef } from '@lagless/misc';
import { useImperativeHandle, useMemo, useRef } from 'react';
import { CircleBody, PlayerResource, Skin, Transform2d } from '@lagless/circle-sumo-simulation';
import { useRunner } from './runner-provider';
import { filterView, FilterView } from './filter-views';
import { useViewport } from './viewport-provider';
import { DirectionArrowHandle, DirectionArrowView } from './components/direction-arrow-view';
import { PlayerView } from './components/player-view';
import { animatePromise } from '@lagless/animate';
import { VECTOR2_BUFFER_1 } from '@lagless/math';
import { computeCameraCenterForLocalPlayer } from './coords-utils';
import { usePlayerWorldRotation } from './player-world';

export const Transform2dView: FilterView = filterView(({ entity }, ref) => {
  const runner = useRunner();
  const viewport = useViewport();
  const worldRotationRef = usePlayerWorldRotation();

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const bodySpriteRef = useRef<Sprite>(null!);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const containerRef = useRef<Container>(null!);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const closedEyesSpriteRef = useRef<Sprite>(null!);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const playerOutlineRef = useRef<Graphics>(null!);
  const directionLogicRef = useRef<DirectionArrowHandle | null>(null);

  const _EntitiesManager = useMemo(() => runner.DIContainer.resolve(EntitiesManager), [runner]);
  const _PlayerResources = useMemo(() => runner.DIContainer.resolve(PlayerResources), [runner]);
  const _Skin = useMemo(() => runner.DIContainer.resolve(Skin), [runner]);

  const playerResource = useMemo(() => {
    return _PlayerResources.get(PlayerResource, runner.InputProviderInstance.playerSlot);
  }, [_PlayerResources, runner]);

  const transform2d = useMemo(() => runner.DIContainer.resolve(Transform2d), [runner]);
  const simulation = useMemo(() => runner.Simulation, [runner]);

  const isLocalPlayer = playerResource.safe.entity === entity;

  useImperativeHandle(
    ref,
    () => ({
      onCreate() {
        closedEyesSpriteRef.current.visible = false;
        const t2d = transform2d.getCursor(entity);
        interpolateTransform2dCursorToRef(t2d, simulation.interpolationFactor, containerRef.current);

        // Sync direction arrow with initial transform
        directionLogicRef.current?.onTransformUpdated(containerRef.current);

        // if (isLocalPlayer) {
        //   viewport.follow(containerRef.current);
        // }
        if (isLocalPlayer) {
          playerOutlineRef.current.visible = true;
          animatePromise((x) => {
            playerOutlineRef.current.scale = 1 - x;
          }, 1000).catch(console.error);
        }
      },
      onUpdate() {
        const t2d = transform2d.getCursor(entity);
        interpolateTransform2dCursorToRef(t2d, simulation.interpolationFactor, containerRef.current);

        // Keep arrow attached to updated transform
        directionLogicRef.current?.onTransformUpdated(containerRef.current);

        closedEyesSpriteRef.current.visible = !_EntitiesManager.hasComponent(entity, CircleBody);

        if (isLocalPlayer) {
          const screenWidth = viewport.screenWidth;
          const screenHeight = viewport.screenHeight;

          const desiredScreenX = screenWidth / 2;
          const desiredScreenY = screenHeight * 0.8;

          computeCameraCenterForLocalPlayer(
            containerRef.current,
            viewport,
            worldRotationRef.current,
            desiredScreenX,
            desiredScreenY,
            VECTOR2_BUFFER_1,
          );

          viewport.moveCenter(VECTOR2_BUFFER_1.x, VECTOR2_BUFFER_1.y);
        }
      },
      async onDestroy() {
        // Nothing special here for now
      },
    }),
    [_EntitiesManager, entity, isLocalPlayer, simulation.interpolationFactor, transform2d, viewport, worldRotationRef]
  );

  return (
    <>
      {isLocalPlayer ? <DirectionArrowView ref={directionLogicRef} bodySpriteRef={bodySpriteRef} /> : null}

      <pixiContainer ref={containerRef}>
        <pixiGraphics
          visible={false}
          ref={playerOutlineRef}
          draw={(g) => {
            g.clear();
            g.circle(0, 0, 128);
            g.fill(0x00ff00);
          }}
        />
        <PlayerView
          skinId={_Skin.unsafe.skinId[entity]}
          bodySpriteRef={bodySpriteRef}
          closedEyesSpriteRef={closedEyesSpriteRef}
        />
      </pixiContainer>
    </>
  );
});
