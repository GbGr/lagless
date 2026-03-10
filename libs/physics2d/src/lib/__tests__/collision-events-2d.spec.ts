import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import RAPIER from '@lagless/rapier2d-deterministic-compat';
import { CollisionEvents2d } from '../collision-events-2d.js';
import { ColliderEntityMap, CollisionLayers } from '@lagless/physics-shared';
import type { RapierModule2d, RapierWorld2d } from '../rapier-types-2d.js';

let rapier: RapierModule2d;

beforeAll(async () => {
  await RAPIER.init();
  rapier = RAPIER as unknown as RapierModule2d;
});

function createWorld(): RapierWorld2d {
  return new rapier.World({ x: 0, y: -9.81 }) as unknown as RapierWorld2d;
}

describe('CollisionEvents2d', () => {
  let world: RapierWorld2d;
  let events: CollisionEvents2d;
  let entityMap: ColliderEntityMap;

  afterEach(() => {
    events?.dispose();
    events = undefined!;
    (world as any)?.free();
    world = undefined!;
  });

  describe('collision enter/exit', () => {
    it('should detect collision enter between two dynamic bodies', () => {
      world = createWorld();
      events = new CollisionEvents2d(rapier);
      entityMap = new ColliderEntityMap();

      // Body A — entity 10
      const bodyA = world.createRigidBody(rapier.RigidBodyDesc.dynamic());
      bodyA.setTranslation({ x: 0, y: 5 }, true);
      const colliderA = world.createCollider(
        rapier.ColliderDesc.ball(1.0)
          .setActiveEvents(rapier.ActiveEvents.COLLISION_EVENTS),
        bodyA,
      );
      entityMap.set(colliderA.handle, 10);

      // Body B — entity 20 (ground, fixed)
      const bodyB = world.createRigidBody(rapier.RigidBodyDesc.fixed());
      bodyB.setTranslation({ x: 0, y: 0 }, true);
      const colliderB = world.createCollider(
        rapier.ColliderDesc.cuboid(50, 0.5),
        bodyB,
      );
      entityMap.set(colliderB.handle, 20);

      // Step until collision
      const eq = events.eventQueue;
      for (let i = 0; i < 120; i++) {
        world.step(eq);
      }
      events.drain(entityMap, world);

      expect(events.collisionEnterCount).toBeGreaterThanOrEqual(1);

      // Verify entity pair
      const entities = new Set<number>();
      for (let i = 0; i < events.collisionEnterCount; i++) {
        entities.add(events.collisionEnterEntityA(i));
        entities.add(events.collisionEnterEntityB(i));
      }
      expect(entities.has(10)).toBe(true);
      expect(entities.has(20)).toBe(true);
    });

    it('should detect collision exit when bodies separate', () => {
      world = createWorld();
      events = new CollisionEvents2d(rapier);
      entityMap = new ColliderEntityMap();

      // Two bodies that will collide and then we'll move apart
      const bodyA = world.createRigidBody(rapier.RigidBodyDesc.dynamic());
      bodyA.setTranslation({ x: 0, y: 2 }, true);
      const colliderA = world.createCollider(
        rapier.ColliderDesc.ball(0.5)
          .setActiveEvents(rapier.ActiveEvents.COLLISION_EVENTS),
        bodyA,
      );
      entityMap.set(colliderA.handle, 1);

      const bodyB = world.createRigidBody(rapier.RigidBodyDesc.fixed());
      bodyB.setTranslation({ x: 0, y: 0 }, true);
      const colliderB = world.createCollider(
        rapier.ColliderDesc.cuboid(50, 0.5),
        bodyB,
      );
      entityMap.set(colliderB.handle, 2);

      // Step until collision enter
      const eq = events.eventQueue;
      let collisionStarted = false;
      for (let i = 0; i < 120 && !collisionStarted; i++) {
        world.step(eq);
        events.drain(entityMap, world);
        if (events.collisionEnterCount > 0) collisionStarted = true;
      }
      expect(collisionStarted).toBe(true);

      // Now teleport body A away -> should produce exit event
      bodyA.setTranslation({ x: 0, y: 100 }, true);
      bodyA.setLinvel({ x: 0, y: 0 }, true);

      // Step to let Rapier notice the separation
      for (let i = 0; i < 5; i++) {
        world.step(eq);
      }
      events.drain(entityMap, world);

      expect(events.collisionExitCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('sensor enter/exit', () => {
    it('should detect sensor enter with correct A=non-sensor, B=sensor convention', () => {
      world = createWorld();
      events = new CollisionEvents2d(rapier);
      entityMap = new ColliderEntityMap();

      // Sensor trigger (entity 100) — fixed body with sensor collider
      const sensorBody = world.createRigidBody(rapier.RigidBodyDesc.fixed());
      sensorBody.setTranslation({ x: 0, y: 0 }, true);
      const sensorCollider = world.createCollider(
        rapier.ColliderDesc.cuboid(2, 2)
          .setSensor(true)
          .setActiveEvents(rapier.ActiveEvents.COLLISION_EVENTS),
        sensorBody,
      );
      entityMap.set(sensorCollider.handle, 100);

      // Dynamic body (entity 200) — starts above sensor, will fall into it
      const dynamicBody = world.createRigidBody(rapier.RigidBodyDesc.dynamic());
      dynamicBody.setTranslation({ x: 0, y: 5 }, true);
      const dynamicCollider = world.createCollider(
        rapier.ColliderDesc.ball(0.5),
        dynamicBody,
      );
      entityMap.set(dynamicCollider.handle, 200);

      const eq = events.eventQueue;
      let entered = false;
      for (let i = 0; i < 120 && !entered; i++) {
        world.step(eq);
        events.drain(entityMap, world);
        if (events.sensorEnterCount > 0) entered = true;
      }

      expect(entered).toBe(true);
      // Convention: A = non-sensor (200), B = sensor (100)
      expect(events.sensorEnterEntityA(0)).toBe(200);
      expect(events.sensorEnterEntityB(0)).toBe(100);
    });

    it('should detect sensor exit when body leaves sensor', () => {
      world = createWorld();
      events = new CollisionEvents2d(rapier);
      entityMap = new ColliderEntityMap();

      // Large sensor zone
      const sensorBody = world.createRigidBody(rapier.RigidBodyDesc.fixed());
      sensorBody.setTranslation({ x: 0, y: 0 }, true);
      const sensorCollider = world.createCollider(
        rapier.ColliderDesc.cuboid(2, 2)
          .setSensor(true)
          .setActiveEvents(rapier.ActiveEvents.COLLISION_EVENTS),
        sensorBody,
      );
      entityMap.set(sensorCollider.handle, 50);

      // Body starts inside sensor
      const body = world.createRigidBody(rapier.RigidBodyDesc.dynamic());
      body.setTranslation({ x: 0, y: 0 }, true);
      const collider = world.createCollider(
        rapier.ColliderDesc.ball(0.3),
        body,
      );
      entityMap.set(collider.handle, 51);

      const eq = events.eventQueue;

      // Step until enter detected
      let entered = false;
      for (let i = 0; i < 10 && !entered; i++) {
        world.step(eq);
        events.drain(entityMap, world);
        if (events.sensorEnterCount > 0) entered = true;
      }

      // Now teleport body far away
      body.setTranslation({ x: 0, y: 100 }, true);
      body.setLinvel({ x: 0, y: 0 }, true);

      let exited = false;
      for (let i = 0; i < 10 && !exited; i++) {
        world.step(eq);
        events.drain(entityMap, world);
        if (events.sensorExitCount > 0) exited = true;
      }

      expect(exited).toBe(true);
    });
  });

  describe('contact forces', () => {
    it('should report contact force magnitude', () => {
      world = createWorld();
      events = new CollisionEvents2d(rapier);
      entityMap = new ColliderEntityMap();

      // Heavy body dropping onto ground -> contact forces
      const bodyA = world.createRigidBody(rapier.RigidBodyDesc.dynamic());
      bodyA.setTranslation({ x: 0, y: 3 }, true);
      bodyA.setAdditionalMass(10);
      const colliderA = world.createCollider(
        rapier.ColliderDesc.ball(0.5)
          .setActiveEvents(rapier.ActiveEvents.COLLISION_EVENTS | rapier.ActiveEvents.CONTACT_FORCE_EVENTS),
        bodyA,
      );
      entityMap.set(colliderA.handle, 1);

      const bodyB = world.createRigidBody(rapier.RigidBodyDesc.fixed());
      bodyB.setTranslation({ x: 0, y: 0 }, true);
      const colliderB = world.createCollider(
        rapier.ColliderDesc.cuboid(50, 0.5),
        bodyB,
      );
      entityMap.set(colliderB.handle, 2);

      const eq = events.eventQueue;
      let forcesDetected = false;
      for (let i = 0; i < 120 && !forcesDetected; i++) {
        world.step(eq);
        events.drain(entityMap, world);
        if (events.contactForceCount > 0) forcesDetected = true;
      }

      expect(forcesDetected).toBe(true);
      expect(events.contactForceMagnitude(0)).toBeGreaterThan(0);
    });
  });

  describe('layer filtering', () => {
    it('should not produce events when layers do not interact', () => {
      world = createWorld();
      events = new CollisionEvents2d(rapier);
      entityMap = new ColliderEntityMap();

      const layers = new CollisionLayers();
      layers.layer('a');
      layers.layer('b');
      // No pair() call -> no interaction

      const bodyA = world.createRigidBody(rapier.RigidBodyDesc.dynamic());
      bodyA.setTranslation({ x: 0, y: 3 }, true);
      const colliderA = world.createCollider(
        rapier.ColliderDesc.ball(0.5)
          .setCollisionGroups(layers.groups('a'))
          .setActiveEvents(rapier.ActiveEvents.COLLISION_EVENTS),
        bodyA,
      );
      entityMap.set(colliderA.handle, 1);

      const bodyB = world.createRigidBody(rapier.RigidBodyDesc.fixed());
      bodyB.setTranslation({ x: 0, y: 0 }, true);
      const colliderB = world.createCollider(
        rapier.ColliderDesc.cuboid(50, 0.5)
          .setCollisionGroups(layers.groups('b')),
        bodyB,
      );
      entityMap.set(colliderB.handle, 2);

      const eq = events.eventQueue;
      for (let i = 0; i < 120; i++) {
        world.step(eq);
      }
      events.drain(entityMap, world);

      expect(events.collisionEnterCount).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should skip events when entity map is empty', () => {
      world = createWorld();
      events = new CollisionEvents2d(rapier);
      entityMap = new ColliderEntityMap();

      // Create collision scene but don't map any colliders
      const bodyA = world.createRigidBody(rapier.RigidBodyDesc.dynamic());
      bodyA.setTranslation({ x: 0, y: 3 }, true);
      world.createCollider(
        rapier.ColliderDesc.ball(0.5)
          .setActiveEvents(rapier.ActiveEvents.COLLISION_EVENTS),
        bodyA,
      );

      const bodyB = world.createRigidBody(rapier.RigidBodyDesc.fixed());
      bodyB.setTranslation({ x: 0, y: 0 }, true);
      world.createCollider(
        rapier.ColliderDesc.cuboid(50, 0.5),
        bodyB,
      );

      const eq = events.eventQueue;
      for (let i = 0; i < 120; i++) {
        world.step(eq);
      }
      // Should not crash — all events silently skipped
      events.drain(entityMap, world);
      expect(events.collisionEnterCount).toBe(0);
    });

    it('should reset counts on clear()', () => {
      world = createWorld();
      events = new CollisionEvents2d(rapier);
      entityMap = new ColliderEntityMap();

      // Create a collision scenario
      const bodyA = world.createRigidBody(rapier.RigidBodyDesc.dynamic());
      bodyA.setTranslation({ x: 0, y: 3 }, true);
      const colliderA = world.createCollider(
        rapier.ColliderDesc.ball(0.5)
          .setActiveEvents(rapier.ActiveEvents.COLLISION_EVENTS),
        bodyA,
      );
      entityMap.set(colliderA.handle, 1);

      const bodyB = world.createRigidBody(rapier.RigidBodyDesc.fixed());
      bodyB.setTranslation({ x: 0, y: 0 }, true);
      const colliderB = world.createCollider(
        rapier.ColliderDesc.cuboid(50, 0.5),
        bodyB,
      );
      entityMap.set(colliderB.handle, 2);

      const eq = events.eventQueue;
      for (let i = 0; i < 120; i++) {
        world.step(eq);
      }
      events.drain(entityMap, world);

      // There might be events
      events.clear();

      expect(events.collisionEnterCount).toBe(0);
      expect(events.collisionExitCount).toBe(0);
      expect(events.sensorEnterCount).toBe(0);
      expect(events.sensorExitCount).toBe(0);
      expect(events.contactForceCount).toBe(0);
    });

    it('should handle multiple collision events in one tick', () => {
      world = createWorld();
      events = new CollisionEvents2d(rapier);
      entityMap = new ColliderEntityMap();

      // Ground
      const ground = world.createRigidBody(rapier.RigidBodyDesc.fixed());
      ground.setTranslation({ x: 0, y: 0 }, true);
      const groundCollider = world.createCollider(
        rapier.ColliderDesc.cuboid(50, 0.5),
        ground,
      );
      entityMap.set(groundCollider.handle, 0);

      // Drop 3 balls
      for (let i = 0; i < 3; i++) {
        const body = world.createRigidBody(rapier.RigidBodyDesc.dynamic());
        body.setTranslation({ x: i * 3, y: 3 }, true);
        const collider = world.createCollider(
          rapier.ColliderDesc.ball(0.5)
            .setActiveEvents(rapier.ActiveEvents.COLLISION_EVENTS),
          body,
        );
        entityMap.set(collider.handle, 10 + i);
      }

      const eq = events.eventQueue;
      for (let i = 0; i < 120; i++) {
        world.step(eq);
      }
      events.drain(entityMap, world);

      // All 3 balls should have collided with the ground
      expect(events.collisionEnterCount).toBeGreaterThanOrEqual(3);
    });
  });

  describe('determinism', () => {
    it('should produce identical events from two identical setups', () => {
      const makeScene = () => {
        const w = createWorld();
        const ev = new CollisionEvents2d(rapier);
        const em = new ColliderEntityMap();

        const ground = w.createRigidBody(rapier.RigidBodyDesc.fixed());
        ground.setTranslation({ x: 0, y: 0 }, true);
        const gc = w.createCollider(rapier.ColliderDesc.cuboid(50, 0.5), ground);
        em.set(gc.handle, 0);

        const ball = w.createRigidBody(rapier.RigidBodyDesc.dynamic());
        ball.setTranslation({ x: 0, y: 5 }, true);
        const bc = w.createCollider(
          rapier.ColliderDesc.ball(0.5)
            .setActiveEvents(rapier.ActiveEvents.COLLISION_EVENTS),
          ball,
        );
        em.set(bc.handle, 1);

        return { w, ev, em };
      };

      const s1 = makeScene();
      const s2 = makeScene();

      const eq1 = s1.ev.eventQueue;
      const eq2 = s2.ev.eventQueue;

      // Collect enter events per tick
      const events1: Array<[number, number]> = [];
      const events2: Array<[number, number]> = [];

      for (let i = 0; i < 120; i++) {
        s1.w.step(eq1);
        s1.ev.drain(s1.em, s1.w);
        for (let j = 0; j < s1.ev.collisionEnterCount; j++) {
          events1.push([s1.ev.collisionEnterEntityA(j), s1.ev.collisionEnterEntityB(j)]);
        }

        s2.w.step(eq2);
        s2.ev.drain(s2.em, s2.w);
        for (let j = 0; j < s2.ev.collisionEnterCount; j++) {
          events2.push([s2.ev.collisionEnterEntityA(j), s2.ev.collisionEnterEntityB(j)]);
        }
      }

      expect(events1.length).toBeGreaterThan(0);
      expect(events1).toEqual(events2);

      s1.ev.dispose();
      s2.ev.dispose();
      (s1.w as any).free();
      (s2.w as any).free();
    });

    it('should reproduce events after snapshot restore + re-step', () => {
      world = createWorld();
      events = new CollisionEvents2d(rapier);
      entityMap = new ColliderEntityMap();

      const ground = world.createRigidBody(rapier.RigidBodyDesc.fixed());
      ground.setTranslation({ x: 0, y: 0 }, true);
      const gc = world.createCollider(rapier.ColliderDesc.cuboid(50, 0.5), ground);
      entityMap.set(gc.handle, 0);

      const ball = world.createRigidBody(rapier.RigidBodyDesc.dynamic());
      ball.setTranslation({ x: 0, y: 5 }, true);
      const bc = world.createCollider(
        rapier.ColliderDesc.ball(0.5)
          .setActiveEvents(rapier.ActiveEvents.COLLISION_EVENTS),
        ball,
      );
      entityMap.set(bc.handle, 1);

      const eq = events.eventQueue;

      // Step 30 ticks and save snapshot
      for (let i = 0; i < 30; i++) {
        world.step(eq);
        events.drain(entityMap, world);
      }
      const snapshot = world.takeSnapshot();

      // Step 30 more ticks and collect events
      const originalEvents: Array<[number, number]> = [];
      for (let i = 0; i < 30; i++) {
        world.step(eq);
        events.drain(entityMap, world);
        for (let j = 0; j < events.collisionEnterCount; j++) {
          originalEvents.push([events.collisionEnterEntityA(j), events.collisionEnterEntityB(j)]);
        }
      }

      // Restore snapshot
      (world as any).free();
      world = rapier.World.restoreSnapshot(snapshot)! as unknown as RapierWorld2d;

      // Re-step the same 30 ticks — need a fresh EventQueue since world was recreated
      events.dispose();
      events = new CollisionEvents2d(rapier);
      const eq2 = events.eventQueue;

      const replayedEvents: Array<[number, number]> = [];
      for (let i = 0; i < 30; i++) {
        world.step(eq2);
        events.drain(entityMap, world);
        for (let j = 0; j < events.collisionEnterCount; j++) {
          replayedEvents.push([events.collisionEnterEntityA(j), events.collisionEnterEntityB(j)]);
        }
      }

      expect(replayedEvents).toEqual(originalEvents);
    });
  });
});
