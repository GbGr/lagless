import { useApplication } from '@pixi/react';
import { Assets, Container, FederatedPointerEvent, Sprite } from 'pixi.js';
import { forwardRef, RefObject, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { useViewport } from '../viewport-provider';
import { useRunner } from '../runner-provider';
import { MathOps, Vector2 } from '@lagless/math';
import { LookAt, Move } from '@lagless/circle-sumo-simulation';
import { toFloat32 } from '@lagless/binary';
import ARROW from '../../../assets/textures/ARROW.png';
import ARROW_GRADIENT from '../../../assets/textures/ARROW_GRADIENT.png';

const ARROW_MIN_DISTANCE = 80;
const ARROW_MAX_DISTANCE = 230;

export type DirectionArrowHandle = {
  onTransformUpdated(container: Container): void;
};

type DirectionState = {
  container: Container | null;
  isPointerDown: boolean;
  pointerClientX: number;
  pointerClientY: number;
  from: Vector2;
  to: Vector2;
  prevLookAtDirection: number;
  lookAtDirection: number;
  moveInputCache: { direction: number; power: number };
  pendingMoveInput: { direction: number; power: number } | null;
};

export const DirectionArrowView = forwardRef<DirectionArrowHandle, { bodySpriteRef: RefObject<Sprite> }>(
  ({ bodySpriteRef }, ref) => {
    const { app } = useApplication();
    const viewport = useViewport();
    const runner = useRunner();

    const directionContainerRef = useRef<Container>(null);
    const arrowGradientRef = useRef<Sprite>(null);
    const arrowRef = useRef<Sprite>(null);

    const stateRef = useRef<DirectionState>({
      container: null,
      isPointerDown: false,
      pointerClientX: 0,
      pointerClientY: 0,
      from: new Vector2(),
      to: new Vector2(),
      prevLookAtDirection: 0,
      lookAtDirection: 0,
      moveInputCache: { direction: 0, power: 0 },
      pendingMoveInput: null,
    });

    const updateArrow = useCallback(() => {
      const state = stateRef.current;
      const container = state.container;
      const directionContainer = directionContainerRef.current;
      const arrow = arrowRef.current;

      if (!container || !directionContainer || !arrow) {
        return;
      }

      // Always keep arrow container attached to player
      directionContainer.x = container.x;
      directionContainer.y = container.y;

      if (!state.isPointerDown) {
        return;
      }

      const { pointerClientX, pointerClientY, from, to } = state;

      // Origin of the arrow – current player position
      from.copyFrom(container);

      // Pointer position in world space
      to.copyFrom(viewport.toWorld(pointerClientX, pointerClientY));

      let length = to.distanceTo(from);

      if (length > ARROW_MAX_DISTANCE) {
        length = ARROW_MAX_DISTANCE;
        to.subInPlace(from)
          .normalizeInPlace()
          .scaleInPlace(ARROW_MAX_DISTANCE)
          .addInPlace(from);
      } else if (length < ARROW_MIN_DISTANCE) {
        length = ARROW_MIN_DISTANCE;
        to.subInPlace(from)
          .normalizeInPlace()
          .scaleInPlace(ARROW_MIN_DISTANCE)
          .addInPlace(from);
      }

      const power = MathOps.clamp01(length / ARROW_MAX_DISTANCE);
      const angle = MathOps.atan2(to.y - from.y, to.x - from.x);

      state.lookAtDirection = angle;
      state.moveInputCache.direction = angle;
      state.moveInputCache.power = power;

      arrow.width = Math.max(ARROW_MIN_DISTANCE, length);
      directionContainer.rotation = angle;
    }, [viewport]);

    useImperativeHandle(
      ref,
      () => ({
        onTransformUpdated(container: Container) {
          // Save latest container (position + rotation)
          stateRef.current.container = container;
          // Recalculate arrow from current player position and last pointer position
          updateArrow();
        },
      }),
      [updateArrow]
    );

    useEffect(() => {
      if (arrowGradientRef.current && arrowRef.current) {
        arrowGradientRef.current.mask = arrowRef.current;
      }
    }, []);

    useEffect(() => {
      const bodySprite = bodySpriteRef.current;
      const directionContainer = directionContainerRef.current;
      const arrow = arrowRef.current;

      if (!bodySprite || !directionContainer || !arrow) {
        return;
      }

      const state = stateRef.current;

      const onPointerDown = (e: FederatedPointerEvent) => {
        state.isPointerDown = true;
        state.pointerClientX = e.clientX;
        state.pointerClientY = e.clientY;

        directionContainer.visible = true;

        // First update with current transform + pointer
        updateArrow();
      };

      const onPointerMove = (e: FederatedPointerEvent) => {
        if (!state.isPointerDown) {
          return;
        }

        state.pointerClientX = e.clientX;
        state.pointerClientY = e.clientY;

        updateArrow();
      };

      const onPointerUp = () => {
        if (!state.isPointerDown) {
          return;
        }

        state.isPointerDown = false;
        directionContainer.visible = false;
        state.pendingMoveInput = { ...state.moveInputCache };
      };

      bodySprite.on('pointerdown', onPointerDown);
      bodySprite.on('pointermove', onPointerMove);
      bodySprite.on('pointerup', onPointerUp);
      bodySprite.on('pointerupoutside', onPointerUp);

      app.renderer.canvas.addEventListener('pointermove', onPointerMove as any);
      app.renderer.canvas.addEventListener('pointerup', onPointerUp as any);

      return () => {
        bodySprite.off('pointerdown', onPointerDown);
        bodySprite.off('pointermove', onPointerMove);
        bodySprite.off('pointerup', onPointerUp);
        bodySprite.off('pointerupoutside', onPointerUp);

        app.renderer.canvas.removeEventListener('pointermove', onPointerMove as any);
        app.renderer.canvas.removeEventListener('pointerup', onPointerUp as any);
      };
    }, [app, bodySpriteRef, updateArrow]);

    useEffect(() => {
      const state = stateRef.current;

      const unsubscribe = runner.InputProviderInstance.drainInputs((addRPC) => {
        if (state.prevLookAtDirection !== state.lookAtDirection) {
          addRPC(LookAt, { direction: toFloat32(-state.lookAtDirection) });
          state.prevLookAtDirection = state.lookAtDirection;
        }

        if (state.pendingMoveInput) {
          addRPC(Move, {
            direction: toFloat32(-state.pendingMoveInput.direction),
            speed: toFloat32(state.pendingMoveInput.power),
          });
          state.pendingMoveInput = null;
        }
      });

      return () => {
        unsubscribe();
      };
    }, [runner.InputProviderInstance]);

    return (
      <pixiContainer ref={directionContainerRef} visible={false}>
        <pixiSprite
          ref={arrowGradientRef}
          interactive={false}
          eventMode={'none'}
          anchor={{ x: 0, y: 0.5 }}
          scale={0.5}
          texture={Assets.get(ARROW_GRADIENT)}
        />
        <pixiSprite
          ref={arrowRef}
          interactive={false}
          eventMode={'none'}
          anchor={{ x: 0, y: 0.5 }}
          scale={0.5}
          texture={Assets.get(ARROW)}
        />
      </pixiContainer>
    );
  }
);
