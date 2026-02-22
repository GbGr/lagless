# AGENTS.md — Multi-Agent Development Guide

## Project Overview

This is a Lagless multiplayer game with three workspace packages:
- `<%= packageName %>-simulation` — deterministic ECS logic
- `<%= packageName %>-frontend` — React + Pixi.js client
- `<%= packageName %>-backend` — Bun relay server

## Task Decomposition

### Adding a New Game Feature

1. **Schema**: Add components/inputs/filters to `ecs.yaml`, run `pnpm codegen`
2. **Systems**: Implement game logic as ECS systems in the simulation package
3. **Rendering**: Add Pixi.js views in the frontend using `filterView` + `FilterViews`
4. **Server hooks**: Update `game-hooks.ts` if the feature needs server-side events

### Debugging Determinism Issues

- Open two browser tabs, both "Play Online"
- Press F3 to show debug panel — check hash verification table
- If hashes diverge: the system running between the two reported hashes has non-deterministic code
- Common causes: using `Math.random()`, `Date.now()`, `Math.sin()` instead of `MathOps`, uninitialized memory

### Testing Strategy

- **Simulation tests**: Write vitest tests that create a runner, inject RPCs, advance ticks, assert state
- **Determinism tests**: Run same inputs twice, compare final ArrayBuffer hashes
- **Visual tests**: Use local play to verify rendering

## Key Files

| File | Purpose |
|------|---------|
| `*-simulation/src/lib/schema/ecs.yaml` | ECS data model definition |
| `*-simulation/src/lib/systems/index.ts` | System execution order |
| `*-simulation/src/lib/arena.ts` | Game constants |
| `*-frontend/src/app/game-view/runner-provider.tsx` | Simulation initialization + input draining |
| `*-frontend/src/app/game-view/game-scene.tsx` | Main Pixi.js scene composition |
| `*-backend/src/game-hooks.ts` | Server room lifecycle hooks |
