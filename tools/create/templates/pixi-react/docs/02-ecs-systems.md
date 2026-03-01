# ECS Systems

## Anatomy of a System

Systems are classes decorated with `@ECSSystem()` that implement `IECSSystem`. Dependencies are injected via constructor.

```typescript
import { ECSSystem, IECSSystem } from '@lagless/core';
import { Transform2d, Velocity2d, MovingFilter } from '../code-gen/core.js';

@ECSSystem()
export class IntegrateSystem implements IECSSystem {
  constructor(
    private readonly _transform: Transform2d,
    private readonly _velocity: Velocity2d,
    private readonly _filter: MovingFilter,
  ) {}

  update(tick: number): void {
    for (const entity of this._filter) {
      this._transform.unsafe.positionX[entity] += this._velocity.unsafe.velocityX[entity];
      this._transform.unsafe.positionY[entity] += this._velocity.unsafe.velocityY[entity];
    }
  }
}
```

## DI Injectable Tokens

Any of these types can be requested in a system's constructor:

| Type | What You Get |
|------|-------------|
| `Transform2d`, `PlayerBody`, etc. | Component class — access entity data |
| `PlayerFilter`, `MovingFilter`, etc. | Filter class — iterate matching entities |
| `GameState`, etc. | Singleton — global data fields |
| `PlayerResource` | Per-player data indexed by slot |
| `EntitiesManager` | Create/remove entities, add/remove components |
| `PRNG` | Deterministic random number generator |
| `ECSConfig` | Simulation configuration (maxEntities, tickRate, etc.) |
| `AbstractInputProvider` | Read RPCs via `collectTickRPCs()` |
| `ScoreSignal`, etc. | Signal classes — emit rollback-aware events |

## Data Access Patterns

### Hot Path — Unsafe Typed Arrays (Fastest)

Direct typed array access. No bounds checking. Use in system `update()` loops.

```typescript
// Read
const x = this._transform.unsafe.positionX[entity];

// Write
this._transform.unsafe.positionX[entity] = 100;
this._transform.unsafe.positionY[entity] = 200;
```

### Convenient — Cursor (Single Entity)

Object-like access for setup/initialization code. Slower than unsafe.

```typescript
const cursor = this._transform.getCursor(entity);
cursor.positionX = 100;
cursor.positionY = 200;
// cursor.positionX also readable
```

### Component Set (Bulk Init)

Set multiple fields at once:

```typescript
this._transform.set(entity, {
  positionX: 100,
  positionY: 200,
  prevPositionX: 100,  // ALWAYS set prev = current on spawn!
  prevPositionY: 200,
});
```

## Entity Lifecycle

### Creating Entities

```typescript
const entity = this._entities.createEntity();
this._entities.addComponent(entity, Transform2d);
this._entities.addComponent(entity, PlayerBody);

// Set initial data
this._transform.set(entity, {
  positionX: spawnX,
  positionY: spawnY,
  prevPositionX: spawnX,   // MUST match position to avoid interpolation jump
  prevPositionY: spawnY,
});
this._playerBody.set(entity, { playerSlot: slot, radius: 20 });
```

### Removing Entities

```typescript
this._entities.removeEntity(entity);
// Entity ID goes to recycling stack, will be reused
```

### Adding/Removing Components

```typescript
// Add component to existing entity
this._entities.addComponent(entity, Frozen);  // tag component

// Remove component
this._entities.removeComponent(entity, Frozen);

// Check if entity has component
if (this._entities.hasComponent(entity, Frozen)) { ... }
```

### Component Masks

Entity presence in filters is determined by component bitmasks. When you add/remove a component, the entity automatically enters/leaves matching filters.

## Prefabs

Prefabs provide a fluent API for entity creation with multiple components:

```typescript
import { Prefab } from '@lagless/core';

// In a system:
const entity = Prefab.create(this._entities)
  .with(Transform2d, { positionX: 0, positionY: 0, prevPositionX: 0, prevPositionY: 0 })
  .with(PlayerBody, { playerSlot: slot, radius: 20 })
  .with(Velocity2d, { velocityX: 0, velocityY: 0 })
  .build();
```

## Filter Iteration

Filters are iterable — they yield entity IDs matching their include/exclude masks.

```typescript
// Basic iteration
for (const entity of this._filter) {
  const x = this._transform.unsafe.positionX[entity];
  // ...
}

// Check filter length
if (this._filter.length === 0) return;

// Access underlying array (advanced)
const entities = this._filter.entities; // number[]
```

**Filter data lives in the ArrayBuffer** — it's automatically restored on rollback.

## PRNG (Deterministic Random)

The PRNG state is stored in the ArrayBuffer, so it's restored on rollback. **Never use `Math.random()`.**

```typescript
@ECSSystem()
export class SpawnSystem implements IECSSystem {
  constructor(private readonly _prng: PRNG) {}

  update(tick: number): void {
    // Random float in [0, 1)
    const f = this._prng.getFloat();

    // Random integer in [from, to) — exclusive upper bound
    const x = this._prng.getRandomInt(-500, 500);

    // Random integer in [from, to] — inclusive upper bound
    const y = this._prng.getRandomIntInclusive(1, 6);
  }
}
```

## Player Resources

Per-player data indexed by slot (0 to maxPlayers-1). Stored in the ArrayBuffer.

```typescript
@ECSSystem()
export class ScoreSystem implements IECSSystem {
  constructor(private readonly _playerResource: PlayerResource) {}

  update(tick: number): void {
    // Read
    const score = this._playerResource.score[slot];

    // Write
    this._playerResource.score[slot] += 100;

    // Check connection
    if (this._playerResource.connected[slot]) { ... }
  }
}
```

## ECSConfig

Access simulation configuration:

```typescript
@ECSSystem()
export class MySystem implements IECSSystem {
  constructor(private readonly _config: ECSConfig) {}

  update(tick: number): void {
    const maxE = this._config.maxEntities;    // default 1024
    const maxP = this._config.maxPlayers;     // default 4
    const dt = this._config.frameLength;       // seconds per tick (e.g., 1/20)
    const rate = this._config.tickRate;        // ticks per second (e.g., 20)
  }
}
```

## System Registration

Systems must be registered in the systems array in `systems/index.ts`. **Order matters** — systems execute sequentially in array order every tick.

```typescript
import { IECSSystemClass } from '@lagless/core';
import { SavePrevTransformSystem } from './save-prev-transform.system.js';
import { PlayerConnectionSystem } from './player-connection.system.js';
import { ApplyMoveInputSystem } from './apply-move-input.system.js';
import { IntegrateSystem } from './integrate.system.js';
import { BoundarySystem } from './boundary.system.js';
import { PlayerLeaveSystem } from './player-leave.system.js';
import { HashVerificationSystem } from './hash-verification.system.js';

export const systems: IECSSystemClass[] = [
  SavePrevTransformSystem,     // 1. Store prev positions for interpolation
  PlayerConnectionSystem,      // 2. Handle join/leave events
  ApplyMoveInputSystem,        // 3. Read player inputs
  IntegrateSystem,             // 4. Apply velocities
  BoundarySystem,              // 5. Enforce boundaries
  PlayerLeaveSystem,           // 6. Cleanup disconnected entities
  HashVerificationSystem,      // 7. ALWAYS LAST — divergence detection
];
```

## Complete System Example

A system that reads move inputs, sanitizes them, and applies velocity:

```typescript
import { ECSSystem, IECSSystem, AbstractInputProvider, ECSConfig } from '@lagless/core';
import { MathOps } from '@lagless/math';
import { Transform2d, Velocity2d, PlayerBody, PlayerFilter, MoveInput } from '../code-gen/core.js';

const finite = (v: number): number => Number.isFinite(v) ? v : 0;

@ECSSystem()
export class ApplyMoveInputSystem implements IECSSystem {
  constructor(
    private readonly _input: AbstractInputProvider,
    private readonly _transform: Transform2d,
    private readonly _velocity: Velocity2d,
    private readonly _playerBody: PlayerBody,
    private readonly _filter: PlayerFilter,
    private readonly _config: ECSConfig,
  ) {}

  update(tick: number): void {
    const rpcs = this._input.collectTickRPCs(tick, MoveInput);
    for (const rpc of rpcs) {
      const slot = rpc.meta.playerSlot;

      // ALWAYS sanitize RPC data
      let dirX = finite(rpc.data.directionX);
      let dirY = finite(rpc.data.directionY);
      dirX = MathOps.clamp(dirX, -1, 1);
      dirY = MathOps.clamp(dirY, -1, 1);

      // Find entity for this player slot
      for (const entity of this._filter) {
        if (this._playerBody.unsafe.playerSlot[entity] !== slot) continue;

        const speed = 200 * this._config.frameLength;
        this._velocity.unsafe.velocityX[entity] = dirX * speed;
        this._velocity.unsafe.velocityY[entity] = dirY * speed;
        break;
      }
    }
  }
}
```
