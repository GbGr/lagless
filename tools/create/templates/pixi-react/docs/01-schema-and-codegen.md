# Schema & Codegen

## Overview

All ECS structure is defined in a single YAML file: `<game>-simulation/src/lib/schema/ecs.yaml`. After editing, run `pnpm codegen` to regenerate TypeScript code into `src/lib/code-gen/`.

**Never edit files in `code-gen/` manually** — they are overwritten on every codegen run.

## Codegen Command

```bash
pnpm codegen
# Or directly:
npx @lagless/codegen -c <game>-simulation/src/lib/schema/ecs.yaml
```

## Field Types

| YAML Type | TypedArray | Bytes | Range |
|-----------|-----------|-------|-------|
| `uint8` | Uint8Array | 1 | 0 to 255 |
| `uint16` | Uint16Array | 2 | 0 to 65,535 |
| `uint32` | Uint32Array | 4 | 0 to 4,294,967,295 |
| `int8` | Int8Array | 1 | -128 to 127 |
| `int16` | Int16Array | 2 | -32,768 to 32,767 |
| `int32` | Int32Array | 4 | -2,147,483,648 to 2,147,483,647 |
| `float32` | Float32Array | 4 | ~7 significant digits |
| `float64` | Float64Array | 8 | ~15 significant digits |
| `uint8[N]` | Uint8Array | N | Fixed-size byte array (e.g., UUIDs) |

## Components

Components define per-entity data stored in Structure-of-Arrays layout.

```yaml
components:
  # Regular component with fields
  Transform2d:
    positionX: float32
    positionY: float32
    prevPositionX: float32
    prevPositionY: float32

  # Component with mixed types
  PlayerBody:
    playerSlot: uint8
    radius: float32
    health: uint16

  # Tag component — no fields, zero memory, bitmask-only
  Frozen: {}

  # Also a tag (equivalent to {})
  Dead:
```

### Tag Components

Components with no fields (`{}` or empty body) are automatically detected as **tags**. They:
- Occupy zero memory per entity (only a bitmask bit)
- Work in filters and prefabs like normal components
- Used for state flags: `Frozen`, `Dead`, `Invincible`, etc.

### Component IDs

Component IDs are sequential bit indices (0, 1, 2, ...) assigned in YAML declaration order. The framework supports up to **64 component types** (auto-detected: 1 Uint32 mask word for ≤32, 2 words for 33-64).

## Singletons

Global typed fields — one copy per simulation (not per entity).

```yaml
singletons:
  GameState:
    gamePhase: uint8       # 0=lobby, 1=playing, 2=gameover
    roundTimer: uint32
    arenaRadius: float32
```

Access in systems: `this._gameState.gamePhase` (read/write directly).

## Player Resources

Per-player data indexed by player slot (0 to maxPlayers-1).

```yaml
playerResources:
  PlayerResource:
    id: uint8[16]                  # Player UUID
    entity: uint32                 # Player's entity ID
    connected: uint8               # Boolean: is connected
    score: uint32
    lastReportedHash: uint32       # Required for hash verification
    lastReportedHashTick: uint32   # Required for hash verification
    hashMismatchCount: uint16      # Required for hash verification
```

Access in systems: `this._playerResource.score[slot]`.

**Hash verification fields** (`lastReportedHash`, `lastReportedHashTick`, `hashMismatchCount`) are required if you use hash-based divergence detection.

## Inputs (RPCs)

Inputs define the data structure for client→server→client messages.

```yaml
inputs:
  # Server event — emitted by server hooks (onPlayerJoin, etc.)
  PlayerJoined:
    slot: uint8
    playerId: uint8[16]

  PlayerLeft:
    slot: uint8
    reason: uint8

  # Player input — sent by client via drainInputs/addRPC
  MoveInput:
    directionX: float32
    directionY: float32

  # Hash reporting — required for divergence detection
  ReportHash:
    hash: uint32
    atTick: uint32
```

### Input Conventions
- **Server events** (PlayerJoined, PlayerLeft): emitted by `ctx.emitServerEvent()` in RoomHooks
- **Player inputs** (MoveInput, etc.): sent by client via `addRPC()` in `drainInputs`
- **ReportHash**: automatically sent by `createHashReporter()` — don't send manually

## Filters

Filters maintain live entity lists matching include/exclude component masks.

```yaml
filters:
  PlayerFilter:
    include: [Transform2d, PlayerBody]

  MovingFilter:
    include: [Transform2d, Velocity2d]

  FrozenPlayerFilter:
    include: [Transform2d, PlayerBody, Frozen]

  ActivePlayerFilter:
    include: [Transform2d, PlayerBody]
    exclude: [Frozen, Dead]
```

Filters are iterable in systems: `for (const entity of this._filter) { ... }`.
Filter data lives in the shared ArrayBuffer and is restored on rollback.

## Simulation Type

The `simulationType` field enables physics engine integration:

```yaml
# No physics — manual velocity/position management
# (default, no simulationType field needed)

# Rapier 2D physics
simulationType: physics2d

# Rapier 3D physics
simulationType: physics3d
```

### Auto-Prepended Components

When `simulationType: physics2d`:
- **Transform2d** (6 fields): `positionX`, `positionY`, `rotation`, `prevPositionX`, `prevPositionY`, `prevRotation`
- **PhysicsRefs**: `bodyHandle: float64`, `colliderHandle: float64`, `bodyType: uint8`, `collisionLayer: uint16`
- **PhysicsRefsFilter** automatically created

When `simulationType: physics3d`:
- **Transform3d** (14 fields): `positionX/Y/Z`, `rotationX/Y/Z/W`, `prevPositionX/Y/Z`, `prevRotationX/Y/Z/W`
- **PhysicsRefs**: same as 2D
- **PhysicsRefsFilter** automatically created

**Do NOT declare Transform2d/Transform3d or PhysicsRefs manually** when using a simulationType — they are auto-prepended.

## Generated Files

After running `pnpm codegen`, the following files are generated in `src/lib/code-gen/`:

| File | Contents |
|------|----------|
| `core.ts` | All component classes, singleton classes, filter classes, player resource classes |
| `runner.ts` | `<ProjectName>Runner` class extending `ECSRunner` with typed `Core` accessor |
| `input-registry.ts` | `<ProjectName>InputRegistry` with all input types registered |
| `prefabs.ts` | Helper prefab builders for common entity archetypes |

The runner class provides typed access to all ECS objects:
```typescript
runner.Core.Transform2d          // component
runner.Core.PlayerFilter         // filter
runner.Core.GameState            // singleton
runner.Core.PlayerResource       // player resource
```

## Common Schema Patterns

### Player Entity
```yaml
components:
  PlayerBody:
    playerSlot: uint8
    radius: float32
    health: uint16
    maxHealth: uint16

filters:
  PlayerFilter:
    include: [Transform2d, PlayerBody]
```

### Projectile with Lifetime
```yaml
components:
  Projectile:
    ownerSlot: uint8
    damage: uint16
    spawnTick: uint32
    lifetimeTicks: uint16
  Velocity2d:
    velocityX: float32
    velocityY: float32

filters:
  ProjectileFilter:
    include: [Transform2d, Projectile, Velocity2d]
```

### Game Phases via Singleton
```yaml
singletons:
  GameState:
    gamePhase: uint8        # enum: 0=waiting, 1=countdown, 2=playing, 3=gameover
    phaseStartTick: uint32
    roundNumber: uint8
```
