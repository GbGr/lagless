import { useApplication } from '@pixi/react';
import { Assets, Container, FederatedPointerEvent, Sprite } from 'pixi.js';
import { forwardRef, RefObject, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { useViewport } from '../viewport-provider';
import { useRunner } from '../runner-provider';
import { MathOps, Vector2 } from '@lagless/math';
import { LookAt, Move } from '@lagless/circle-sumo-simulation';
import { IAbstractInputConstructor, InputData } from '@lagless/core';
import { toFloat32 } from '@lagless/binary';
import ARROW from '../../../assets/textures/ARROW.png';
import ARROW_GRADIENT from '../../../assets/textures/ARROW_GRADIENT.png';
import { usePlayerWorldRotation } from '../player-world';

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
  lookAtDirection: number; // angle in sim-space
  moveInputCache: { direction: number; power: number }; // direction in sim-space
  pendingMoveInput: { direction: number; power: number } | null;
};

export const DirectionArrowView = forwardRef<
  DirectionArrowHandle,
  { bodySpriteRef: RefObject<Sprite> }
>(({ bodySpriteRef }, ref) => {
  const { app } = useApplication();
  const viewport = useViewport();
  const runner = useRunner();
  // Ref with PlayerWorld.rotation (worldRotation), updated outside
  const worldRotationRef = usePlayerWorldRotation();

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

    // Keep arrow container attached to player in render-space (PlayerWorld local space)
    directionContainer.x = container.x;
    directionContainer.y = container.y;

    if (!state.isPointerDown) {
      return;
    }

    const { pointerClientX, pointerClientY, from, to } = state;

    // Player position in sim-space:
    // container.x/y are local to PlayerWorld, and PlayerWorld is rotated,
    // so container.x/y are exactly sim coordinates.
    from.setInPlace(container.x, container.y);

    // Pointer in viewport world-space (root container of viewport)
    const worldPoint = viewport.toWorld(pointerClientX, pointerClientY);

    // Convert pointer from viewport world-space into sim-space by undoing PlayerWorld rotation.
    const worldRotation = worldRotationRef.current ?? 0;
    const invRot = -worldRotation;
    const cosR = MathOps.cos(invRot);
    const sinR = MathOps.sin(invRot);

    const simPointerX = worldPoint.x * cosR - worldPoint.y * sinR;
    const simPointerY = worldPoint.x * sinR + worldPoint.y * cosR;

    // Pointer position in sim-space
    to.setInPlace(simPointerX, simPointerY);

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

    // Angle in sim-space (physics / RPC space)
    const angleSim = MathOps.atan2(to.y - from.y, to.x - from.x);

    state.lookAtDirection = angleSim;
    state.moveInputCache.direction = angleSim;
    state.moveInputCache.power = power;

    // Visual part:
    // directionContainer is in PlayerWorld local space,
    // so its local rotation should be equal to sim angle.
    arrow.width = Math.max(ARROW_MIN_DISTANCE, length);
    directionContainer.rotation = angleSim;
  }, [viewport, worldRotationRef]);

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

    const canvas = app.renderer.canvas;

    canvas.addEventListener('pointerdown', onPointerDown as any);
    canvas.addEventListener('pointermove', onPointerMove as any);
    canvas.addEventListener('pointerup', onPointerUp as any);

    return () => {
      bodySprite.off('pointerdown', onPointerDown);
      bodySprite.off('pointermove', onPointerMove);
      bodySprite.off('pointerup', onPointerUp);
      bodySprite.off('pointerupoutside', onPointerUp);

      canvas.removeEventListener('pointerdown', onPointerDown as any);
      canvas.removeEventListener('pointermove', onPointerMove as any);
      canvas.removeEventListener('pointerup', onPointerUp as any);
    };
  }, [app, bodySpriteRef, updateArrow]);

  useEffect(() => {
    const state = stateRef.current;

    const unsubscribe = runner.InputProviderInstance.drainInputs((addRPC: <T extends IAbstractInputConstructor>(ctor: T, data: InputData<InstanceType<T>>) => void) => {
      // state.lookAtDirection is angle in sim-space,
      // keep the original sign convention with minus if your sim expects it.
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
});
