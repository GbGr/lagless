import { Assets, Container, FederatedPointerEvent, Sprite } from 'pixi.js';
import { PlayerResources } from '@lagless/core';
import { interpolateTransform2dCursorToRef } from '@lagless/misc';
import { useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { PlayerResource, Transform2d } from '@lagless/circle-sumo-simulation';
import { useRunner } from './runner-provider';
import { filterView, FilterView } from './filter-views';
import BODY from '../../assets/textures/BODY.png';
import JAMS from '../../assets/textures/JAMS.png';
import EYES from '../../assets/textures/EYES.png';
import EYES_CLOSED from '../../assets/textures/EYES_CLOSED.png';
import ARROW from '../../assets/textures/ARROW.png';
import ARROW_GRADIENT from '../../assets/textures/ARROW_GRADIENT.png';
import { MathOps, Vector2 } from '@lagless/math';
import { useViewport } from './viewport-provider';
import { useApplication } from '@pixi/react';

const JAMS_COLORS = [
  0xff0000,
  0x00ff00,
  0x0000ff,
  0xffff00,
  0xff00ff,
  0x00ffff,
];

export const Transform2dView: FilterView = filterView(({ entity }, ref) => {
  const runner = useRunner();
  const { app } = useApplication();
  const viewport = useViewport();
  const viewRenderLayer = useViewRenderLayer();
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const bodySpriteRef = useRef<Sprite>(null!);
  const playerResource = useMemo(() => {
    return runner.DIContainer.resolve(PlayerResources).get(PlayerResource, runner.InputProviderInstance.playerSlot);
  }, [runner]);
  const transform2d = useMemo(() => runner.DIContainer.resolve(Transform2d), [runner]);
  const simulation = useMemo(() => runner.Simulation, [runner]);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const containerRef = useRef<Container>(null!);
  const directionContainerRef = useRef<Container>(null);
  const arrowGradientRef = useRef<Sprite>(null);
  const arrowRef = useRef<Sprite>(null);

  useImperativeHandle(
    ref,
    () => {
      return {
        onCreate() {
          viewRenderLayer.attach(bodySpriteRef.current);
          const t2d = transform2d.getCursor(entity);
          interpolateTransform2dCursorToRef(t2d, simulation.interpolationFactor, containerRef.current);

          if (playerResource.safe.entity === entity) {
            // viewport.follow(containerRef.current);
          }
        },
        onUpdate() {
          const t2d = transform2d.getCursor(entity);
          interpolateTransform2dCursorToRef(t2d, simulation.interpolationFactor, containerRef.current);
          const directionContainer = directionContainerRef.current;
          if (directionContainer) {
            directionContainer.x = containerRef.current.x;
            directionContainer.y = containerRef.current.y;
          }
        },
        async onDestroy() {
          //
        },
      };
    },
    [entity, playerResource.safe.entity, simulation.interpolationFactor, transform2d]
  );

  useEffect(() => {
    if (playerResource.safe.entity !== entity) return;
    const arrow = arrowRef.current;
    const directionContainer = directionContainerRef.current;
    if (!arrow || !directionContainer) return;
    let isPointerDown = false;
    const minDistance = 80;
    const maxDistance = 230;
    const bodySprite = bodySpriteRef.current;
    const from = new Vector2();
    const to = new Vector2();

    const onPointerDown = (e: FederatedPointerEvent) => {
      isPointerDown = true;
      directionContainer.visible = true;
      from.copyFrom(containerRef.current);
      to.copyFrom(from).addInPlace(Vector2.fromAngle(containerRef.current.rotation));  // TODO: maybe set from rotation
      arrow.width = minDistance;
      directionContainer.rotation = containerRef.current.rotation;
    };

    const onPointerMove = (e: FederatedPointerEvent) => {
      if (!isPointerDown) return;
      to.copyFrom(viewport.toWorld(e.clientX, e.clientY));
      let length = to.distanceTo(from);
      if (length > maxDistance) {
        length = maxDistance;
        to.subInPlace(from).normalizeInPlace().scaleInPlace(maxDistance).addInPlace(from);
      } else if (length < minDistance) {
        length = minDistance;
        to.subInPlace(from).normalizeInPlace().scaleInPlace(minDistance).addInPlace(from);
      }
      const power = MathOps.clamp01(length / maxDistance);
      const angle = MathOps.atan2(to.y - from.y, to.x - from.x);
      // arrowRef.current.width = length;
      // directionContainerRef.current.rotation = angle;
      arrow.width = Math.max(minDistance, length);
      directionContainer.rotation = angle;
    };

    const onPointerUp = (e: FederatedPointerEvent) => {
      isPointerDown = false;
      directionContainer.visible = false;
    }

    bodySprite.on('pointerdown', onPointerDown);
    bodySprite.on('pointermove', onPointerMove);
    bodySprite.on('pointerup', onPointerUp);
    bodySprite.on('pointerupoutside', onPointerUp);
    app.renderer.canvas.addEventListener('pointermove', onPointerMove as any);

    return () => {
      bodySprite.off('pointerdown', onPointerDown);
      bodySprite.off('pointermove', onPointerMove);
      bodySprite.off('pointerup', onPointerUp);
      bodySprite.off('pointerupoutside', onPointerUp);
      app.renderer.canvas.removeEventListener('pointermove', onPointerMove as any);
    };
  }, [app.renderer.canvas, entity, playerResource.safe.entity, viewport]);

  useEffect(() => {
    if (arrowGradientRef.current && arrowRef.current) {
      arrowGradientRef.current.mask = arrowRef.current;
    }
  }, []);

  return (
    <>
      {playerResource.safe.entity !== entity ? null : (
        <pixiContainer ref={directionContainerRef} visible={false}>
          <pixiSprite ref={arrowGradientRef} interactive={false} eventMode={'none'} anchor={{ x: 0, y: 0.5 }} scale={0.5} texture={Assets.get(ARROW_GRADIENT)} />
          <pixiSprite ref={arrowRef} interactive={false} eventMode={'none'} anchor={{ x: 0, y: 0.5 }} scale={0.5} texture={Assets.get(ARROW)} />
        </pixiContainer>
      )}
      <pixiContainer ref={containerRef}>
        <pixiContainer x={6}>
          <pixiSprite ref={bodySpriteRef} interactive anchor={0.5} scale={0.35} texture={Assets.get(BODY)} tint={0xf8c89b} />
          <pixiSprite interactive={false} eventMode={'none'} anchor={0.5} scale={0.35} texture={Assets.get(JAMS)} tint={JAMS_COLORS[entity]} />
          <pixiSprite interactive={false} eventMode={'none'} anchor={0.5} scale={0.35} texture={Assets.get(EYES)} />
          <pixiSprite interactive={false} eventMode={'none'} anchor={0.5} scale={0.35} texture={Assets.get(EYES_CLOSED)} alpha={0} />
        </pixiContainer>
      </pixiContainer>
    </>
  );
});
