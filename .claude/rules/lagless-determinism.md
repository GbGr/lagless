# Lagless: Determinism Rules

**Last Updated:** 2026-03-07

## Core Principle

Same inputs + same seed = identical simulation on every client. Any violation causes multiplayer desync.

## Math

- **ALWAYS use `MathOps`** for sin/cos/atan2/sqrt/clamp — WASM-backed, deterministic across platforms
- **NEVER use `Math.sin/cos/atan2/sqrt`** in simulation code — results differ across JS engines
- `MathOps.init()` must be awaited before simulation starts (app entry point)
- `MathOps.clamp(NaN, min, max)` returns NaN — always `Number.isFinite()` check BEFORE clamping

## PRNG

- Use `PRNG` manager from ECS (xoshiro128** state lives in ArrayBuffer — restores on rollback automatically)
- **NEVER use `Math.random()`** in simulation code
- `SimpleSeededRandom` (in 2d-map-generator) is for pre-start map generation only — not for runtime simulation

## System Execution Order

- Systems run in declaration order in the `systems` array — this order is deterministic and matters
- Never add async operations inside systems — all system logic must be synchronous

## RPC Sanitization (required for all RPC-reading systems)

```typescript
const finite = (v: number): number => Number.isFinite(v) ? v : 0;

// In apply-input system:
let dirX = finite(rpc.data.directionX);
dirX = MathOps.clamp(dirX, -1, 1);
```

- Check `Number.isFinite()` on EVERY float field from RPC data before use
- Clamp all floats to semantic range
- Non-finite values corrupt all clients via NaN propagation through Rapier

## Rollback Safety

- All simulation state must live in the shared `ArrayBuffer` (SoA layout) — automatically restored on rollback
- Never store mutable simulation state outside ECS (no module-level variables, no class fields on systems)
- Filters are in the shared buffer — restored automatically
- PRNG is in the shared buffer — restored automatically

## Map Generation

- Map generation uses `SimpleSeededRandom(seed)` + `MathOps` trig only — fully deterministic
- Seed comes from server (`serverHello.seed`) — same on all clients
- Generate map ONCE before simulation starts, not during simulation
