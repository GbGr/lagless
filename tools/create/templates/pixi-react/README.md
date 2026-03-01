# <%= projectName %>

A multiplayer game built with [Lagless](https://github.com/GbGr/lagless) — a deterministic ECS framework for real-time multiplayer browser games.

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/) 9+
- [Bun](https://bun.sh/) (for the game server)

## Getting Started

```bash
pnpm install
pnpm codegen    # Generate ECS code from schema
pnpm dev        # Start backend + frontend + dev-player
```

Open http://localhost:<%= frontendPort %> in your browser. Click "Play Local" for single-player or "Play Online" for multiplayer.

Press **F3** to toggle the debug panel (shows network stats, tick info, hash verification).

You can also run services individually:

```bash
pnpm dev:backend    # Game server (Bun, watches for changes)
pnpm dev:frontend   # Frontend (Vite HMR)
pnpm dev:player     # Dev-player (multiplayer testing tool, port 4210)
```

## Dev Player

The **dev-player** (http://localhost:4210) is a multiplayer testing tool that opens multiple game instances in a grid. It auto-matchmakes them, displays per-instance network stats, and provides a hash timeline for detecting simulation divergence between clients.

Use it to test multiplayer without opening multiple browser tabs manually.

## Project Structure

```
<%= packageName %>/
├── <%= packageName %>-simulation/    # Shared deterministic game logic (ECS)
│   └── src/lib/
│       ├── schema/ecs.yaml          # ECS schema definition
│       ├── schema/code-gen/         # Generated code (don't edit manually)
│       ├── systems/                 # ECS systems (game logic)
│       ├── signals/                 # Rollback-aware events
│       └── arena.ts                 # Game constants
├── <%= packageName %>-frontend/      # React + Pixi.js game client
│   └── src/app/
│       ├── screens/                 # Title screen, game screen
│       ├── hooks/                   # Match start hooks
│       └── game-view/              # Pixi.js rendering
└── <%= packageName %>-backend/       # Bun game server
    └── src/
        ├── main.ts                  # Server entry point
        └── game-hooks.ts           # Room lifecycle hooks
```

## ECS Schema

The game's data model is defined in `<%= packageName %>-simulation/src/lib/schema/ecs.yaml`. After modifying the schema, regenerate code:

```bash
pnpm codegen
```

### Schema Reference

**Components** — Per-entity data stored in Structure-of-Arrays layout:
```yaml
components:
  MyComponent:
    fieldName: float32    # Supported: uint8, uint16, uint32, int8, int16, int32, float32, float64
```

**Singletons** — Global game state (single instance):
```yaml
singletons:
  GameState:
    gamePhase: uint8
```

**Player Resources** — Per-player data (indexed by player slot):
```yaml
playerResources:
  PlayerResource:
    score: uint32
    id: uint8[16]        # Fixed-size arrays supported
```

**Inputs** — RPCs sent by clients and server:
```yaml
inputs:
  MoveInput:
    directionX: float32
    directionY: float32
```

**Filters** — Cached entity queries:
```yaml
filters:
  PlayerFilter:
    include: [Transform2d, PlayerBody]
    # exclude: [Dead]    # Optional
```

## Adding a New System

1. Create `<%= packageName %>-simulation/src/lib/systems/my-system.system.ts`:

```typescript
import { ECSSystem, IECSSystem } from '@lagless/core';
import { Transform2d, PlayerFilter } from '../schema/code-gen/index.js';

@ECSSystem()
export class MySystem implements IECSSystem {
  constructor(
    private readonly _PlayerFilter: PlayerFilter,
    private readonly _Transform2d: Transform2d,
  ) {}

  public update(tick: number): void {
    for (const entity of this._PlayerFilter) {
      // Your logic here
    }
  }
}
```

2. Add it to the systems array in `systems/index.ts` (order matters — systems run sequentially).

## Key Conventions

- **Determinism**: All simulation math must use `MathOps` for trig functions (WASM-backed). Never use `Math.sin/cos/atan2/sqrt` in systems.
- **Interpolation**: Always set `prevPositionX/Y` equal to `positionX/Y` when spawning entities to avoid one-frame jumps.
- **Vector math**: Use `Vector2.addToRef()`/`.addInPlace()` in hot paths to avoid allocations.
- **Decorators**: `@abraham/reflection` must be imported before any decorated class (done in `main.tsx`).

## Architecture

- **Server never runs simulation** — it relays inputs between clients
- **Clients are authoritative on determinism** — same inputs + same seed = identical state
- **Rollback netcode** — local inputs are predicted, remote inputs trigger rollback when they arrive
- **State transfer** — late-joining players receive a state snapshot from existing clients

## @lagless Packages

| Package | Description |
|---------|-------------|
| `@lagless/core` | ECS engine, simulation loop, input system, signals |
| `@lagless/binary` | Memory tracking, typed array utilities |
| `@lagless/math` | Deterministic math (WASM), Vector2 |
| `@lagless/misc` | Logging, UUID, VisualSmoother2d |
| `@lagless/net-wire` | Binary network protocol messages |
| `@lagless/relay-client` | Client-side relay connection, RelayInputProvider |
| `@lagless/relay-server` | Server-side relay room, RoomHooks |
| `@lagless/relay-game-server` | Full game server with matchmaking |
| `@lagless/matchmaking` | Matchmaking queue service |
| `@lagless/react` | React debug panel, auth utilities |
| `@lagless/pixi-react` | FilterViews, VFX container, virtual joystick |
| `@lagless/codegen` | ECS code generation from YAML |
