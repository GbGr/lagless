# CLAUDE.md

## What This Is

<%= projectName %> is a multiplayer browser game built with **Lagless** — a deterministic ECS framework with simulate/rollback netcode. All simulation state lives in a single ArrayBuffer. Server relays inputs, clients run deterministic simulation.

## Commands

```bash
pnpm install                # Install dependencies
pnpm codegen                # Regenerate ECS code from schema (MUST run after schema changes)
pnpm dev                    # Start backend + frontend + dev-player (all at once)
pnpm dev:backend            # Game server only (Bun, auto-reload)
pnpm dev:frontend           # Frontend only (Vite HMR)
pnpm dev:player             # Dev-player multiplayer testing tool (port 4210)
```

## Project Structure

```
<%= packageName %>-simulation/       # Shared deterministic game logic
  src/lib/schema/ecs.yaml           # ECS schema definition → run pnpm codegen
  src/lib/code-gen/                  # GENERATED — never edit manually
  src/lib/systems/                   # Game systems (execution order = array order)
  src/lib/signals/                   # Rollback-aware events
  src/lib/arena.ts                   # Arena config (systems, signals, ECS config)
<%= packageName %>-frontend/         # React + Pixi.js game client
  src/app/game-view/                 # Pixi rendering components
  src/app/screens/                   # Game screens (title, game)
  src/app/hooks/                     # React hooks (match start, inputs)
<%= packageName %>-backend/          # Bun game server (relay model, NO simulation)
  src/main.ts                        # Server entry point
  src/game-hooks.ts                  # Room lifecycle hooks
```

## Quick Recipe: Adding a Feature

1. **Schema** — Add components/inputs/filters to `<%= packageName %>-simulation/src/lib/schema/ecs.yaml`
2. **Codegen** — Run `pnpm codegen`
3. **System** — Create `my-feature.system.ts` with `@ECSSystem()` decorator
4. **Register** — Add system to `systems` array in `systems/index.ts` (order matters!)
5. **Render** — Add Pixi.js view component using `filterView()` or `<FilterViews>`
6. **Input** — Wire UI events via `drainInputs` in runner-provider

## ECS System Pattern

```typescript
import { ECSSystem, IECSSystem } from '@lagless/core';

@ECSSystem()
export class MySystem implements IECSSystem {
  constructor(
    private readonly _transform: Transform2d,      // component (unsafe typed arrays)
    private readonly _filter: PlayerFilter,         // filter (iterable entity list)
    private readonly _entities: EntitiesManager,    // entity CRUD
    private readonly _prng: PRNG,                   // deterministic random
    private readonly _config: ECSConfig,            // simulation config
  ) {}

  update(tick: number): void {
    for (const entity of this._filter) {
      this._transform.unsafe.positionX[entity] += 1;
    }
  }
}
```

## Input Handling Pattern

```typescript
// In runner-provider.tsx — drainInputs callback:
drainInputs={(tick, addRPC) => {
  const dir = getDirection(); // from keyboard/joystick
  addRPC(MoveInput, { directionX: dir.x, directionY: dir.y });
}}

// In system — reading inputs:
const rpcs = this._input.collectTickRPCs(tick, MoveInput);
for (const rpc of rpcs) {
  const slot = rpc.meta.playerSlot;
  const dirX = finite(rpc.data.directionX); // ALWAYS sanitize!
  const dirY = finite(rpc.data.directionY);
  // use dirX, dirY...
}

// Sanitization helper:
const finite = (v: number): number => Number.isFinite(v) ? v : 0;
```

## Rendering Pattern

```typescript
// FilterViews — auto-manages lifecycle for entities matching a filter
<FilterViews filter={runner.Core.PlayerFilter} View={PlayerView} />

// filterView — define a view component for an entity
const PlayerView = filterView(({ entity }, ref) => {
  const transform = runner.Core.Transform2d;
  // onCreate: set up sprites
  // Return Pixi container
  return <pixiContainer ref={ref} />;
}, {
  onUpdate: ({ entity }, container, runner) => {
    container.position.set(
      transform.unsafe.positionX[entity],
      transform.unsafe.positionY[entity]
    );
  },
});
```

## Signal Pattern (Rollback-Aware Events)

```typescript
// Define signal in signals/index.ts:
@ECSSignal()
export class ScoreSignal extends Signal<{ slot: number; points: number }> {}

// Emit in system:
this._scoreSignal.emit(tick, { slot: 0, points: 100 });

// Subscribe in view (three streams):
signal.Predicted.subscribe(e => playSound());   // instant feedback
signal.Verified.subscribe(e => updateScore());   // survived all rollbacks
signal.Cancelled.subscribe(e => undoSound());    // was rolled back
```

## DETERMINISM RULES (CRITICAL)

**Breaking these causes permanent desync between clients — game becomes unplayable.**

**ALWAYS use:**
- `MathOps.sin/cos/atan2/sqrt/clamp` — WASM-backed, deterministic across platforms
- `PRNG.getFloat()/getRandomInt()` — deterministic random (state in ArrayBuffer)
- Set `prevPositionX/Y = positionX/Y` when spawning entities (avoids interpolation jump)

**NEVER use in simulation code:**
- `Math.sin/cos/tan/atan2/sqrt/pow/log` — platform-dependent floating point
- `Math.random()` — non-deterministic
- `Date.now()` or `performance.now()` — non-deterministic
- `Array.sort()` without explicit comparator — unstable sort order
- `for...in` on objects — non-deterministic key order
- `Map/Set` iteration — insertion-order dependent on network timing

**SAFE Math functions (platform-identical):**
`Math.abs`, `Math.min`, `Math.max`, `Math.floor`, `Math.ceil`, `Math.round`, `Math.trunc`, `Math.sign`, `Math.fround`

## Input Validation Rules

All RPC data from players is potentially malicious. **In every system reading RPCs:**

1. `Number.isFinite(value)` FIRST — rejects NaN and Infinity
2. `MathOps.clamp(value, min, max)` SECOND — bounds to valid range
3. **Never** `MathOps.clamp(NaN, min, max)` — returns NaN, propagates everywhere

```typescript
const finite = (v: number): number => Number.isFinite(v) ? v : 0;
let dirX = MathOps.clamp(finite(rpc.data.directionX), -1, 1);
```

## Schema Quick Reference

```yaml
components:
  MyComponent:
    field: float32          # Types: uint8, uint16, uint32, int8, int16, int32, float32, float64
    arrayField: uint8[16]   # Fixed-size array
  TagComponent: {}          # Empty = tag (bitmask only, zero memory per entity)

singletons:
  GameState:
    phase: uint8

playerResources:
  PlayerResource:
    score: uint32

inputs:
  MyInput:
    value: float32

filters:
  MyFilter:
    include: [Transform2d, MyComponent]
    exclude: [Frozen]       # Optional
```

## Key APIs Cheat Sheet

| Class | Purpose | Access |
|-------|---------|--------|
| `EntitiesManager` | Create/remove entities, add/remove components | DI constructor |
| `Component.unsafe.field[entity]` | Read/write component data (hot path) | DI constructor |
| `Component.getCursor(entity)` | Convenient single-entity access | DI constructor |
| `Filter` | Iterate entities matching component mask | DI constructor, iterable |
| `PRNG` | Deterministic random: `getFloat()`, `getRandomInt(from, to)` | DI constructor |
| `ECSConfig` | `maxEntities`, `maxPlayers`, `frameLength`, `tickRate` | DI constructor |
| `AbstractInputProvider` | `collectTickRPCs(tick, InputClass)` | DI constructor |
| `Signal` | `emit(tick, data)` / `.Predicted/.Verified/.Cancelled.subscribe()` | DI constructor |
| `Singleton` | Global typed fields, `singleton.field` | DI constructor |
| `PlayerResource` | Per-player data, `playerResource.field[slot]` | DI constructor |
<% if (simulationType === 'physics2d') { -%>
| `PhysicsWorldManager2d` | Create/remove bodies and colliders | DI constructor |
| `CollisionEvents2d` | Drain collision start/end events | DI constructor |
<% } else if (simulationType === 'physics3d') { -%>
| `PhysicsWorldManager3d` | Create/remove bodies and colliders | DI constructor |
| `CollisionEvents3d` | Drain collision start/end events | DI constructor |
<% } -%>

## System Execution Order

Systems run in array order every tick. Canonical ordering:

1. `SavePrevTransformSystem` — store previous positions for interpolation
2. `PlayerConnectionSystem` — handle join/leave server events
3. `ApplyMoveInputSystem` — read RPCs, apply to entities
<% if (simulationType === 'physics2d') { -%>
4. `PhysicsStepSystem` — step Rapier 2D, sync transforms
<% } else if (simulationType === 'physics3d') { -%>
4. `PhysicsStepSystem` — step Rapier 3D, sync transforms
<% } else { -%>
4. Game logic systems (integrate, damping, boundary, etc.)
<% } -%>
5. `PlayerLeaveSystem` — cleanup disconnected player entities
6. `HashVerificationSystem` — detect simulation divergence (always last)

## Detailed Documentation

| File | Contents |
|------|----------|
| [docs/01-schema-and-codegen.md](docs/01-schema-and-codegen.md) | YAML schema format, field types, codegen workflow, generated files |
| [docs/02-ecs-systems.md](docs/02-ecs-systems.md) | Writing systems, DI tokens, entity lifecycle, prefabs, PRNG |
| [docs/03-determinism.md](docs/03-determinism.md) | **CRITICAL** — determinism rules, pitfalls, debugging divergence |
| [docs/04-input-system.md](docs/04-input-system.md) | RPCs, drainInputs, collectTickRPCs, sanitization, server events |
| [docs/05-signals.md](docs/05-signals.md) | Predicted/Verified/Cancelled events, rollback behavior |
| [docs/06-rendering.md](docs/06-rendering.md) | FilterViews, VisualSmoother, Pixi.js patterns |
| [docs/07-multiplayer.md](docs/07-multiplayer.md) | Relay architecture, RoomHooks, state transfer, reconnect |
<% if (simulationType === 'physics2d') { -%>
| [docs/08-physics2d.md](docs/08-physics2d.md) | Rapier 2D integration, bodies, colliders, collision events |
<% } else if (simulationType === 'physics3d') { -%>
| [docs/08-physics3d.md](docs/08-physics3d.md) | Rapier 3D integration, character controller, animation |
<% } -%>
| [docs/09-recipes.md](docs/09-recipes.md) | Step-by-step cookbook for common game features |
| [docs/10-common-mistakes.md](docs/10-common-mistakes.md) | "Never do X" reference + error solutions |
| [docs/api-quick-reference.md](docs/api-quick-reference.md) | One-page API cheat sheet |

## Source Reference

`docs/sources/lagless/` contains a full clone of the Lagless framework repository for deep reference.
- `libs/` — all framework library source code
- `circle-sumo/` — complete example game (2D, gameplay focused)
- `sync-test/` — determinism verification test bench
- `roblox-like/` — 3D example with character controller + BabylonJS

**Do NOT import from `docs/sources/`** — always use `@lagless/*` npm packages.
