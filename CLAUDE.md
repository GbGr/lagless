# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Lagless is a **deterministic ECS framework** for real-time multiplayer browser games. TypeScript, simulate/rollback netcode, all simulation state in a single ArrayBuffer. Server relays inputs but does NOT run simulation — clients are authoritative on determinism, server is authoritative on time and input acceptance.

## Commands

```bash
# Install
pnpm install

# Build / test / lint / typecheck a specific library
pnpm exec nx build @lagless/core
pnpm exec nx test @lagless/core
pnpm exec nx lint @lagless/core
pnpm exec nx typecheck @lagless/core

# Run all tests (vitest workspace: binary, math, misc, core, net-wire, relay-server, relay-client, matchmaking)
npx vitest run

# Run tests for one library
npx vitest run --project=@lagless/core

# Run a single test file
npx vitest run --project=@lagless/core src/lib/input/rpc-history.spec.ts

# CI command (runs everything)
pnpm exec nx run-many -t lint test build typecheck

# ECS codegen from YAML schema
pnpm exec nx g @lagless/codegen:ecs --configPath circle-sumo/circle-sumo-simulation/src/lib/schema/ecs.yaml

# Run Circle Sumo example:
# Terminal 1 — game server (Bun)
cd circle-sumo/game-server && bun run src/main.ts
# Terminal 2 — game client (Vite)
pnpm exec nx serve @lagless/circle-sumo-game
```

## Architecture

### Dependency Graph

```
binary ──┐
math ────┤
         ├─► misc ──┬─► core ──────────────┬─► relay-client
         │          ├─► net-wire ───────────┤
         │          ├─► matchmaking         ├─► relay-server
         │          └───────────────────────┘
         └─► game-simulation ──► game-client
                                 game-server
```

### Memory Model (core)

All ECS state lives in **one contiguous ArrayBuffer** with Structure-of-Arrays layout:

```
ArrayBuffer
├─ TickManager          (Uint32: current tick)
├─ PRNGManager          (Uint32[4]: xoshiro128** state)
├─ ComponentsManager    (SoA: each component field → TypedArray[maxEntities])
├─ SingletonsManager    (global typed fields)
├─ FiltersManager       (per-filter: Uint32 length + Uint32[maxEntities] entity IDs)
├─ EntitiesManager      (nextId, removedStack, componentMasks: Uint32[maxEntities])
└─ PlayerResourcesManager (per-player typed fields × maxPlayers)
```

Snapshot = `ArrayBuffer.slice(0)`. Rollback = `Uint8Array.set()` from snapshot. PRNG state is in the buffer, so it restores on rollback automatically.

### Entity System

- Entity = integer index (0 to maxEntities-1). Component presence tracked via `Uint32` bitmask (max 32 component types).
- Component IDs are powers of 2, assigned by codegen in YAML declaration order.
- Filters maintain live entity lists matching include/exclude component masks. Filter data is in the shared ArrayBuffer — restored on rollback.
- Entity recycling via LIFO removed-stack. Sentinel: `0xFFFFFFFF`.

### Simulation Loop (ECSSimulation.update)

```
1. clock.update(dt)              — advance accumulatedTime + PhaseNudger correction
2. targetTick = floor(accTime / frameLength)
3. checkAndRollback()            — if inputProvider says rollback needed
4. simulationTicks(current, target):
   for each tick:
     a. tickManager.setTick(++tick)
     b. systems[i].update(tick)   — sequential, deterministic order
     c. signalsRegistry.onTick()  — verify/cancel predictions
     d. saveSnapshot (if snapshotRate match)
5. inputProvider.update()         — drain input sources, send to server
6. interpolationFactor = leftover / frameLength
```

### Input System

RPCs have deterministic ordering: sorted by `(playerSlot, ordinal, seq)` — identical regardless of network arrival order. Input delay: local inputs are scheduled at `currentTick + inputDelay` ticks ahead, giving them time to reach the server before that tick.

**InputProvider hierarchy:**
- `AbstractInputProvider` — base class with drainers, RPCHistory, sequence management
- `LocalInputProvider` — single-player, no rollback
- `ReplayInputProvider` — pre-recorded inputs from binary
- `RelayInputProvider` (relay-client) — multiplayer: prediction + rollback on remote inputs/CancelInput

### Signals (Rollback-Aware Events)

```
System emits signal → Predicted fires (play sound, show VFX)
Tick verified (maxInputDelayTick later):
  - Still present → Verified fires
  - Missing after rollback → Cancelled fires (stop sound)
```

### Relay Multiplayer Architecture

**Server side (relay-server):** `RelayRoom` is sealed — game behavior injected via `RoomHooks<TResult>` callbacks (`onPlayerJoin`, `onPlayerLeave`, `onPlayerFinished`, `onMatchEnd`, etc.). Hooks receive `RoomContext` for safe room interaction (`emitServerEvent`, `getPlayers`, `endMatch`).

**Client side (relay-client):** `RelayInputProvider` handles local prediction, remote input injection from `TickInputFanout`, rollback on `CancelInput`, clock sync via Pong, adaptive input delay via `InputDelayController`.

**Protocol (net-wire):** Binary messages — ServerHello, TickInput, TickInputFanout, CancelInput, Ping/Pong, StateRequest/Response, PlayerFinished. Float64 timestamps for sub-ms precision.

**Matchmaking:** Scoped queues (scope = game type string). `MatchmakingService` with pluggable `QueueStore` (default: `InMemoryQueueStore`). Match formation: FIFO + optional MMR proximity, bot fill on timeout.

### DI System

Decorators `@ECSSystem()` and `@ECSSignal()` use `reflect-metadata` for constructor parameter type inference. All components, singletons, filters, managers are registered in the DI `Container` by `ECSRunner` and resolved automatically.

```typescript
@ECSSystem()
class PhysicsSystem implements IECSSystem {
  constructor(
    private readonly _transform: Transform2d,    // component
    private readonly _filter: Velocity2dFilter,  // filter
    private readonly _entities: EntitiesManager,  // manager
    private readonly _prng: PRNG,                // deterministic RNG
  ) {}
  update(tick: number) { /* ... */ }
}
```

**SWC requirement:** Libs using decorators (core, simulation) build with SWC (`transform.decoratorMetadata = true`, `legacyDecorator = true`). Tests for these libs use `unplugin-swc` vite plugin.

## Build System

- **Monorepo:** Nx 21.6, pnpm workspaces
- **TypeScript:** 5.9, strict, ES2022, ESM, composite project references
- **Build:** tsc for most libs, SWC for libs with decorators (core, simulations)
- **Client apps:** Vite 7 + React 19 + Pixi.js 8
- **Game servers:** Bun (native WebSocket, runs TypeScript directly)
- **Tests:** Vitest 3.2 with workspace mode, `globals: true` (no import needed for describe/it/expect)

### Source Resolution

All built libs use a `@lagless/source` custom condition in package.json exports:
```json
{ "@lagless/source": "./src/index.ts", "import": "./dist/index.js" }
```
`tsconfig.base.json` has `customConditions: ["@lagless/source"]` so bundlers resolve to source TS. Bun servers use `bunfig.toml` with `[resolve].conditions = ["@lagless/source"]` to skip building libs during development.

Source-only libs (react, pixi-react) point `main` directly to `./src/index.ts` — no build step.

## Creating a New Game

Create three packages: `my-game/my-game-simulation/`, `my-game/my-game-client/`, `my-game/game-server/`.

1. **Simulation:** Write a YAML schema (`ecs.yaml`), run codegen, write systems (`@ECSSystem()`) and signals (`@ECSSignal()`). Systems array order = execution order.
2. **Client:** React + Pixi.js. Create input provider (Local or Relay), pass to `ECSRunner` via generated runner class. Use `drainInputs()` to connect UI to input system.
3. **Server:** Bun app. Wire `RoomRegistry` + `MatchmakingService`. Implement `RoomHooks` for game-specific logic (player join/leave events, match results, DB persistence).

## Code Conventions

- Single quotes, 120 char line width, 2-space indent (Prettier)
- File naming: kebab-case. Systems: `*.system.ts`
- Generated code lives in `code-gen/` directories — **never edit manually**, always regenerate from YAML
- All deterministic math must use `MathOps` (WASM-backed sin/cos/atan2/sqrt), never `Math.*` trig functions
- `MathOps.init()` must be called (async) before any simulation starts
- `Vector2` has three variants per operation: `.addToNew()`, `.addToRef()`, `.addInPlace()` — prefer `ToRef`/`InPlace` in hot paths to avoid allocations
- `VECTOR2_BUFFER_1..10` are pre-allocated scratch vectors for use in systems
- `@abraham/reflection` must be imported before any decorated class (typically in app entry point)
- Cross-package deps use `workspace:*` protocol
- ESM everywhere — internal imports in built libs use `.js` extension

## Key Design Constraints

- **32 component types max** (Uint32 bitmask). Upgrade path: two Uint32 words.
- **Determinism is paramount.** Same inputs + same seed = identical simulation on every client. Any system logic touching PRNG, math, or input ordering must preserve this.
- **Server never runs simulation.** Relay model trusts clients. Cheat detection would require server-side replay (not implemented).
- **RPCHistory grows unbounded** — no pruning of old ticks. Acceptable for current game session lengths.
