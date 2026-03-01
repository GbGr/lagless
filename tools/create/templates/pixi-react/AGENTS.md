# AGENTS.md — Multi-Agent Guide for <%= projectName %>

## Project Overview

This is a Lagless multiplayer game with three packages:
- **<%= packageName %>-simulation** — Deterministic ECS game logic (shared between all clients)
- **<%= packageName %>-frontend** — React + Pixi.js rendering client
- **<%= packageName %>-backend** — Bun relay server (no simulation)

## Task Decomposition

### Adding a New Game Feature
1. **Schema & Codegen** — Edit `ecs.yaml`, run `pnpm codegen`
2. **System** — Write `@ECSSystem()` in simulation, add to systems array
3. **View** — Add Pixi.js component in frontend `game-view/`
4. **Input** — Wire drainInputs in `runner-provider.tsx` if feature needs player input
5. **Test** — Verify determinism: open two tabs, play, check F3 hash table matches

### Debugging Determinism Issues
1. **Reproduce** — Open dev-player (`pnpm dev:player`), run 2+ instances
2. **Identify tick** — F3 debug panel shows hash divergence tick
3. **Binary search** — Add hash checks between systems to narrow down which system diverges
4. **Check rules** — Review `docs/03-determinism.md` for common violations
5. **Common causes** — `Math.sin` instead of `MathOps.sin`, unsorted iteration, missing `prevPosition` init

### Adding Multiplayer Features
1. **Server events** — Add to `RoomHooks` in `game-hooks.ts`
2. **Server RPCs** — Use `ctx.emitServerEvent()` for server-originated inputs
3. **State transfer** — Handled automatically, but test with late-join scenario
4. **Reconnect** — Test disconnect/reconnect via F3 debug panel buttons

## File Ownership by Task Type

| Task | Primary Files |
|------|--------------|
| New component/input | `ecs.yaml` → `pnpm codegen` |
| Game logic | `*-simulation/src/lib/systems/*.system.ts` |
| Entity rendering | `*-frontend/src/app/game-view/*.tsx` |
| UI/screens | `*-frontend/src/app/screens/*.tsx` |
| Player input | `*-frontend/src/app/game-view/runner-provider.tsx` |
| Server hooks | `*-backend/src/game-hooks.ts` |
| Server config | `*-backend/src/main.ts` |
| Signals | `*-simulation/src/lib/signals/index.ts` |

## Verification Checklist

### Before Submitting Any Change
- [ ] `pnpm codegen` runs without errors (if schema changed)
- [ ] Game starts: `pnpm dev` → no console errors
- [ ] Single-player works: title screen → game → entities move correctly
- [ ] Multiplayer works: two browser tabs, both see each other
- [ ] Determinism holds: F3 panel → hash table → no red (divergence) entries

### For Physics Changes (<%= simulationType !== 'raw' ? 'APPLIES TO THIS PROJECT' : 'if applicable' %>)
- [ ] Bodies created with correct BodyType
- [ ] `updateSceneQueries()` called after snapshot restore
- [ ] ColliderEntityMap rebuilt after state transfer
- [ ] Collision layers configured correctly

## Key Constraints
- **Never edit `code-gen/` files** — always edit `ecs.yaml` and run `pnpm codegen`
- **Never use `Math.sin/cos/atan2/sqrt`** — use `MathOps.*` equivalents
- **Never use `Math.random()`** — use `PRNG.getFloat()` or `PRNG.getRandomInt()`
- **Always sanitize RPC inputs** — `Number.isFinite()` before `MathOps.clamp()`
- **Always set prevPosition = position** when spawning entities with Transform2d
- **Systems array order = execution order** — it's deterministic and matters

## Documentation Reference
- `CLAUDE.md` — Primary instruction file with code patterns
- `docs/` — Detailed documentation on all framework topics
- `docs/sources/lagless/` — Full framework source code for deep reference
