import { MathOps } from '@lagless/math';
import type { IMapFeature, GenerationContext } from '../types/feature.js';
import { FeatureId } from '../types/feature.js';
import type { ObjectPlacementConfig, ObjectPlacementOutput } from '../types/feature-configs.js';
import { PlacementKind } from '../types/feature-configs.js';
import type { LocationStage, FixedStage, RandomStage, DensityStage, ShoreOutput, GrassOutput, RiverOutput, LakeOutput } from '../types/feature-configs.js';
import { ShoreFeature } from './shore-feature.js';
import { GrassFeature } from './grass-feature.js';
import { RiverFeature } from './river-feature.js';
import { LakeFeature } from './lake-feature.js';
import type { PlacedObject } from '../types/placed-object.js';
import { TerrainZone } from '../types/placed-object.js';
import type { MapObjectDef, MapObjectRegistry } from '../types/object-def.js';
import type { MapCollisionShape } from '../types/geometry.js';
import { ShapeType } from '../types/geometry.js';
import { TerrainQuery } from '../core/terrain-query.js';

const MAX_ATTEMPTS_NORMAL = 500;
const MAX_ATTEMPTS_IMPORTANT = 5000;
const AREA_DENOMINATOR = 250000;
const DEFAULT_ORIENTATIONS: readonly number[] = [0];

export class ObjectPlacementFeature implements IMapFeature<ObjectPlacementConfig, ObjectPlacementOutput> {
  static readonly id = FeatureId.ObjectPlacement;
  readonly id = FeatureId.ObjectPlacement;
  readonly requires: readonly FeatureId[] = [FeatureId.Shore, FeatureId.Grass];

  generate(ctx: GenerationContext, config: ObjectPlacementConfig): ObjectPlacementOutput {
    const objects: PlacedObject[] = [];

    const terrainQuery = new TerrainQuery({
      shore: ctx.hasFeature(FeatureId.Shore) ? ctx.get<ShoreOutput>(ShoreFeature) : undefined,
      grass: ctx.hasFeature(FeatureId.Grass) ? ctx.get<GrassOutput>(GrassFeature) : undefined,
      river: ctx.hasFeature(FeatureId.River) ? ctx.get<RiverOutput>(RiverFeature) : undefined,
      lake: ctx.hasFeature(FeatureId.Lake) ? ctx.get<LakeOutput>(LakeFeature) : undefined,
    });

    for (const stage of config.stages) {
      switch (stage.kind) {
        case PlacementKind.Location:
          placeLocation(ctx, config.registry, stage, objects, terrainQuery);
          break;
        case PlacementKind.Fixed:
          placeFixed(ctx, config.registry, stage, objects, terrainQuery);
          break;
        case PlacementKind.Random:
          placeRandom(ctx, config.registry, stage, objects, terrainQuery);
          break;
        case PlacementKind.Density:
          placeDensity(ctx, config.registry, stage, objects, terrainQuery);
          break;
      }
    }

    return { objects };
  }
}

function matchesZone(terrainQuery: TerrainQuery, x: number, y: number, zone?: TerrainZone): boolean {
  if (zone == null) return true;
  return terrainQuery.classify(x, y) === zone;
}

function matchesZoneCorners(
  terrainQuery: TerrainQuery, x: number, y: number, zone: TerrainZone,
  bounds: PlacementBounds, scale: number,
): boolean {
  const hw = bounds.halfWidth * scale;
  const hh = bounds.halfHeight * scale;
  const cx = x + bounds.centerX * scale;
  const cy = y + bounds.centerY * scale;

  return terrainQuery.classify(cx - hw, cy - hh) === zone
    && terrainQuery.classify(cx + hw, cy - hh) === zone
    && terrainQuery.classify(cx - hw, cy + hh) === zone
    && terrainQuery.classify(cx + hw, cy + hh) === zone;
}

export interface PlacementBounds {
  readonly halfWidth: number;
  readonly halfHeight: number;
  readonly centerX: number;
  readonly centerY: number;
}

export function computePlacementBounds(def: MapObjectDef): PlacementBounds | undefined {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let count = 0;

  for (const collider of def.colliders) {
    if (collider.isSensor && !def.includeSensorsInBounds) continue;
    count++;

    const ox = collider.offsetX ?? 0;
    const oy = collider.offsetY ?? 0;

    if (collider.shape.type === ShapeType.Circle) {
      const r = collider.shape.radius;
      minX = Math.min(minX, ox - r);
      minY = Math.min(minY, oy - r);
      maxX = Math.max(maxX, ox + r);
      maxY = Math.max(maxY, oy + r);
    } else {
      const hw = collider.shape.halfWidth;
      const hh = collider.shape.halfHeight;
      minX = Math.min(minX, ox - hw);
      minY = Math.min(minY, oy - hh);
      maxX = Math.max(maxX, ox + hw);
      maxY = Math.max(maxY, oy + hh);
    }
  }

  if (count === 0) return undefined;

  return {
    halfWidth: (maxX - minX) / 2,
    halfHeight: (maxY - minY) / 2,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

function placeLocation(
  ctx: GenerationContext,
  registry: MapObjectRegistry,
  stage: LocationStage,
  objects: PlacedObject[],
  terrainQuery: TerrainQuery,
): void {
  const def = registry.get(stage.typeId);
  if (!def) return;

  const bounds = computePlacementBounds(def);
  const maxAttempts = stage.maxAttempts ?? MAX_ATTEMPTS_IMPORTANT;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const angle = ctx.random.getFloat() * Math.PI * 2;
    const dist = ctx.random.getFloat() * stage.rad;
    const x = stage.pos.x + MathOps.cos(angle) * dist;
    const y = stage.pos.y + MathOps.sin(angle) * dist;

    const placed = tryPlace(ctx, def, x, y, objects, terrainQuery, bounds);
    if (placed) return;
  }

  if (stage.optional) return;
  tryPlace(ctx, def, stage.pos.x, stage.pos.y, objects, terrainQuery, bounds);
}

function placeFixed(
  ctx: GenerationContext,
  registry: MapObjectRegistry,
  stage: FixedStage,
  objects: PlacedObject[],
  terrainQuery: TerrainQuery,
): void {
  const def = registry.get(stage.typeId);
  if (!def) return;

  const bounds = computePlacementBounds(def);
  const maxAttempts = stage.important ? MAX_ATTEMPTS_IMPORTANT : MAX_ATTEMPTS_NORMAL;

  for (let i = 0; i < stage.count; i++) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const x = ctx.random.getFloat() * ctx.width;
      const y = ctx.random.getFloat() * ctx.height;

      if (!matchesZone(terrainQuery, x, y, stage.terrainZone)) continue;
      if (tryPlace(ctx, def, x, y, objects, terrainQuery, bounds, stage.terrainZone)) break;
    }
  }
}

function placeRandom(
  ctx: GenerationContext,
  registry: MapObjectRegistry,
  stage: RandomStage,
  objects: PlacedObject[],
  terrainQuery: TerrainQuery,
): void {
  const chosen = chooseN(ctx, stage.spawns, stage.choose);

  for (const typeId of chosen) {
    const def = registry.get(typeId);
    if (!def) continue;

    const bounds = computePlacementBounds(def);

    for (let attempt = 0; attempt < MAX_ATTEMPTS_NORMAL; attempt++) {
      const x = ctx.random.getFloat() * ctx.width;
      const y = ctx.random.getFloat() * ctx.height;

      if (!matchesZone(terrainQuery, x, y, stage.terrainZone)) continue;
      if (tryPlace(ctx, def, x, y, objects, terrainQuery, bounds, stage.terrainZone)) break;
    }
  }
}

function placeDensity(
  ctx: GenerationContext,
  registry: MapObjectRegistry,
  stage: DensityStage,
  objects: PlacedObject[],
  terrainQuery: TerrainQuery,
): void {
  const def = registry.get(stage.typeId);
  if (!def) return;

  const bounds = computePlacementBounds(def);
  const mapArea = ctx.width * ctx.height;
  const count = Math.round(stage.density * (mapArea / AREA_DENOMINATOR));

  for (let i = 0; i < count; i++) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS_NORMAL; attempt++) {
      const x = ctx.random.getFloat() * ctx.width;
      const y = ctx.random.getFloat() * ctx.height;

      if (!matchesZone(terrainQuery, x, y, stage.terrainZone)) continue;
      if (tryPlace(ctx, def, x, y, objects, terrainQuery, bounds, stage.terrainZone)) break;
    }
  }
}

function tryPlace(
  ctx: GenerationContext,
  def: MapObjectDef,
  x: number,
  y: number,
  objects: PlacedObject[],
  terrainQuery: TerrainQuery,
  bounds: PlacementBounds | undefined,
  terrainZone?: TerrainZone,
): boolean {
  const scale = def.scaleRange[0] + ctx.random.getFloat() * (def.scaleRange[1] - def.scaleRange[0]);
  const orientations = def.orientations ?? DEFAULT_ORIENTATIONS;
  const ori = orientations[ctx.random.getRandomInt(0, orientations.length)];
  if (bounds) {
    const collisionX = x + bounds.centerX * scale;
    const collisionY = y + bounds.centerY * scale;
    const collisionShape: MapCollisionShape = {
      type: ShapeType.Cuboid,
      halfWidth: bounds.halfWidth * scale,
      halfHeight: bounds.halfHeight * scale,
    };
    if (ctx.collision.testShape(collisionShape, collisionX, collisionY, ori, 1)) {
      return false;
    }

    // Corner terrain check: all 4 AABB corners must match the required zone
    if (terrainZone != null && !matchesZoneCorners(terrainQuery, x, y, terrainZone, bounds, scale)) {
      return false;
    }

    ctx.collision.addShape(objects.length, collisionShape, collisionX, collisionY, ori, 1);
  }

  const zone = terrainQuery.classify(x, y);

  const children: PlacedObject[] = [];
  if (def.children) {
    for (const childDef of def.children) {
      const childX = x + childDef.offset.x * scale;
      const childY = y + childDef.offset.y * scale;
      const childOri = childDef.inheritOri ? ori + childDef.ori : childDef.ori;

      children.push({
        typeId: childDef.typeId,
        posX: childX,
        posY: childY,
        rotation: childOri,
        scale: childDef.scale * scale,
        terrainZone: terrainQuery.classify(childX, childY),
        children: [],
      });
    }
  }

  objects.push({
    typeId: def.typeId,
    posX: x,
    posY: y,
    rotation: ori,
    scale,
    terrainZone: zone,
    children,
  });

  return true;
}

function chooseN<T>(ctx: GenerationContext, items: T[], n: number): T[] {
  if (n >= items.length) return [...items];

  const available = [...items];
  const result: T[] = [];

  for (let i = 0; i < n; i++) {
    const idx = ctx.random.getRandomInt(0, available.length);
    result.push(available[idx]);
    available.splice(idx, 1);
  }

  return result;
}
