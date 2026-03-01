# @lagless/physics3d

Rapier 3D physics integration for the lagless ECS framework. Deterministic stepping, snapshot/rollback, collision events, and DI-ready runner.

## Installation

```bash
pnpm add @lagless/physics3d @dimforge/rapier3d-compat
```

Peer dependency: `@dimforge/rapier3d-compat >= 0.14.0`

## Architecture

```
@lagless/physics-shared  (BodyType, ColliderEntityMap, CollisionLayers, CollisionEventsBase, PhysicsSimulationBase)
        │
        ▼
@lagless/physics3d       (3D wrappers: PhysicsWorldManager3d, PhysicsStepSync3d, PhysicsRunner3d, ...)
        │
        └── peer: @dimforge/rapier3d-compat
```

## ECS Schema (codegen)

Set `simulationType: 'physics3d'` in your `ecs.yaml`. Codegen auto-prepends:

- **Transform3d** — 14 float32 fields: `positionX/Y/Z`, `rotationX/Y/Z/W` (quaternion), `prevPositionX/Y/Z`, `prevRotationX/Y/Z/W`
- **PhysicsRefs** — `bodyHandle: float64`, `colliderHandle: float64`, `bodyType: uint8`, `collisionLayer: uint16`
- **PhysicsRefsFilter** — filter matching `[PhysicsRefs, Transform3d]`

```yaml
simulationType: physics3d

components:
  Velocity:
    x: float32
    y: float32
    z: float32

  Health:
    value: uint16

singletons:
  GameState:
    phase: uint8

filters:
  VelocityFilter:
    include: [Velocity, Transform3d]
```

## Usage

### Runner Setup

```typescript
import RAPIER from '@dimforge/rapier3d-compat';
import { PhysicsConfig3d } from '@lagless/physics3d';
import { MyGameRunner } from './code-gen/my-game.runner.js';

await RAPIER.init();

const runner = new MyGameRunner(
  ecsConfig,
  inputProvider,
  [PhysicsSystem, MovementSystem],
  [HitSignal],
  RAPIER,
  new PhysicsConfig3d({ gravityY: -9.81, substeps: 2 }),
);
```

### Physics System Pattern

```typescript
@ECSSystem()
class PhysicsSystem implements IECSSystem {
  constructor(
    private readonly _transform: Transform3d,
    private readonly _physicsRefs: PhysicsRefs,
    private readonly _filter: PhysicsRefsFilter,
    private readonly _worldManager: PhysicsWorldManager3d,
    private readonly _physicsConfig: PhysicsConfig3d,
  ) {}

  update(tick: number): void {
    // 1. Save previous transforms (for interpolation)
    PhysicsStepSync3d.savePrevTransforms(this._filter, this._transform);

    // 2. Push kinematic bodies from ECS → Rapier
    PhysicsStepSync3d.syncKinematicToRapier(
      this._filter, this._physicsRefs, this._transform, this._worldManager,
    );

    // 3. Step physics
    this._worldManager.step();

    // 4. Pull dynamic bodies from Rapier → ECS
    PhysicsStepSync3d.syncDynamicFromRapier(
      this._filter, this._physicsRefs, this._transform, this._worldManager,
    );
  }
}
```

### Spawning a Physics Entity

```typescript
@ECSSystem()
class SpawnSystem implements IECSSystem {
  constructor(
    private readonly _entities: EntitiesManager,
    private readonly _transform: Transform3d,
    private readonly _physicsRefs: PhysicsRefs,
    private readonly _worldManager: PhysicsWorldManager3d,
  ) {}

  spawnBall(x: number, y: number, z: number, radius: number): number {
    const entity = this._entities.create();

    // Create Rapier body + collider
    const body = this._worldManager.createDynamicBody();
    body.setTranslation({ x, y, z }, true);
    const collider = this._worldManager.createBallCollider(radius, body);

    // Write to ECS components
    this._physicsRefs.bodyHandle.set(entity, body.handle);
    this._physicsRefs.colliderHandle.set(entity, collider.handle);
    this._physicsRefs.bodyType.set(entity, BodyType.DYNAMIC);

    this._transform.positionX.set(entity, x);
    this._transform.positionY.set(entity, y);
    this._transform.positionZ.set(entity, z);
    // Always set prev = current to avoid interpolation jump
    this._transform.prevPositionX.set(entity, x);
    this._transform.prevPositionY.set(entity, y);
    this._transform.prevPositionZ.set(entity, z);
    this._transform.rotationW.set(entity, 1); // identity quaternion
    this._transform.prevRotationW.set(entity, 1);

    this._worldManager.registerCollider(collider.handle, entity);
    return entity;
  }
}
```

## PhysicsConfig3d

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `gravityX` | `number` | `0` | Gravity X component |
| `gravityY` | `number` | `-9.81` | Gravity Y component |
| `gravityZ` | `number` | `0` | Gravity Z component |
| `substeps` | `number` | `1` | Physics substeps per frame |
| `substepDt` | `number` | (derived) | `frameDt / substeps` |

## Collision Layers

```typescript
import { CollisionLayers } from '@lagless/physics3d';

const layers = new CollisionLayers();
const PLAYER = layers.layer('player');
const GROUND = layers.layer('ground');
const PROJECTILE = layers.layer('projectile');

layers
  .pair('player', 'ground')
  .pair('player', 'projectile')
  .selfPair('projectile');

// Use when creating colliders:
const groups = layers.groups('player');
worldManager.createBallCollider(0.5, body, groups, RAPIER.ActiveEvents.COLLISION_EVENTS);
```

Max 16 named layers.

## Collision Events

Enable by passing `collisionLayers` to the runner constructor. Then inject `CollisionEvents3d` in your system:

```typescript
@ECSSystem()
class DamageSystem implements IECSSystem {
  constructor(private readonly _events: CollisionEvents3d) {}

  update(tick: number): void {
    for (let i = 0; i < this._events.collisionEnterCount; i++) {
      const entityA = this._events.collisionEnterEntityA(i);
      const entityB = this._events.collisionEnterEntityB(i);
      // handle collision...
    }
  }
}
```

Event types: `collisionEnter/Exit`, `sensorEnter/Exit`, `contactForce` (with magnitude).

Events are ephemeral — cleared each tick, regenerated on rollback re-simulation. Zero-allocation SoA buffers.

## Snapshot/Rollback

`PhysicsSimulation3d` automatically maintains parallel snapshot histories for both ECS (ArrayBuffer) and Rapier (binary). On rollback, both are restored in sync. No manual intervention needed.

## Body Types

| Constant | Value | Description |
|----------|-------|-------------|
| `BodyType.DYNAMIC` | `0` | Physics-simulated |
| `BodyType.FIXED` | `1` | Static, immovable |
| `BodyType.KINEMATIC_POSITION` | `2` | ECS-driven position |
| `BodyType.KINEMATIC_VELOCITY` | `3` | ECS-driven velocity |

## API Reference

### PhysicsWorldManager3d

**Body factories:** `createDynamicBody()`, `createFixedBody()`, `createKinematicPositionBody()`, `createKinematicVelocityBody()`, `createBodyFromDesc(desc)`

**Collider factories:** `createBallCollider(r, parent?, groups?, events?)`, `createCuboidCollider(hx, hy, hz, parent?, groups?, events?)`, `createCapsuleCollider(halfH, r, parent?, groups?, events?)`, `createTrimeshCollider(vertices, indices, parent?)`, `createColliderFromDesc(desc, parent?)`

**Accessors:** `getBody(handle)`, `getCollider(handle)`, `world`, `substeps`, `colliderEntityMap`, `rapier`

**Lifecycle:** `step()`, `takeSnapshot()`, `restoreSnapshot(data)`, `registerCollider(handle, entity)`, `unregisterCollider(handle)`, `enableCollisionEvents(events)`, `dispose()`

### PhysicsStepSync3d (static)

- `savePrevTransforms(filter, transform)` — copy current → prev fields
- `syncKinematicToRapier(filter, physicsRefs, transform, worldManager)` — ECS → Rapier for kinematic bodies
- `syncDynamicFromRapier(filter, physicsRefs, transform, worldManager)` — Rapier → ECS for dynamic bodies
