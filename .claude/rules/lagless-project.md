# Project: Lagless

**Last Updated:** 2026-03-09

## Overview
Deterministic ECS framework for real-time multiplayer browser games. TypeScript, simulate/rollback netcode. Server relays inputs — clients are authoritative on determinism, server is authoritative on time and input acceptance.

## Technology Stack
- **Language:** TypeScript 5.9, strict, ES2022, ESM
- **Monorepo:** Nx 21.6, pnpm workspaces
- **Build:** tsc (standard libs), SWC (decorator libs)
- **Client:** Vite 7, React 19, Pixi.js 8
- **Game servers:** Bun (native WebSocket, runs TS directly)
- **Tests:** Vitest 3.2 workspace, `globals: true`
- **Physics:** Rapier 2D/3D (WASM, `@lagless/rapier2d-deterministic-compat`)
- **DI:** `@ECSSystem()` / `@ECSSignal()` + `reflect-metadata`

## Directory Structure
```
libs/
  core/               — ECS engine (Mem, ECSSimulation, InputProvider)
  misc/               — SnapshotHistory, SimulationClock, createLogger
  physics-shared/     — PhysicsSimulationBase, ColliderEntityMap
  physics2d/          — Rapier 2D integration
  physics3d/          — Rapier 3D + CharacterController3D
  relay-client/       — RelayInputProvider, RelayConnection
  relay-server/       — RelayRoom, RoomHooks
  relay-game-server/  — RelayGameServer
  desync-diagnostics/ — DiagnosticsCollector, PerformanceProfiler, useDesyncDiagnostics
  2d-map/
    2d-map-generator/ — Procedural map gen (MapGenerator, features, TerrainQuery)
    2d-map-renderer/  — Pixi.js renderers (MapTerrainRenderer, MinimapRenderer)
  animate/            — requestAnimationFrame helpers (animatePromise, easing)
  pixi-react/         — Pixi.js React integration + DebugPhysics2dRenderer
<game>/
  <game>-simulation/ — ECS schema (ecs.yaml), systems, signals
  <game>-game/       — React/Pixi.js client
  <game>-server/     — Bun relay server

Games: circle-sumo, sync-test, roblox-like, 2d-map-test
```

## Development Commands
| Task | Command |
|------|---------|
| Install | `pnpm install` |
| Build lib | `pnpm exec nx build @lagless/<name>` |
| Test lib | `npx vitest run --project=@lagless/<name>` |
| Test all | `npx vitest run` |
| Lint | `pnpm exec nx lint @lagless/<name>` |
| Typecheck | `pnpm exec nx typecheck @lagless/<name>` |
| CI all | `pnpm exec nx run-many -t lint test build typecheck` |
| ECS codegen | `pnpm exec nx g @lagless/codegen:ecs --configPath <path>/ecs.yaml` |

## Architecture Notes
- All ECS state in one `ArrayBuffer` (SoA layout). Snapshot = `slice(0)`, rollback = `Uint8Array.set()`.
- Systems run in declaration order — order matters for determinism.
- Source resolution via `@lagless/source` custom condition — bundlers resolve to `.ts` source.
- SWC required for decorator metadata (`@ECSSystem`, `@ECSSignal`).
