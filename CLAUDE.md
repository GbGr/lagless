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
pnpm exec nx g @lagless/codegen:ecs --configPath sync-test/sync-test-simulation/src/lib/schema/ecs.yaml
pnpm exec nx g @lagless/codegen:ecs --configPath roblox-like/roblox-like-simulation/src/lib/schema/ecs.yaml

# Run Circle Sumo:
# Terminal 1 — game server
pnpm exec nx serve @lagless/circle-sumo-server
# Terminal 2 — game client (Vite, port 4200)
pnpm exec nx serve @lagless/circle-sumo-game

# Run Sync Test (determinism test bench):
# Terminal 1 — game server
pnpm exec nx serve @lagless/sync-test-server
# Terminal 2 — game client (Vite, port 4201)
pnpm exec nx serve @lagless/sync-test-game

# Run Roblox-Like (3D character controller test):
# Terminal 1 — game server
pnpm exec nx serve @lagless/roblox-like-server
# Terminal 2 — game client (Vite, port 4202)
pnpm exec nx serve @lagless/roblox-like-game

# Run Dev Player (multiplayer testing tool, port 4210):
# Requires game server + game client to be running
pnpm exec nx serve @lagless/dev-player
```

## Architecture

### Dependency Graph

```
binary ──┐
math ────┤
         ├─► misc ──┬─► core ──────────────┬─► relay-client
         │          ├─► net-wire ───────────┤
         │          ├─► matchmaking         ├─► relay-server
         │          └───────────────────────┘         │
         │                                            ▼
         │                                   relay-game-server
         │
         └─► physics-shared ──► physics2d (rapier2d)
         │                  └─► physics3d (rapier3d) ──► character-controller-3d
         │
         └─► animation-controller
         │
         └─► game-simulation ──► game-client
                                 game-server (uses relay-game-server + dev-tools)

dev-tools ──► relay-server, relay-game-server (dev-only, never in production)

Games: circle-sumo (gameplay), sync-test (determinism/late-join/reconnect testing), roblox-like (3D character controller + BabylonJS)
Tools: dev-player (multiplayer testing UI, port 4210)
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
├─ EntitiesManager      (nextId, removedStack, componentMasks: Uint32[maxEntities × maskWords])
└─ PlayerResourcesManager (per-player typed fields × maxPlayers)
```

Snapshot = `ArrayBuffer.slice(0)`. Rollback = `Uint8Array.set()` from snapshot. PRNG state is in the buffer, so it restores on rollback automatically.

### Entity System

- Entity = integer index (0 to maxEntities-1). Component presence tracked via bitmask (up to 64 component types).
- Component IDs are sequential bit indices (0, 1, 2, ...), assigned by codegen in YAML declaration order. Mask width auto-detected: 1 Uint32 word for ≤32 components, 2 words for 33-64.
- **Tag components:** Components with no fields (`Frozen:` or `Frozen: {}` in YAML) are auto-detected as tags. Zero memory per entity, only occupy a bitmask bit. Work in filters and prefabs like normal components.
- Filters maintain live entity lists matching include/exclude component masks (`number[]`). Filter data is in the shared ArrayBuffer — restored on rollback.
- Entity recycling via LIFO removed-stack. Sentinel: `0xFFFFFFFF` (all mask words).

### Simulation Loop (ECSSimulation.update)

```
1. clock.update(dt)              — advance accumulatedTime + PhaseNudger correction
2. targetTick = floor(accTime / frameLength)
3. checkAndRollback()            — if inputProvider says rollback needed
4. simulationTicks(current, target):
   for each tick:
     a. tickManager.setTick(++tick)
     b. systems[i].update(tick)          — sequential, deterministic order
     c. hashHistory.set() (if interval)  — store hash for verified reporting
     d. signalsRegistry.onTick(verifiedTick) — verify/cancel predictions
     e. saveSnapshot (if snapshotRate match)
5. inputProvider.update()         — drain input sources, send to server
6. interpolationFactor = leftover / frameLength
```

### Input System

RPCs have deterministic ordering: sorted by `(playerSlot, ordinal, seq)` — identical regardless of network arrival order. Input delay: local inputs are scheduled at `currentTick + inputDelay` ticks ahead, giving them time to reach the server before that tick.

**InputProvider hierarchy:**
- `AbstractInputProvider` — base class with drainers, RPCHistory, sequence management, abstract `verifiedTick`
- `LocalInputProvider` — single-player, no rollback, `verifiedTick = tick`
- `ReplayInputProvider` — pre-recorded inputs from binary, `verifiedTick = tick`
- `RelayInputProvider` (relay-client) — multiplayer: prediction + rollback on remote inputs/CancelInput, `verifiedTick = maxServerTick - 1`

### Signals (Rollback-Aware Events)

Three event streams: **Predicted** (instant feedback), **Verified** (survived all rollbacks), **Cancelled** (rolled back). Verification is driven by `verifiedTick` — the latest tick guaranteed to never be rolled back. [Full documentation](SIGNALS.MD)

**`verifiedTick`** is an abstract getter on `AbstractInputProvider`:
- `LocalInputProvider` / `ReplayInputProvider`: `= simulation.tick` (immediate — no rollback possible)
- `RelayInputProvider`: `= max(received serverTick/sTick) - 1` (server-confirmed, hard guarantee)

`ECSSimulation` passes `inputProvider.verifiedTick` to `SignalsRegistry.onTick()` each tick. Signals process all ticks from `_lastVerifiedTick + 1` up to `verifiedTick` — comparing `_awaitingVerification` (what was predicted) against `_pending` (what exists after re-simulation).

### Visual Smoothing (misc)

`VisualSmoother2d` handles both sim↔render interpolation and rollback lag smoothing per entity. Takes raw ECS prev/current + interpolationFactor, outputs smoothed position. After rollback, absorbs the position jump into an offset that decays exponentially (`halfLife=200ms`), so entities slide smoothly instead of teleporting. Stores raw sim position (not smoothed) for next-frame comparison to avoid feedback loops.

### Relay Multiplayer Architecture

**Server side (relay-server):** `RelayRoom` is sealed — game behavior injected via `RoomHooks<TResult>` callbacks (`onPlayerJoin`, `onPlayerLeave`, `onPlayerFinished`, `onMatchEnd`, etc.). Hooks receive `RoomContext` for safe room interaction (`emitServerEvent`, `getPlayers`, `endMatch`).

**Client side (relay-client):** `RelayInputProvider` handles local prediction, remote input injection from `TickInputFanout`, rollback on `CancelInput`, clock sync via Pong, adaptive input delay via `InputDelayController`.

**Protocol (net-wire):** Binary messages — ServerHello, TickInput, TickInputFanout, CancelInput, Ping/Pong, StateRequest/Response, PlayerFinished. Float64 timestamps for sub-ms precision.

**Matchmaking:** Scoped queues (scope = game type string). `MatchmakingService` with pluggable `QueueStore` (default: `InMemoryQueueStore`). Match formation: FIFO + optional MMR proximity, bot fill on timeout.

### Late-Join & Reconnect (State Transfer)

When a player connects to a room that already has a running simulation (`serverTick > 0`):

1. Server sends `StateRequest` to all connected clients
2. Clients export `ArrayBuffer.slice(0)` snapshot + hash + tick via `StateResponse`
3. `StateTransfer` collects responses, picks majority hash (quorum)
4. Server sends the chosen `StateResponse` to the joining player
5. Server sends **post-state journal events** — only events with `tick > stateResult.tick` (events already baked into the state are NOT re-sent)
6. Client applies state via `ECSSimulation.applyExternalState()` — replaces ArrayBuffer, resets clock + snapshots

**Server events journal** (`_serverEventJournal` in `RelayRoom`): stores all server-emitted events (PlayerJoined, PlayerLeft, etc.). On first join (tick=0) or state transfer failure, the full journal is replayed. On successful state transfer, only post-state events are sent.

**Reconnect:** Same flow. `PlayerConnection` tracks `Disconnected` state with configurable timeout (`reconnectTimeoutMs`). If player reconnects before timeout, state transfer restores their simulation. `shouldAcceptReconnect` hook can reject.

### Hash Verification (core)

Reusable infrastructure for detecting simulation divergence between clients. Uses `verifiedTick` to ensure comparisons are based on finalized (post-rollback) state only.

- **`ECSSimulation.enableHashTracking(interval)`** — stores state hashes at the given tick interval during simulation. Call in runner-provider before `start()`.
- **`createHashReporter(runner, config)`** — reports hashes for verified ticks only (from hash history). Called from `drainInputs`.
- **`AbstractHashVerificationSystem`** — compares per-player hash reports, skipping reports where `lastReportedHashTick > verifiedTick`. Emits `DivergenceSignal` on mismatch.

Games wanting hash verification must include in `ecs.yaml`:
```yaml
playerResources:
  PlayerResource:
    lastReportedHash: uint32
    lastReportedHashTick: uint32
    hashMismatchCount: uint16
inputs:
  ReportHash:
    hash: uint32
    atTick: uint32
```

### Debug Panel (react)

Universal `<DebugPanel>` component in `@lagless/react`. Toggle with F3 (configurable). Shows network stats (RTT, jitter, input delay, nudger, tick, rollbacks, FPS). Opt-in hash verification table and divergence event log via `hashVerification` prop. Disconnect/reconnect buttons for testing.

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

## Creating New Packages (Libraries & Apps)

**Always use Nx generators** to scaffold new libraries and applications. Never create packages manually.

**New library (in `libs/`):**
```bash
# Standard lib (tsc):
pnpm exec nx g @nx/js:library --directory libs/<name> --importPath @lagless/<name> --publishable --bundler tsc --unitTestRunner vitest --linter eslint --minimal

# Lib with decorators (@ECSSystem, @ECSSignal — needs SWC):
pnpm exec nx g @nx/js:library --directory libs/<name> --importPath @lagless/<name> --publishable --bundler swc --unitTestRunner vitest --linter eslint --minimal
```

**New simulation package (in `<game>/<game>-simulation/`):**
```bash
# Simulations use SWC (decorators: @ECSSystem, @ECSSignal, reflect-metadata)
pnpm exec nx g @nx/js:library --directory <game>/<game>-simulation --importPath @lagless/<game>-simulation --bundler swc --unitTestRunner vitest --linter eslint --minimal
```

**New React game client (in `<game>/<game>-game/`):**
```bash
pnpm exec nx g @nx/react:application --directory <game>/<game>-game --name <game>-game --bundler vite --linter eslint --unitTestRunner vitest --e2eTestRunner none --style css --minimal
```

**After generation:** adjust the generated `package.json` to match project conventions — add `@lagless/source` export condition, `workspace:*` deps, `"type": "module"`. Update `tsconfig.json` with project references.

**Game servers (Bun)** have no matching Nx generator — minimal packages (package.json + tsconfig.json + bunfig.toml + src/). Copy from an existing game (e.g., `circle-sumo-server/`) and adjust.

## Creating a New Game

Create three packages: `my-game/my-game-simulation/`, `my-game/my-game-client/`, `my-game/my-game-server/`.

1. **Simulation:** Write a YAML schema (`ecs.yaml`), run codegen, write systems (`@ECSSystem()`) and signals (`@ECSSignal()`). Systems array order = execution order.
2. **Client:** React + Pixi.js. Create input provider (Local or Relay), pass to `ECSRunner` via generated runner class. Use `drainInputs()` to connect UI to input system. Add `<DebugPanel>` from `@lagless/react` for network debugging.
3. **Server:** Use `RelayGameServer` from `@lagless/relay-game-server`:
   ```typescript
   const server = new RelayGameServer({
     port: 3333,
     loggerName: 'MyGameServer',
     roomType: { name: 'my-game', config: { ... }, hooks: myGameHooks, inputRegistry: MyGameInputRegistry },
     matchmaking: { scope: 'my-game', config: { minPlayersToStart: 1, maxPlayers: 4, waitTimeoutMs: 5000 } },
   });
   server.start();
   ```
   Implement `RoomHooks` for game-specific logic (player join/leave events, match results, DB persistence). Add `customRoutes` for game-specific HTTP endpoints. Call `setupDevTools(server)` from `@lagless/dev-tools` for dev-player support.

## Code Conventions

- Single quotes, 120 char line width, 2-space indent (Prettier)
- File naming: kebab-case. Systems: `*.system.ts`
- Generated code lives in `code-gen/` directories — **never edit manually**, always regenerate from YAML
- All deterministic math must use `MathOps` (WASM-backed sin/cos/atan2/sqrt), never `Math.*` trig functions
- `MathOps.init()` must be called (async) before any simulation starts
- `Vector2` has three variants per operation: `.addToNew()`, `.addToRef()`, `.addInPlace()` — prefer `ToRef`/`InPlace` in hot paths to avoid allocations
- `VECTOR2_BUFFER_1..10` are pre-allocated scratch vectors for use in systems
- `@abraham/reflection` must be imported before any decorated class (typically in app entry point)
- When spawning entities with Transform2d, always set `prevPositionX/Y` and `prevRotation` equal to `positionX/Y` and `rotation` — otherwise interpolation produces a one-frame jump from (0,0)
- Cross-package deps use `workspace:*` protocol
- ESM everywhere — internal imports in built libs use `.js` extension

## Input Validation (RPC Sanitization)

**All RPC data from players must be treated as potentially malicious.** The binary layer validates message structure but does NOT validate field values — NaN, Infinity, and out-of-range numbers pass through network deserialization. A crafted packet can corrupt simulation state for all clients (NaN propagates through MathOps trig → into Rapier physics → permanent divergence).

**Rules for every system that reads RPC data:**
- **Check `Number.isFinite()` on every float field** before use. Replace non-finite values with a safe default (usually 0). `MathOps.clamp(NaN, min, max)` returns NaN — always check finiteness BEFORE clamping.
- **Clamp all float fields to their semantic range.** Direction vectors: clamp each component to [-1, 1]. Angles: any finite value is valid for trig functions. Speed/power: clamp to [0, 1] or the game's expected range.
- **Treat uint8 boolean fields as non-zero = true.** Uint8 values are auto-masked to 0-255 by `truncateToFieldType`, so they cannot overflow, but treat them as booleans (`!= 0`), never use the raw numeric value in arithmetic.
- **Validate early, in the "Apply Input" system** — the first system that reads RPCs. Never let unsanitized values reach movement, physics, or state systems.

**Sanitization pattern:**
```typescript
// Helper: returns 0 for NaN/Infinity, value otherwise
const finite = (v: number): number => Number.isFinite(v) ? v : 0;

// In apply-input system:
let dirX = finite(rpc.data.directionX);
let dirZ = finite(rpc.data.directionZ);
dirX = MathOps.clamp(dirX, -1, 1);
dirZ = MathOps.clamp(dirZ, -1, 1);
const cameraYaw = finite(rpc.data.cameraYaw);
```

**Why not validate in the framework?** The framework is game-agnostic — it doesn't know semantic ranges for game-specific RPCs. Validation belongs in game simulation code where the meaning of each field is known.

## Physics Libraries

- **[@lagless/physics-shared](libs/physics-shared/)** — Shared code: BodyType, ColliderEntityMap, CollisionLayers, CollisionEventsBase, PhysicsSimulationBase. No Rapier dependency.
- **[@lagless/physics3d](libs/physics3d/)** — Rapier 3D integration. [Documentation](libs/physics3d/README.md)
- **[@lagless/physics2d](libs/physics2d/)** — Rapier 2D integration. [Documentation](libs/physics2d/README.md)

Codegen: `simulationType: 'physics3d'` auto-prepends Transform3d (14 fields) + PhysicsRefs. `simulationType: 'physics2d'` auto-prepends Transform2d (6 fields) + PhysicsRefs.

## Character Controller & Animation

- **[@lagless/character-controller-3d](libs/character-controller-3d/)** — Deterministic 3D character movement via Rapier KCC. Config, manager, abstract system.
- **[@lagless/animation-controller](libs/animation-controller/)** — Deterministic animation FSM + view adapter. AnimationStateMachine, LocomotionBlendCalculator, AnimationViewAdapter.
- **[Character Controller Documentation](CHARACTER_CONTROLLER.MD)** — Architecture, best practices, system execution order.

Games: `roblox-like/` (3D character controller test with BabylonJS)

## Dev Tools

### Dev Player (`tools/dev-player/`)

Browser-based multiplayer testing tool. Opens N game instances in iframe grid, auto-matchmakes them via unique scope, displays per-instance stats, hash timeline for divergence detection, and latency controls.

**Architecture:**
- `@lagless/react` → `dev-bridge/` — postMessage protocol between parent (dev-player) and child (game iframe). `DevBridge` class + `useDevBridge(runner)` hook. Tree-shakeable — no-op without `?devBridge=true` URL param.
- `@lagless/dev-tools` — Server-side plugin package. `setupDevTools(server)` registers per-player latency API route. **Never import in production.**
- `tools/dev-player/` — React app (Vite, port 4210). Iframe grid, stats dashboard, hash timeline, latency sliders, localStorage presets.

**Game integration requirements:**
- Game servers must call `setupDevTools(server)` from `@lagless/dev-tools` before `server.start()`
- Game clients must call `useDevBridge(runner)` in their runner provider component
- Game clients must support URL params: `devBridge`, `autoMatch`, `serverUrl`, `scope`, `instanceId`
- Title screens must auto-match when `?autoMatch=true` and listen for `dev-bridge:start-match` parent message

### Per-Player Latency

`RelayRoom.perPlayerLatency` — `Map<number, LatencySimulator>` — per-slot latency simulation. Takes priority over global `latencySimulator` for both input fanout and pong responses.

API: `POST/GET/DELETE /api/dev/latency/player` (registered by `@lagless/dev-tools`).

## Key Design Constraints

- **64 component types max** (auto-detected: 1 Uint32 word for ≤32 components, 2 words for 33-64). Component IDs are bit indices (0, 1, 2, ...), not bitmask values.
- **Determinism is paramount.** Same inputs + same seed = identical simulation on every client. Any system logic touching PRNG, math, or input ordering must preserve this.
- **Server never runs simulation.** Relay model trusts clients. Cheat detection would require server-side replay (not implemented).
- **RPCHistory grows unbounded** — no pruning of old ticks. Acceptable for current game session lengths.
