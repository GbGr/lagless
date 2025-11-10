import { useApplication, useExtend } from '@pixi/react';
import { Assets, Container, Sprite, Texture, FederatedPointerEvent } from 'pixi.js';
import { createContext, FC, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { VirtualJoystickCtx } from './virtual-joystick-ctx';
import joystickUrl from './textures/joystick.png';
import joystickHandleUrl from './textures/joystick-handle.png';

interface VirtualJoystickAssets {
  joystick: Texture;
  joystickHandle: Texture;
}

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const VirtualJoystickContext = createContext<VirtualJoystickCtx>(null!);

export const useVirtualJoystick = () => {
  return useContext(VirtualJoystickContext);
};

export const loadVirtualJoystickAssets = async (): Promise<VirtualJoystickAssets> => {
  await Assets.load([joystickUrl, joystickHandleUrl]);
  return {
    joystick: Assets.get(joystickUrl) as Texture,
    joystickHandle: Assets.get(joystickHandleUrl) as Texture,
  };
};

export const VirtualJoystickProvider: FC<{ children: ReactNode }> = ({ children }) => {
  useExtend({ Container, Sprite });

  const ctx = useMemo(() => new VirtualJoystickCtx(), []);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const [assets, setAssets] = useState<VirtualJoystickAssets>(null!);

  useEffect(() => {
    loadVirtualJoystickAssets().then(setAssets, console.error);
  }, []);

  if (!assets) return null;

  return (
    <>
      <VirtualJoystickContext.Provider value={ctx}>{children}</VirtualJoystickContext.Provider>
      <VirtualJoystick ctx={ctx} assets={assets} />
    </>
  );
};

const joystickScale = 0.5;

const VirtualJoystick: FC<{ ctx: VirtualJoystickCtx; assets: VirtualJoystickAssets }> = ({ ctx, assets }) => {
  const { app } = useApplication();

  const [handleOffset, setHandleOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const joystickSize = useMemo(() => assets.joystick.width * joystickScale, [assets.joystick]);
  const handleSize = useMemo(() => assets.joystickHandle.width * joystickScale, [assets.joystickHandle]);

  const maxOffset = useMemo(
    () => (joystickSize - handleSize / 2) / 2,
    [joystickSize, handleSize],
  );

  const getCanvasDOMRect = useCallback(
    () => app.renderer.canvas.getBoundingClientRect(),
    [app],
  );

  const [canvasDOMRect, setCanvasDOMRect] = useState<DOMRect>(() => getCanvasDOMRect());

  useEffect(() => {
    const canvas = app.renderer.canvas as HTMLCanvasElement;

    const resizeObserver = new ResizeObserver(() => {
      setCanvasDOMRect(getCanvasDOMRect());
    });

    resizeObserver.observe(canvas);

    return () => {
      resizeObserver.unobserve(canvas);
    };
  }, [app, getCanvasDOMRect]);

  const isDraggingRef = useRef(false);

  const updateFromPointer = useCallback(
    (event: FederatedPointerEvent) => {
      const container = event.currentTarget as Container;
      const localPos = event.getLocalPosition(container);

      const centerX = joystickSize / 2;
      const centerY = joystickSize / 2;

      let dx = localPos.x - centerX;
      let dy = localPos.y - centerY;

      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > maxOffset && distance > 0) {
        const k = maxOffset / distance;
        dx *= k;
        dy *= k;
      }

      setHandleOffset({ x: dx, y: dy });

      const radius = maxOffset > 0 ? maxOffset : 1;
      const axisX = dx / radius;
      const axisY = -dy / radius;

      const power = Math.min(Math.sqrt(axisX * axisX + axisY * axisY), 1);

      const direction = power > 0 ? Math.atan2(axisY, axisX) : 0;

      ctx.setAxis(axisX, axisY);
      ctx.setPower(power);
      ctx.setDirection(direction);
    },
    [ctx, joystickSize, maxOffset],
  );

  const resetJoystick = useCallback(() => {
    isDraggingRef.current = false;
    setHandleOffset({ x: 0, y: 0 });

    // Reset context state
    ctx.setAxis(0, 0);
    ctx.setPower(0);
    ctx.setDirection(0);
  }, [ctx]);

  const handlePointerDown = useCallback(
    (event: FederatedPointerEvent) => {
      isDraggingRef.current = true;
      updateFromPointer(event);
    },
    [updateFromPointer],
  );

  const handlePointerMove = useCallback(
    (event: FederatedPointerEvent) => {
      if (!isDraggingRef.current) return;
      updateFromPointer(event);
    },
    [ updateFromPointer],
  );

  const handlePointerUp = useCallback(
    (_event: FederatedPointerEvent) => {
      resetJoystick();
    },
    [resetJoystick],
  );

  return (
    <pixiContainer
      x={canvasDOMRect.width / 2 - joystickSize / 2}
      y={canvasDOMRect.height - joystickSize - canvasDOMRect.height * 0.1}
      eventMode="static"
      onPointerDown={handlePointerDown}
      onGlobalPointerMove={handlePointerMove}
      onPointerUpOutside={handlePointerUp}
      onPointerUp={handlePointerUp}
    >
      {/* Joystick background */}
      <pixiSprite scale={joystickScale} texture={assets.joystick} />

      {/* Handle centered plus offset */}
      <pixiContainer
        x={joystickSize / 2 - handleSize / 2 + handleOffset.x}
        y={joystickSize / 2 - handleSize / 2 + handleOffset.y}
      >
        <pixiSprite scale={joystickScale} texture={assets.joystickHandle} />
      </pixiContainer>
    </pixiContainer>
  );
};
