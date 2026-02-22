# CLAUDE.md

## What This Is

<%= projectName %> is a multiplayer browser game built with **Lagless**, a deterministic ECS framework. TypeScript, simulate/rollback netcode, all simulation state in a single ArrayBuffer.

## Commands

```bash
# Install
pnpm install

# Start game server (Bun)
pnpm dev:backend

# Start frontend dev server (Vite)
pnpm dev:frontend

# Regenerate ECS code after schema changes
pnpm codegen
```

## Architecture

### Three Packages

- **<%= packageName %>-simulation** — Shared deterministic game logic (ECS systems, components, signals)
- **<%= packageName %>-frontend** — React + Pixi.js game client
- **<%= packageName %>-backend** — Bun game server (relay model, no simulation)

### ECS Memory Model

All state lives in one contiguous ArrayBuffer with Structure-of-Arrays layout. Snapshot = `ArrayBuffer.slice(0)`. Rollback = `Uint8Array.set()` from snapshot.

### Simulation Loop

```
1. clock.update(dt)
2. targetTick = floor(accTime / frameLength)
3. checkAndRollback() — if remote inputs arrived
4. simulationTicks: for each tick → run systems in order → process signals
5. inputProvider.update() — drain inputs, send to server
6. interpolationFactor = leftover / frameLength
```

### Input System

RPCs are deterministically ordered by `(playerSlot, ordinal, seq)`. Local inputs are scheduled `currentTick + inputDelay` ticks ahead. Server relays inputs to all clients.

### Key Conventions

- **Determinism is paramount**: Same inputs + same seed = identical state on every client
- All deterministic math must use `MathOps` (WASM-backed), never `Math.*` trig functions
- `MathOps.init()` must be called before simulation starts
- When spawning entities: always set `prevPositionX/Y = positionX/Y` to avoid interpolation jumps
- `@abraham/reflection` must be imported before any decorated class
- Generated code in `code-gen/` directories — never edit manually, regenerate from YAML
- Systems array order = execution order (deterministic)

### Schema & Codegen

ECS schema is defined in `<%= packageName %>-simulation/src/lib/schema/ecs.yaml`. Run `pnpm codegen` after changes.

Supported field types: `uint8`, `uint16`, `uint32`, `int8`, `int16`, `int32`, `float32`, `float64`, `uint8[N]` (fixed arrays).

### Adding Components/Systems

1. Add to `ecs.yaml`, run `pnpm codegen`
2. Create system file in `systems/` with `@ECSSystem()` decorator
3. Add to systems array in `systems/index.ts` (order matters)
4. Systems get dependencies via constructor injection (DI container)

### Multiplayer

- Server never runs simulation — relay model
- `RelayInputProvider` handles prediction + rollback
- `RelayConnection` manages WebSocket to relay server
- State transfer for late-join via `StateRequest`/`StateResponse`
- `RoomHooks` in backend define game lifecycle (join, leave, reconnect)
