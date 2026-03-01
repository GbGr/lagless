# Physics 2D (Rapier)

## Overview

`@lagless/physics2d` integrates [Rapier 2D](https://rapier.rs/) for deterministic rigid body physics. The framework manages Rapier world snapshots for rollback, body↔entity mapping, and transform synchronization.

## Auto-Prepended Components

When `simulationType: physics2d` is set in `ecs.yaml`, codegen auto-prepends:

**Transform2d** (6 float32 fields):
- `positionX`, `positionY` — current position
- `rotation` — current rotation (radians)
- `prevPositionX`, `prevPositionY` — previous position (for interpolation)
- `prevRotation` — previous rotation

**PhysicsRefs** (4 fields):
- `bodyHandle: float64` — Rapier rigid body handle
- `colliderHandle: float64` — Rapier collider handle
- `bodyType: uint8` — body type enum (Dynamic, Fixed, etc.)
- `collisionLayer: uint16` — collision layer bitmask

**Do NOT declare these manually** — they are auto-prepended by codegen.

## Body Types

```typescript
import { BodyType } from '@lagless/physics-shared';

BodyType.DYNAMIC             // 0 — affected by forces and collisions
BodyType.FIXED               // 1 — immovable (walls, ground)
BodyType.KINEMATIC_POSITION  // 2 — moved by setting position directly
BodyType.KINEMATIC_VELOCITY  // 3 — moved by setting velocity directly
```

## Creating Bodies and Colliders

Use `PhysicsWorldManager2d` to create physics bodies:

```typescript
import { ECSSystem, IECSSystem } from '@lagless/core';
import { PhysicsWorldManager2d } from '@lagless/physics2d';
import { BodyType, CollisionLayers } from '@lagless/physics-shared';

@ECSSystem()
export class SpawnSystem implements IECSSystem {
  constructor(
    private readonly _physics: PhysicsWorldManager2d,
    private readonly _entities: EntitiesManager,
    private readonly _transform: Transform2d,
  ) {}

  update(tick: number): void {
    // Create entity
    const entity = this._entities.createEntity();
    this._entities.addComponent(entity, Transform2d);
    this._entities.addComponent(entity, PhysicsRefs);

    // Set initial position
    this._transform.set(entity, {
      positionX: 100, positionY: 200,
      prevPositionX: 100, prevPositionY: 200,
      rotation: 0, prevRotation: 0,
    });

    // Create physics body + collider
    this._physics.createBody(entity, {
      bodyType: BodyType.DYNAMIC,
      position: { x: 100, y: 200 },
      rotation: 0,
    });

    this._physics.createCollider(entity, {
      shape: { type: 'ball', radius: 20 },
      density: 1.0,
      friction: 0.5,
      restitution: 0.3,
      collisionLayer: CollisionLayers.get('player'),
    });
  }
}
```

### Collider Shapes

```typescript
// Circle
{ type: 'ball', radius: 20 }

// Rectangle
{ type: 'cuboid', hx: 50, hy: 25 }  // half-extents

// Capsule
{ type: 'capsule', halfHeight: 30, radius: 10 }

// Convex polygon
{ type: 'convexHull', points: [x1,y1, x2,y2, ...] }
```

## Collision Layers

Named collision groups (max 16 layers). Control which objects collide with which.

```typescript
import { CollisionLayers } from '@lagless/physics-shared';

// Register layers (call once at startup):
CollisionLayers.register('player');
CollisionLayers.register('wall');
CollisionLayers.register('projectile');
CollisionLayers.register('pickup');

// Get layer value:
const playerLayer = CollisionLayers.get('player');

// Interaction groups — which layers collide:
CollisionLayers.setInteraction('player', 'wall', true);
CollisionLayers.setInteraction('player', 'projectile', true);
CollisionLayers.setInteraction('projectile', 'wall', true);
CollisionLayers.setInteraction('player', 'pickup', true);
// player↔player collision:
CollisionLayers.setInteraction('player', 'player', true);
```

## Collision Events

Drain collision events in a system each tick:

```typescript
import { CollisionEvents2d } from '@lagless/physics2d';

@ECSSystem()
export class CollisionSystem implements IECSSystem {
  constructor(
    private readonly _collisionEvents: CollisionEvents2d,
  ) {}

  update(tick: number): void {
    // Drain events (must be called every tick)
    this._collisionEvents.drain();

    // Process collision start events
    for (let i = 0; i < this._collisionEvents.startCount; i++) {
      const entityA = this._collisionEvents.startEntityA[i];
      const entityB = this._collisionEvents.startEntityB[i];
      // Handle collision between entityA and entityB
    }

    // Process collision end events
    for (let i = 0; i < this._collisionEvents.endCount; i++) {
      const entityA = this._collisionEvents.endEntityA[i];
      const entityB = this._collisionEvents.endEntityB[i];
      // Handle separation
    }
  }
}
```

### Collision Events and Determinism

Collision events are **ephemeral** — they are cleared each tick in `drain()` and regenerated on re-simulation after rollback. No snapshot storage needed. The Rapier EventQueue is stateless between ticks.

## Physics Step System

The physics step system advances the Rapier world and syncs transforms:

```typescript
import { ECSSystem, IECSSystem } from '@lagless/core';
import { PhysicsWorldManager2d } from '@lagless/physics2d';

@ECSSystem()
export class PhysicsStepSystem implements IECSSystem {
  constructor(
    private readonly _physics: PhysicsWorldManager2d,
  ) {}

  update(tick: number): void {
    this._physics.step();
    // Rapier positions → ECS Transform2d (automatic)
  }
}
```

The `step()` method:
1. Steps the Rapier world with the configured timestep
2. Syncs Rapier body positions/rotations → ECS Transform2d component
3. Drains collision events

## ColliderEntityMap — Handle↔Entity Mapping

Rapier uses Float64 handles to identify bodies and colliders. The `ColliderEntityMap` maps these to entity IDs.

**Critical:** Rapier handles are Float64 values where the bit pattern encodes an arena index. `handle | 0` gives 0 for denormalized floats — **never** use bitwise OR for conversion. The framework uses `handleToIndex()` with Float64Array→Uint32Array reinterpretation.

You generally don't interact with this directly — it's managed by `PhysicsWorldManager2d`.

## Rollback

On rollback:
1. ArrayBuffer is restored → ECS state reverts
2. Rapier world snapshot is restored → physics state reverts
3. `updateSceneQueries()` is called → QueryPipeline is rebuilt

**Critical fix applied:** `World.restoreSnapshot()` creates a world with an **empty** QueryPipeline (not serialized). The framework calls `updateSceneQueries()` after restore to fix this. Without it, ray casts and shape casts fail on the first tick after rollback.

## State Transfer

After `applyExternalState()` (late join / reconnect):
1. Rapier world snapshot is applied alongside ArrayBuffer
2. `ColliderEntityMap` is rebuilt by iterating all entities with PhysicsRefs
3. Collision layers are re-applied

This is handled automatically by the physics runner. You don't need to do anything special.

## Complete Physics System Example

```typescript
import { ECSSystem, IECSSystem, AbstractInputProvider, ECSConfig, EntitiesManager } from '@lagless/core';
import { MathOps } from '@lagless/math';
import { PhysicsWorldManager2d, CollisionEvents2d } from '@lagless/physics2d';
import { BodyType } from '@lagless/physics-shared';
import { Transform2d, PhysicsRefs, PlayerBody, PlayerFilter, MoveInput } from '../code-gen/core.js';

const finite = (v: number): number => Number.isFinite(v) ? v : 0;

@ECSSystem()
export class ApplyMoveInputSystem implements IECSSystem {
  constructor(
    private readonly _input: AbstractInputProvider,
    private readonly _physics: PhysicsWorldManager2d,
    private readonly _playerBody: PlayerBody,
    private readonly _filter: PlayerFilter,
    private readonly _config: ECSConfig,
  ) {}

  update(tick: number): void {
    const rpcs = this._input.collectTickRPCs(tick, MoveInput);
    for (const rpc of rpcs) {
      const slot = rpc.meta.playerSlot;
      let dirX = MathOps.clamp(finite(rpc.data.directionX), -1, 1);
      let dirY = MathOps.clamp(finite(rpc.data.directionY), -1, 1);

      for (const entity of this._filter) {
        if (this._playerBody.unsafe.playerSlot[entity] !== slot) continue;

        const speed = 300;
        // Apply velocity to Rapier body
        this._physics.setLinearVelocity(entity, {
          x: dirX * speed,
          y: dirY * speed,
        });
        break;
      }
    }
  }
}
```

## Tips

- **Dynamic bodies** are moved by forces/impulses/velocity — never set position directly
- **Kinematic bodies** are moved by setting position or velocity — not affected by forces
- **Fixed bodies** never move — use for walls, ground, boundaries
- **Substeps** — Rapier can run multiple sub-steps per tick for stability. Configure in physics config.
- **Gravity** — set in physics world config. Default is (0, 0) for top-down games.
- **CCD** — continuous collision detection prevents tunneling through thin walls at high speeds.
