# Physics 3D (Rapier)

## Overview

`@lagless/physics3d` integrates [Rapier 3D](https://rapier.rs/) for deterministic rigid body physics. The framework manages Rapier world snapshots for rollback, body↔entity mapping, and transform synchronization.

For character controllers, see also `@lagless/character-controller-3d`.

## Auto-Prepended Components

When `simulationType: physics3d` is set in `ecs.yaml`, codegen auto-prepends:

**Transform3d** (14 float32 fields):
- `positionX`, `positionY`, `positionZ` — current position
- `rotationX`, `rotationY`, `rotationZ`, `rotationW` — current rotation (quaternion)
- `prevPositionX`, `prevPositionY`, `prevPositionZ` — previous position
- `prevRotationX`, `prevRotationY`, `prevRotationZ`, `prevRotationW` — previous rotation

**PhysicsRefs** (4 fields):
- `bodyHandle: float64` — Rapier rigid body handle
- `colliderHandle: float64` — Rapier collider handle
- `bodyType: uint8` — body type enum
- `collisionLayer: uint16` — collision layer bitmask

**Do NOT declare these manually** — they are auto-prepended by codegen.

## Body Types

```typescript
import { BodyType } from '@lagless/physics-shared';

BodyType.DYNAMIC             // 0 — affected by forces and collisions
BodyType.FIXED               // 1 — immovable (walls, ground)
BodyType.KINEMATIC_POSITION  // 2 — moved by setting position
BodyType.KINEMATIC_VELOCITY  // 3 — moved by setting velocity
```

## Creating Bodies and Colliders

```typescript
import { PhysicsWorldManager3d } from '@lagless/physics3d';
import { BodyType, CollisionLayers } from '@lagless/physics-shared';

@ECSSystem()
export class SpawnSystem implements IECSSystem {
  constructor(
    private readonly _physics: PhysicsWorldManager3d,
    private readonly _entities: EntitiesManager,
    private readonly _transform: Transform3d,
  ) {}

  update(tick: number): void {
    const entity = this._entities.createEntity();
    this._entities.addComponent(entity, Transform3d);
    this._entities.addComponent(entity, PhysicsRefs);

    this._transform.set(entity, {
      positionX: 0, positionY: 5, positionZ: 0,
      rotationX: 0, rotationY: 0, rotationZ: 0, rotationW: 1,
      prevPositionX: 0, prevPositionY: 5, prevPositionZ: 0,
      prevRotationX: 0, prevRotationY: 0, prevRotationZ: 0, prevRotationW: 1,
    });

    this._physics.createBody(entity, {
      bodyType: BodyType.DYNAMIC,
      position: { x: 0, y: 5, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    });

    this._physics.createCollider(entity, {
      shape: { type: 'ball', radius: 0.5 },
      density: 1.0,
      friction: 0.5,
      restitution: 0.3,
      collisionLayer: CollisionLayers.get('player'),
    });
  }
}
```

### Collider Shapes (3D)

```typescript
// Sphere
{ type: 'ball', radius: 0.5 }

// Box
{ type: 'cuboid', hx: 1, hy: 0.5, hz: 1 }  // half-extents

// Capsule
{ type: 'capsule', halfHeight: 0.5, radius: 0.3 }

// Cylinder
{ type: 'cylinder', halfHeight: 1.0, radius: 0.5 }

// Convex hull
{ type: 'convexHull', points: Float32Array }

// Triangle mesh (static only)
{ type: 'trimesh', vertices: Float32Array, indices: Uint32Array }
```

## Collision Layers and Events

Same API as 2D — see [08-physics2d.md](08-physics2d.md) for `CollisionLayers` and `CollisionEvents` documentation. Use `CollisionEvents3d` instead of `CollisionEvents2d`.

## Physics Step System

```typescript
@ECSSystem()
export class PhysicsStepSystem implements IECSSystem {
  constructor(private readonly _physics: PhysicsWorldManager3d) {}

  update(tick: number): void {
    this._physics.step();
    // Rapier 3D positions/rotations → ECS Transform3d (automatic)
  }
}
```

## Character Controller (KCC)

The `@lagless/character-controller-3d` library provides deterministic character movement using Rapier's KinematicCharacterController.

### Setup

```typescript
import { CharacterControllerManager } from '@lagless/character-controller-3d';

// Create manager (in runner setup or first system tick):
const kccManager = new CharacterControllerManager(physicsWorld, {
  offset: 0.01,           // skin width
  maxSlopeClimbAngle: 0.8, // ~45 degrees
  maxSlopeSlideAngle: 0.6, // ~34 degrees
  stepHeight: 0.3,
  snapToGround: 0.3,
});
```

### Movement System

```typescript
@ECSSystem()
export class CharacterMovementSystem implements IECSSystem {
  constructor(
    private readonly _kcc: CharacterControllerManager,
    private readonly _input: AbstractInputProvider,
    private readonly _transform: Transform3d,
    private readonly _filter: PlayerFilter,
    private readonly _config: ECSConfig,
  ) {}

  update(tick: number): void {
    const rpcs = this._input.collectTickRPCs(tick, MoveInput);
    for (const rpc of rpcs) {
      let dirX = MathOps.clamp(finite(rpc.data.directionX), -1, 1);
      let dirZ = MathOps.clamp(finite(rpc.data.directionZ), -1, 1);
      const cameraYaw = finite(rpc.data.cameraYaw);

      for (const entity of this._filter) {
        if (this._playerBody.unsafe.playerSlot[entity] !== rpc.meta.playerSlot) continue;

        // Rotate input by camera yaw
        const sinYaw = MathOps.sin(cameraYaw);
        const cosYaw = MathOps.cos(cameraYaw);
        const worldX = dirX * cosYaw - dirZ * sinYaw;
        const worldZ = dirX * sinYaw + dirZ * cosYaw;

        const speed = 5.0;
        const dt = this._config.frameLength;

        // Move character via KCC
        this._kcc.computeMovement(entity, {
          x: worldX * speed * dt,
          y: -9.81 * dt, // gravity
          z: worldZ * speed * dt,
        });

        // Apply movement result
        const result = this._kcc.getMovementResult(entity);
        this._kcc.applyMovement(entity, result);

        // Check grounding
        const grounded = this._kcc.isGrounded(entity);
        break;
      }
    }
  }
}
```

### Rollback with KCC

After rollback, character controllers must be recreated:

```typescript
// The physics runner handles this automatically via recreateAll()
// after Rapier world snapshot restore
```

## Animation Controller

The `@lagless/animation-controller` library provides deterministic animation state machines.

### AnimationStateMachine

```typescript
import { AnimationStateMachine } from '@lagless/animation-controller';

const fsm = new AnimationStateMachine({
  states: {
    idle: { animation: 'idle', loop: true },
    walk: { animation: 'walk', loop: true },
    run: { animation: 'run', loop: true },
    jump: { animation: 'jump', loop: false },
  },
  transitions: [
    { from: 'idle', to: 'walk', condition: (ctx) => ctx.speed > 0.1 },
    { from: 'walk', to: 'run', condition: (ctx) => ctx.speed > 3.0 },
    { from: 'walk', to: 'idle', condition: (ctx) => ctx.speed < 0.1 },
    { from: 'run', to: 'walk', condition: (ctx) => ctx.speed < 3.0 },
    { from: '*', to: 'jump', condition: (ctx) => !ctx.grounded },
    { from: 'jump', to: 'idle', condition: (ctx) => ctx.grounded },
  ],
  initialState: 'idle',
  crossfadeDuration: 0.2,
});
```

### LocomotionBlendCalculator

Blends between idle/walk/run based on speed:

```typescript
import { LocomotionBlendCalculator } from '@lagless/animation-controller';

const locomotion = new LocomotionBlendCalculator({
  walkSpeed: 2.0,
  runSpeed: 5.0,
});

// Each tick:
const blend = locomotion.calculate(currentSpeed);
// blend.idle, blend.walk, blend.run — weights summing to 1.0
```

### AnimationViewAdapter

Connects deterministic animation state to 3D engine (BabylonJS, Three.js):

```typescript
import { AnimationViewAdapter } from '@lagless/animation-controller';

const adapter = new AnimationViewAdapter(fsm, {
  playAnimation: (name, options) => { /* play in 3D engine */ },
  stopAnimation: (name) => { /* stop in 3D engine */ },
  setWeight: (name, weight) => { /* blend weight */ },
});

// Each frame:
adapter.update(deltaTime);
```

## System Execution Order for 3D

```typescript
export const systems = [
  SavePrevTransformSystem,       // 1. Store prev positions/rotations
  PlayerConnectionSystem,        // 2. Handle join/leave
  ApplyMoveInputSystem,          // 3. Read inputs
  CharacterMovementSystem,       // 4. KCC movement (before physics step)
  PhysicsStepSystem,             // 5. Step Rapier, sync transforms
  AnimationSystem,               // 6. Update animation FSM (after physics)
  PlayerLeaveSystem,             // 7. Cleanup
  HashVerificationSystem,        // 8. Always last
];
```

## Rollback

On rollback:
1. ArrayBuffer is restored → ECS state reverts
2. Rapier 3D world snapshot is restored → physics state reverts
3. `updateSceneQueries()` is called → QueryPipeline is rebuilt
4. KCC controllers are recreated via `recreateAll()`

**Critical fix:** `World.restoreSnapshot()` creates a world with an empty QueryPipeline. The framework calls `updateSceneQueries()` after restore. Without this, `computeColliderMovement()` queries fail on the first tick after rollback.

## State Transfer

After `applyExternalState()`:
1. Rapier 3D world snapshot is applied alongside ArrayBuffer
2. `ColliderEntityMap` is rebuilt by iterating all entities with PhysicsRefs
3. KCC controllers are recreated
4. Collision layers are re-applied

Handled automatically by the physics runner.

## Rapier Handle Encoding

Rapier WASM handles are **Float64** values where the bit pattern encodes an arena index in the low 32 bits.
- Handle `0` = float64 `0.0`, handle `1` = float64 `5e-324` (Number.MIN_VALUE)
- **NEVER** use `handle | 0` — gives 0 for all denormalized floats
- The framework uses `handleToIndex()` with Float64Array→Uint32Array reinterpretation

## Tips

- **Gravity:** default is (0, -9.81, 0) for 3D. Set in physics config.
- **Quaternion rotation:** rotationW=1 for identity rotation. Set all 4 components.
- **KCC offset:** small positive value (0.01) prevents character from getting stuck in geometry
- **System order matters:** KCC movement must run BEFORE PhysicsStep
- **Animation updates** should run AFTER physics to use final position/velocity
