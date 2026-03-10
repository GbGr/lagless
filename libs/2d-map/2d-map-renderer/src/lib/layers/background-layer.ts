import { Graphics } from 'pixi.js';

export function createBackgroundLayer(width: number, height: number, color: number): Graphics {
  const g = new Graphics();
  g.rect(0, 0, width, height).fill({ color });
  return g;
}
