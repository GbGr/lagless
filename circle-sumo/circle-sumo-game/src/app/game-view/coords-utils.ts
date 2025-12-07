// world-coords.ts
import { IVector2Like, Vector2 } from '@lagless/math';
import type { Viewport } from 'pixi-viewport';

export function simToRender(
  simX: number,
  simY: number,
  worldRotation: number,
): Vector2 {
  const c = Math.cos(worldRotation);
  const s = Math.sin(worldRotation);

  // Поворот в экранное пространство (то, в котором живёт PlayerWorld)
  return new Vector2(
    simX * c - simY * s,
    simX * s + simY * c,
  );
}

export function renderToSim(
  renderX: number,
  renderY: number,
  worldRotation: number,
): Vector2 {
  const c = Math.cos(-worldRotation);
  const s = Math.sin(-worldRotation);

  // Обратный поворот: из повёрнутого мира обратно в координаты симуляции
  return new Vector2(
    renderX * c - renderY * s,
    renderX * s + renderY * c,
  );
}

// Экран → симуляция: pointer (clientX, clientY) → sim-space
export function screenToSim(
  viewport: Viewport,
  worldRotation: number,
  clientX: number,
  clientY: number,
): Vector2 {
  // Точка в "render-world" координатах viewport-а
  const worldPoint = viewport.toWorld(clientX, clientY);

  // Разворачиваем поворот PlayerWorld
  return renderToSim(worldPoint.x, worldPoint.y, worldRotation);
}

// Угол в симуляции -> угол для рендера (учитывая поворот PlayerWorld)
export function simAngleToRender(simAngle: number, worldRotation: number): number {
  return simAngle + worldRotation;
}

// Угол из рендера -> угол для симуляции
export function renderAngleToSim(renderAngle: number, worldRotation: number): number {
  return renderAngle - worldRotation;
}

export function computeCameraCenterForLocalPlayer(
  playerSimPos: IVector2Like,
  viewport: Viewport,
  worldRotation: number,
  desiredScreenX: number,
  desiredScreenY: number,
  ref: IVector2Like
) {
  const playerRenderPos = simToRender(playerSimPos.x, playerSimPos.y, worldRotation);

  const screenCenterX = viewport.screenWidth / 2;
  const screenCenterY = viewport.screenHeight / 2;

  const offsetScreenX = desiredScreenX - screenCenterX;
  const offsetScreenY = desiredScreenY - screenCenterY;

  const scaleX = viewport.scale.x;
  const scaleY = viewport.scale.y;

  ref.x = playerRenderPos.x - offsetScreenX / scaleX;
  ref.y = playerRenderPos.y - offsetScreenY / scaleY;
}
