import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import RAPIER from '@dimforge/rapier2d-deterministic-compat';
import { BodyType } from '@lagless/physics-shared';
import { PhysicsWorldManager2d } from '../physics-world-manager-2d.js';
import { PhysicsConfig2d } from '../physics-config-2d.js';
import { PhysicsStepSync2d, ITransform2dComponent } from '../physics-step-sync-2d.js';
import type { IPhysicsRefsComponent, IFilter } from '@lagless/physics-shared';
import type { RapierModule2d } from '../rapier-types-2d.js';

let rapier: RapierModule2d;

beforeAll(async () => {
  await RAPIER.init();
  rapier = RAPIER as unknown as RapierModule2d;
});

const FRAME_LENGTH_MS = 1000 / 60;

/** Create a mock transform component backed by plain maps. */
function createMockTransform(): ITransform2dComponent {
  const store: Record<string, Map<number, number>> = {
    positionX: new Map(), positionY: new Map(), rotation: new Map(),
    prevPositionX: new Map(), prevPositionY: new Map(), prevRotation: new Map(),
  };
  const field = (name: string) => ({
    get: (e: number) => store[name].get(e) ?? 0,
    set: (e: number, v: number) => { store[name].set(e, v); },
  });
  return {
    positionX: field('positionX'),
    positionY: field('positionY'),
    rotation: field('rotation'),
    prevPositionX: field('prevPositionX'),
    prevPositionY: field('prevPositionY'),
    prevRotation: field('prevRotation'),
  };
}

/** Create a mock physics refs component backed by plain maps. */
function createMockPhysicsRefs(): IPhysicsRefsComponent {
  const bodyHandle = new Map<number, number>();
  const colliderHandle = new Map<number, number>();
  const bodyType = new Map<number, number>();
  return {
    bodyHandle: { get: (e: number) => bodyHandle.get(e) ?? 0, set: (e: number, v: number) => { bodyHandle.set(e, v); } },
    colliderHandle: { get: (e: number) => colliderHandle.get(e) ?? 0, set: (e: number, v: number) => { colliderHandle.set(e, v); } },
    bodyType: { get: (e: number) => bodyType.get(e) ?? 0, set: (e: number, v: number) => { bodyType.set(e, v); } },
  };
}

/** Create a mock filter with a fixed entity list. */
function createMockFilter(entities: number[]): IFilter {
  return {
    get length() { return entities.length; },
    entities: (index: number) => entities[index],
    [Symbol.iterator]: function* () { yield* entities; },
  };
}

describe('PhysicsStepSync2d', () => {
  let manager: PhysicsWorldManager2d;

  afterEach(() => {
    manager?.dispose();
    manager = undefined!;
  });

  describe('savePrevTransforms', () => {
    it('should copy current transform to prev fields', () => {
      const transform = createMockTransform();
      const filter = createMockFilter([0, 1]);

      transform.positionX.set(0, 10);
      transform.positionY.set(0, 20);
      transform.rotation.set(0, 1.5);
      transform.positionX.set(1, 30);
      transform.positionY.set(1, 40);
      transform.rotation.set(1, 2.5);

      PhysicsStepSync2d.savePrevTransforms(filter, transform);

      expect(transform.prevPositionX.get(0)).toBe(10);
      expect(transform.prevPositionY.get(0)).toBe(20);
      expect(transform.prevRotation.get(0)).toBe(1.5);
      expect(transform.prevPositionX.get(1)).toBe(30);
      expect(transform.prevPositionY.get(1)).toBe(40);
      expect(transform.prevRotation.get(1)).toBe(2.5);
    });
  });

  describe('syncKinematicToRapier', () => {
    it('should push ECS transform to kinematic Rapier body', () => {
      manager = new PhysicsWorldManager2d(rapier, new PhysicsConfig2d(), FRAME_LENGTH_MS);

      const body = manager.createKinematicPositionBody();
      body.setTranslation({ x: 0, y: 0 }, true);

      const transform = createMockTransform();
      const physicsRefs = createMockPhysicsRefs();
      const entity = 0;

      transform.positionX.set(entity, 5);
      transform.positionY.set(entity, 10);
      transform.rotation.set(entity, 0.7);
      physicsRefs.bodyHandle.set(entity, body.handle);
      physicsRefs.bodyType.set(entity, BodyType.KINEMATIC_POSITION);

      const filter = createMockFilter([entity]);

      PhysicsStepSync2d.syncKinematicToRapier(filter, physicsRefs, transform, manager);

      // Step so kinematic translation takes effect
      manager.step();

      const pos = manager.getBody(body.handle).translation();
      expect(pos.x).toBeCloseTo(5);
      expect(pos.y).toBeCloseTo(10);
    });

    it('should skip dynamic bodies', () => {
      manager = new PhysicsWorldManager2d(rapier, new PhysicsConfig2d({ gravityY: 0 }), FRAME_LENGTH_MS);

      const body = manager.createDynamicBody();
      body.setTranslation({ x: 1, y: 2 }, true);

      const transform = createMockTransform();
      const physicsRefs = createMockPhysicsRefs();
      const entity = 0;

      transform.positionX.set(entity, 99);
      transform.positionY.set(entity, 99);
      physicsRefs.bodyHandle.set(entity, body.handle);
      physicsRefs.bodyType.set(entity, BodyType.DYNAMIC);

      const filter = createMockFilter([entity]);

      PhysicsStepSync2d.syncKinematicToRapier(filter, physicsRefs, transform, manager);

      // Dynamic body should NOT have been updated
      const pos = manager.getBody(body.handle).translation();
      expect(pos.x).toBeCloseTo(1);
      expect(pos.y).toBeCloseTo(2);
    });
  });

  describe('syncDynamicFromRapier', () => {
    it('should pull Rapier body position into ECS transform', () => {
      manager = new PhysicsWorldManager2d(rapier, new PhysicsConfig2d({ gravityY: 0 }), FRAME_LENGTH_MS);

      const body = manager.createDynamicBody();
      body.setTranslation({ x: 42, y: 77 }, true);

      const transform = createMockTransform();
      const physicsRefs = createMockPhysicsRefs();
      const entity = 0;

      physicsRefs.bodyHandle.set(entity, body.handle);
      physicsRefs.bodyType.set(entity, BodyType.DYNAMIC);

      const filter = createMockFilter([entity]);

      PhysicsStepSync2d.syncDynamicFromRapier(filter, physicsRefs, transform, manager);

      expect(transform.positionX.get(entity)).toBeCloseTo(42);
      expect(transform.positionY.get(entity)).toBeCloseTo(77);
    });

    it('should skip kinematic bodies', () => {
      manager = new PhysicsWorldManager2d(rapier, new PhysicsConfig2d(), FRAME_LENGTH_MS);

      const body = manager.createKinematicPositionBody();
      body.setTranslation({ x: 42, y: 77 }, true);

      const transform = createMockTransform();
      const physicsRefs = createMockPhysicsRefs();
      const entity = 0;

      transform.positionX.set(entity, 0);
      transform.positionY.set(entity, 0);
      physicsRefs.bodyHandle.set(entity, body.handle);
      physicsRefs.bodyType.set(entity, BodyType.KINEMATIC_POSITION);

      const filter = createMockFilter([entity]);

      PhysicsStepSync2d.syncDynamicFromRapier(filter, physicsRefs, transform, manager);

      // Kinematic body should NOT have been synced to ECS
      expect(transform.positionX.get(entity)).toBe(0);
      expect(transform.positionY.get(entity)).toBe(0);
    });
  });
});
