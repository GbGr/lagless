import { FC, useCallback, useEffect, useRef } from 'react';
import { Graphics } from 'pixi.js';
import { useRunner, pendingShootRef } from './runner-provider';
import {
  GravityPongArena,
  MatchState,
  Ball, BallFilter, Transform2d,
  PlayerResource,
} from '@lagless/gravity-pong-simulation';
import { PlayerResources, LocalInputProvider } from '@lagless/core';
import { RelayInputProvider } from '@lagless/relay-client';

interface DragState {
  active: boolean;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

export const AimView: FC = () => {
  const runner = useRunner();
  const graphicsRef = useRef<Graphics>(null);
  const dragRef = useRef<DragState>({ active: false, startX: 0, startY: 0, currentX: 0, currentY: 0 });

  const localSlot = useRef(0);

  useEffect(() => {
    const ip = runner.InputProviderInstance;
    if (ip instanceof RelayInputProvider) {
      localSlot.current = ip.playerSlot;
    } else {
      localSlot.current = 0;
    }
  }, [runner]);

  const getBallPosition = useCallback(() => {
    const pr = runner.DIContainer.resolve(PlayerResources);
    const slot = localSlot.current;
    const playerResource = pr.get(PlayerResource, slot);
    const ballEntity = playerResource.safe.ballEntity;
    const transform2d = runner.DIContainer.resolve(Transform2d);
    return {
      x: transform2d.unsafe.positionX[ballEntity],
      y: transform2d.unsafe.positionY[ballEntity],
    };
  }, [runner]);

  useEffect(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;

    const getSimCoords = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      // Simple 1:1 mapping for now — scaling handled by container transform
      const x = (e.clientX - rect.left) * (GravityPongArena.width / rect.width);
      const y = (e.clientY - rect.top) * (GravityPongArena.height / rect.height);
      return { x, y };
    };

    const onPointerDown = (e: PointerEvent) => {
      const matchState = runner.DIContainer.resolve(MatchState);
      if (matchState.safe.phase !== 1) return;

      const pr = runner.DIContainer.resolve(PlayerResources);
      const slot = localSlot.current;
      const playerResource = pr.get(PlayerResource, slot);
      if (playerResource.safe.hasShot === 1) return;

      const coords = getSimCoords(e);
      dragRef.current = { active: true, startX: coords.x, startY: coords.y, currentX: coords.x, currentY: coords.y };
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!dragRef.current.active) return;
      const coords = getSimCoords(e);
      dragRef.current.currentX = coords.x;
      dragRef.current.currentY = coords.y;
    };

    const onPointerUp = () => {
      if (!dragRef.current.active) return;
      const drag = dragRef.current;
      dragRef.current = { active: false, startX: 0, startY: 0, currentX: 0, currentY: 0 };

      const dx = drag.startX - drag.currentX;
      const dy = drag.startY - drag.currentY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 5) return; // Too small

      const angle = Math.atan2(dy, dx);
      const power = Math.min(dist / 60, GravityPongArena.maxShootPower);
      const clampedPower = Math.max(GravityPongArena.minShootPower, power);

      pendingShootRef.current = { angle, power: clampedPower };
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerUp);

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointerleave', onPointerUp);
    };
  }, [runner, getBallPosition]);

  // Draw aim line each frame
  useEffect(() => {
    const handler = () => {
      const g = graphicsRef.current;
      if (!g) return;
      g.clear();

      const matchState = runner.DIContainer.resolve(MatchState);
      if (matchState.safe.phase !== 1) return;

      const pr = runner.DIContainer.resolve(PlayerResources);
      const slot = localSlot.current;
      const playerResource = pr.get(PlayerResource, slot);
      if (playerResource.safe.hasShot === 1) return;

      const drag = dragRef.current;
      if (!drag.active) return;

      const ballPos = getBallPosition();
      const dx = drag.startX - drag.currentX;
      const dy = drag.startY - drag.currentY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 3) return;

      // Direction line (from ball in shoot direction)
      const nx = dx / dist;
      const ny = dy / dist;
      const power = Math.min(dist / 60, GravityPongArena.maxShootPower);
      const lineLen = power * 25;

      // Draw drag line (from ball toward aim direction)
      g.moveTo(ballPos.x, ballPos.y);
      g.lineTo(ballPos.x + nx * lineLen, ballPos.y + ny * lineLen);
      g.stroke({ color: 0xffffff, width: 2, alpha: 0.6 });

      // Dotted direction dots
      for (let i = 0; i < 5; i++) {
        const t = lineLen + 10 + i * 12;
        g.circle(ballPos.x + nx * t, ballPos.y + ny * t, 2);
        g.fill({ color: 0xffffff, alpha: 0.3 - i * 0.05 });
      }

      // Power indicator circle at ball
      g.circle(ballPos.x, ballPos.y, 3 + power * 2);
      g.stroke({ color: 0xffffff, width: 1, alpha: 0.3 });
    };

    return runner.Simulation.addTickHandler(handler);
  }, [runner, getBallPosition]);

  return <pixiGraphics ref={graphicsRef} />;
};
