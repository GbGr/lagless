import { Graphics } from 'pixi.js';

export function createGridLayer(width: number, height: number, gridSize: number): Graphics {
  const g = new Graphics();
  const color = 0x000000;
  const alpha = 0.15;

  for (let x = 0; x <= width; x += gridSize) {
    g.moveTo(x, 0).lineTo(x, height).stroke({ color, alpha, width: 0.05 });
  }
  for (let y = 0; y <= height; y += gridSize) {
    g.moveTo(0, y).lineTo(width, y).stroke({ color, alpha, width: 0.05 });
  }

  return g;
}
