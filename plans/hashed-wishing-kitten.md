# Plan: Create 2d-map-test game project

## Context

New game project `2d-map-test` — a minimal multiplayer test bench (based on sync-test) for future 2D map generation work. Black background, players only (no collectibles, no grid, no HUD score). Dev-player ready. Ports: server **3335**, client **4203**.

## Structure

```
2d-map-test/
├── 2d-map-test-simulation/   (ECS schema + systems, SWC build)
├── 2d-map-test-server/       (Bun server, manual — no Nx generator)
└── 2d-map-test-game/         (React + Pixi.js client, Vite)
```

---

## Step 0: Workspace setup

Add `'2d-map-test/*'` to `pnpm-workspace.yaml`.

---

## Step 1: Scaffold packages via Nx generators

### 1.1 Simulation (SWC for decorators)
```bash
pnpm exec nx g @nx/js:library \
  --directory 2d-map-test/2d-map-test-simulation \
  --importPath @lagless/2d-map-test-simulation \
  --bundler swc \
  --unitTestRunner vitest \
  --linter eslint \
  --minimal
```
Then adjust generated files to match project conventions (add `@lagless/source` export condition, `workspace:*` deps, `"type": "module"`, etc.)

### 1.2 Game client (React + Vite)
```bash
pnpm exec nx g @nx/react:application \
  --directory 2d-map-test/2d-map-test-game \
  --name 2d-map-test-game \
  --bundler vite \
  --linter eslint \
  --unitTestRunner vitest \
  --e2eTestRunner none \
  --style css \
  --minimal
```
Then adjust: add deps, vite config (port 4203, wasm, SWC decorators, `@lagless/source` condition), tsconfig references.

### 1.3 Server (manual — no Nx generator for Bun)
Create manually by copying `sync-test-server/` structure:
- `package.json`, `tsconfig.json`, `bunfig.toml`, `src/main.ts`, `src/map-test-hooks.ts`

---

## Step 2: Simulation content (`2d-map-test/2d-map-test-simulation/`)

### 2.1 ECS Schema (`src/lib/schema/ecs.yaml`)

Stripped-down sync-test — no Collectible, no CollectibleFilter, no GameState singleton.

```yaml
projectName: MapTest
components:
  Transform2d:
    positionX: float32
    positionY: float32
    prevPositionX: float32
    prevPositionY: float32
  Velocity2d:
    velocityX: float32
    velocityY: float32
  PlayerBody:
    playerSlot: uint8
    radius: float32

playerResources:
  PlayerResource:
    id: uint8[16]
    entity: uint32
    connected: uint8
    lastReportedHash: uint32
    lastReportedHashTick: uint32
    hashMismatchCount: uint16

inputs:
  PlayerJoined:
    slot: uint8
    playerId: uint8[16]
  PlayerLeft:
    slot: uint8
    reason: uint8
  MoveInput:
    directionX: float32
    directionY: float32
  ReportHash:
    hash: uint32
    atTick: uint32

filters:
  PlayerFilter:
    include:
      - Transform2d
      - PlayerBody
  MovingFilter:
    include:
      - Transform2d
      - Velocity2d
```

### 2.2 Run codegen
```bash
pnpm exec nx g @lagless/codegen:ecs --configPath 2d-map-test/2d-map-test-simulation/src/lib/schema/ecs.yaml
```

### 2.3 Arena config (`src/lib/arena.ts`)
Constants: width 800, height 600, playerRadius 20, moveSpeed 3.0, damping 0.85, hashReportInterval 120.

### 2.4 Systems (`src/lib/systems/`) — 7 systems, all adapted from sync-test

| # | System | Source (sync-test) | Changes |
|---|--------|--------------------|---------|
| 1 | SavePrevTransformSystem | `save-prev-transform.system.ts` | Only PlayerFilter (remove CollectibleFilter) |
| 2 | PlayerConnectionSystem | `player-connection.system.ts` | Import from map-test codegen, MapTestArena |
| 3 | PlayerLeaveSystem | `player-leave.system.ts` | Import swap only |
| 4 | ApplyMoveInputSystem | `apply-move-input.system.ts` | Import swap only |
| 5 | IntegrateSystem | `integrate.system.ts` | Import swap only |
| 6 | DampingSystem | `damping.system.ts` | Import swap only |
| 7 | BoundarySystem | `boundary.system.ts` | Import swap only |
| 8 | HashVerificationSystem | `hash-verification.system.ts` | Import swap only |

### 2.5 Signals — only DivergenceSignal (re-export from @lagless/core, no CollectSignal)

### 2.6 `src/index.ts` — export codegen, systems, signals, arena

---

## Step 3: Server (`2d-map-test/2d-map-test-server/`)

Based on `sync-test/sync-test-server/`:
- **`src/main.ts`** — port `3335`, loggerName `'MapTestServer'`, scope `'2d-map-test'`, import `MapTestInputRegistry` from `@lagless/2d-map-test-simulation`
- **`src/map-test-hooks.ts`** — same as `sync-test-hooks.ts`, import `PlayerJoined`/`PlayerLeft` from map-test-simulation, no score in result type
- **package.json** — name `@lagless/2d-map-test-server`, dep on `@lagless/2d-map-test-simulation`
- **tsconfig.json** — reference `../2d-map-test-simulation`
- **bunfig.toml** — same as sync-test-server

---

## Step 4: Client content (`2d-map-test/2d-map-test-game/`)

After Nx scaffolding, replace generated src/ with game files based on sync-test-game:

### 4.1 Key files and differences from sync-test-game:

| File | Based on | Changes |
|------|----------|---------|
| `index.html` | sync-test | Title "2D Map Test" |
| `src/main.tsx` | sync-test | Same |
| `src/styles.scss` | sync-test | Same |
| `src/app/app.tsx` | sync-test | Same |
| `src/app/router.tsx` | sync-test | Same |
| `src/app/screens/title.screen.tsx` | sync-test | Title "2D Map Test", remove replay button, import from map-test-sim |
| `src/app/screens/game.screen.tsx` | sync-test | Same |
| `src/app/hooks/use-start-match.ts` | sync-test | Import `MapTestInputRegistry` |
| `src/app/hooks/use-start-multiplayer-match.ts` | sync-test | Port 3335, scope `'2d-map-test'` |
| `src/app/game-view/game-view.tsx` | sync-test | Background `0x000000`, NO GridBackground, NO HUD |
| `src/app/game-view/runner-provider.tsx` | sync-test | No CollectSignal, import from map-test-sim |
| `src/app/game-view/map-test-view.tsx` | `sync-test-view.tsx` | Only PlayerFilter (no CollectibleFilter) |
| `src/app/game-view/player-view.tsx` | sync-test | Import from map-test-sim |
| `src/app/game-view/components/debug-panel.tsx` | sync-test | Import from map-test-sim |

### 4.2 Config adjustments:
- **vite.config.ts** — port `4203`, cacheDir for 2d-map-test
- **package.json** — dep on `@lagless/2d-map-test-simulation`, all @lagless libs, pixi.js, react, react-router-dom
- **tsconfig.json** / **tsconfig.app.json** — reference `../2d-map-test-simulation`

---

## Step 5: Install & verify

```bash
# Install deps
pnpm install

# Run codegen
pnpm exec nx g @lagless/codegen:ecs --configPath 2d-map-test/2d-map-test-simulation/src/lib/schema/ecs.yaml

# Build simulation
pnpm exec nx build @lagless/2d-map-test-simulation

# Start server (terminal 1)
pnpm exec nx serve @lagless/2d-map-test-server

# Start client (terminal 2)
pnpm exec nx serve @lagless/2d-map-test-game

# Verify:
#   - http://localhost:4203 → title screen
#   - "Play Local" → black screen, player circle, WASD movement
#   - "Play Online" → matchmaking
#   - F3 → debug panel
#   - Dev-player compatible (autoMatch, devBridge URL params)
```
