import { MathOps } from '@lagless/math';
import type { IMapFeature, GenerationContext } from '../types/feature.js';
import { FeatureId } from '../types/feature.js';
import type { RiverConfig, RiverOutput } from '../types/feature-configs.js';
import type { ReadonlyVec2 } from '../types/geometry.js';
import type { GeneratedRiver } from '../types/generated-river.js';
import { generateRiverPolygon } from '../math/river-polygon.js';

export class RiverFeature implements IMapFeature<RiverConfig, RiverOutput> {
  static readonly id = FeatureId.River;
  readonly id = FeatureId.River;
  readonly requires: readonly FeatureId[] = [];

  generate(ctx: GenerationContext, config: RiverConfig): RiverOutput {
    const widths = selectWeightedWidths(ctx, config.weights);
    const rivers: GeneratedRiver[] = [];

    for (const waterWidth of widths) {
      const splinePoints = generateRiverPoints(
        ctx,
        config.subdivisionPasses,
        config.masks,
      );

      if (splinePoints.length < 2) continue;

      const shoreWidth = Math.max(4, Math.min(8, waterWidth * 0.75));

      const river = generateRiverPolygon({
        splinePoints,
        waterWidth,
        shoreWidth,
        looped: false,
        mapWidth: ctx.width,
        mapHeight: ctx.height,
      });

      rivers.push(river);
    }

    return {
      rivers,
      normalRivers: rivers,
    };
  }
}

function selectWeightedWidths(
  ctx: GenerationContext,
  weights: RiverConfig['weights'],
): number[] {
  if (weights.length === 0) return [];

  let totalWeight = 0;
  for (const w of weights) {
    totalWeight += w.weight;
  }

  let roll = ctx.random.getFloat() * totalWeight;
  for (const w of weights) {
    roll -= w.weight;
    if (roll <= 0) {
      return w.widths;
    }
  }

  return weights[weights.length - 1].widths;
}

function generateRiverPoints(
  ctx: GenerationContext,
  subdivisionPasses: number,
  masks: RiverConfig['masks'],
): ReadonlyVec2[] {
  const { width, height, random } = ctx;

  const edge = random.getRandomInt(0, 4);
  let start: ReadonlyVec2;
  let end: ReadonlyVec2;

  switch (edge) {
    case 0:
      start = { x: 0, y: random.getFloat() * height };
      end = { x: width, y: random.getFloat() * height };
      break;
    case 1:
      start = { x: width, y: random.getFloat() * height };
      end = { x: 0, y: random.getFloat() * height };
      break;
    case 2:
      start = { x: random.getFloat() * width, y: 0 };
      end = { x: random.getFloat() * width, y: height };
      break;
    default:
      start = { x: random.getFloat() * width, y: height };
      end = { x: random.getFloat() * width, y: 0 };
      break;
  }

  let points: ReadonlyVec2[] = [start, end];

  for (let pass = 0; pass < subdivisionPasses; pass++) {
    const newPoints: ReadonlyVec2[] = [points[0]];

    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];

      const mx = (a.x + b.x) * 0.5;
      const my = (a.y + b.y) * 0.5;

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = MathOps.sqrt(dx * dx + dy * dy);

      const perpX = dist > 0 ? -dy / dist : 0;
      const perpY = dist > 0 ? dx / dist : 0;

      const offset = (random.getFloat() * 2 - 1) * (dist / 7);

      const midpoint: ReadonlyVec2 = {
        x: mx + perpX * offset,
        y: my + perpY * offset,
      };

      newPoints.push(midpoint);
      newPoints.push(b);
    }

    points = newPoints;
  }

  if (masks.length > 0) {
    points = filterMaskedPoints(points, masks);
  }

  return points;
}

function filterMaskedPoints(
  points: ReadonlyVec2[],
  masks: RiverConfig['masks'],
): ReadonlyVec2[] {
  if (points.length <= 2) return points;

  const filtered: ReadonlyVec2[] = [points[0]];

  for (let i = 1; i < points.length - 1; i++) {
    const pt = points[i];
    let masked = false;

    for (const mask of masks) {
      const cx = mask.pos ? mask.pos.x : 0;
      const cy = mask.pos ? mask.pos.y : 0;
      const dx = pt.x - cx;
      const dy = pt.y - cy;
      if (dx * dx + dy * dy < mask.rad * mask.rad) {
        masked = true;
        break;
      }
    }

    if (!masked) {
      filtered.push(pt);
    }
  }

  filtered.push(points[points.length - 1]);
  return filtered;
}
