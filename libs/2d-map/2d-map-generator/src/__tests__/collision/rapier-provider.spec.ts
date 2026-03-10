import { describe, it, expect, beforeAll } from 'vitest';
import RAPIER from '@lagless/rapier2d-deterministic-compat';
import { RapierCollisionProvider } from '../../lib/collision/rapier-provider.js';
import { ShapeType } from '../../lib/types/geometry.js';

beforeAll(async () => {
  await RAPIER.init();
});

describe('RapierCollisionProvider', () => {
  it('should create sensor collider via addShape', () => {
    const provider = new RapierCollisionProvider(RAPIER);
    provider.addShape(0, { type: ShapeType.Circle, radius: 5 }, 10, 10, 0, 1);
    provider.clear();
  });

  it('should detect overlapping shapes', () => {
    const provider = new RapierCollisionProvider(RAPIER);
    provider.addShape(0, { type: ShapeType.Circle, radius: 10 }, 50, 50, 0, 1);

    const overlaps = provider.testShape({ type: ShapeType.Circle, radius: 10 }, 55, 55, 0, 1);
    expect(overlaps).toBe(true);
    provider.clear();
  });

  it('should return false for non-overlapping shapes', () => {
    const provider = new RapierCollisionProvider(RAPIER);
    provider.addShape(0, { type: ShapeType.Circle, radius: 5 }, 0, 0, 0, 1);

    const overlaps = provider.testShape({ type: ShapeType.Circle, radius: 5 }, 100, 100, 0, 1);
    expect(overlaps).toBe(false);
    provider.clear();
  });

  it('should remove collider by id', () => {
    const provider = new RapierCollisionProvider(RAPIER);
    provider.addShape(0, { type: ShapeType.Circle, radius: 10 }, 50, 50, 0, 1);

    expect(provider.testShape({ type: ShapeType.Circle, radius: 10 }, 55, 55, 0, 1)).toBe(true);

    provider.removeShape(0);

    expect(provider.testShape({ type: ShapeType.Circle, radius: 10 }, 55, 55, 0, 1)).toBe(false);
  });

  it('should clear all colliders', () => {
    const provider = new RapierCollisionProvider(RAPIER);
    provider.addShape(0, { type: ShapeType.Circle, radius: 10 }, 50, 50, 0, 1);
    provider.addShape(1, { type: ShapeType.Circle, radius: 10 }, 60, 60, 0, 1);
    provider.clear();

    expect(provider.testShape({ type: ShapeType.Circle, radius: 10 }, 55, 55, 0, 1)).toBe(false);
  });

  it('should detect rotated AABB overlaps', () => {
    const provider = new RapierCollisionProvider(RAPIER);
    provider.addShape(0, { type: ShapeType.Cuboid, halfWidth: 20, halfHeight: 5 }, 50, 50, Math.PI / 4, 1);

    const overlaps = provider.testShape({ type: ShapeType.Circle, radius: 3 }, 50, 50, 0, 1);
    expect(overlaps).toBe(true);
  });

  it('should detect circle overlaps at boundary', () => {
    const provider = new RapierCollisionProvider(RAPIER);
    provider.addShape(0, { type: ShapeType.Circle, radius: 10 }, 0, 0, 0, 1);

    // Barely overlapping (distance 15 < radius sum 20)
    expect(provider.testShape({ type: ShapeType.Circle, radius: 10 }, 15, 0, 0, 1)).toBe(true);
    // Not overlapping (distance 25 > radius sum 20)
    expect(provider.testShape({ type: ShapeType.Circle, radius: 10 }, 25, 0, 0, 1)).toBe(false);
  });

});
