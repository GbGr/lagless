import type { Graphics } from 'pixi.js';
import type { ReadonlyVec2 } from '@lagless/2d-map-generator';

export function drawPolygon(g: Graphics, points: readonly ReadonlyVec2[]): Graphics {
  if (points.length < 3) return g;
  g.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    g.lineTo(points[i].x, points[i].y);
  }
  g.closePath();
  return g;
}

export function drawPolygonHole(g: Graphics, points: readonly ReadonlyVec2[]): Graphics {
  if (points.length < 3) return g;
  // Draw in reverse winding to create a hole via even-odd fill rule
  g.moveTo(points[points.length - 1].x, points[points.length - 1].y);
  for (let i = points.length - 2; i >= 0; i--) {
    g.lineTo(points[i].x, points[i].y);
  }
  g.closePath();
  return g;
}
