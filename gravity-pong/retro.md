# Gravity Pong — Retro

## 1. Missing `.swcrc`

SWC build failed with `failed to read config (.swcrc) file`. Simulation packages using decorators require `.swcrc` with `decoratorMetadata: true` and `legacyDecorator: true`. Forgot to copy it from sync-test — build broke on first attempt.

## 2. Missing `Velocity2d` on ball prefab

Ball prefab was created with only `Transform2d` + `Ball`. Without `Velocity2d` component, the ball entity never appeared in `MovingFilter`, so `IntegrateSystem` completely ignored it. Writing velocity values directly to typed arrays at the entity index worked at the memory level but didn't set the component bitmask — the filter never matched.

**Fix:** Added `.with(Velocity2d)` to `_ballPrefab` in `MapSetupSystem`.

## 3. `PRNG.getInt()` doesn't exist

Used `prng.getInt()` in map generator — this method doesn't exist on `PRNG`. The actual API is `getRandomInt(from, to)` and `getRandomIntInclusive(from, to)`.

## 4. `Signal.emit()` takes 2 arguments, not 1

Wrote `signal.emit({ data })` everywhere. The correct signature is `signal.emit(tick, { data })` — tick is the first argument. Every signal emit in all systems had to be fixed.

## 5. `rpc.header.playerSlot` → `rpc.meta.playerSlot`

RPC class has `meta` property, not `header`. The field with `playerSlot`, `tick`, `seq` is called `meta: InputMeta`.

## 6. `PlayerResource` type incompatibility with `IPlayerResourceConstructor`

Codegen generates `PlayerResource` with `id: Uint8Array` in `safe`, but `IPlayerResourceConstructor` expects `Record<string, number>`. This is a pre-existing codegen issue (sync-test has the same error). Workaround: `PlayerResource as any` when passing to `PlayerResources.get()`.

## 7. Both players connected in local mode = 5s wait

In local play, injected `PlayerJoined` for both P0 and P1. Since P1 is "connected" but can never shoot (no input provider), `ShootSystem` waited for the full `aimPhaseTicks` timeout (5 seconds) before launching the ball. Felt completely broken.

**Fix:** Only inject `PlayerJoined` for P0 in local mode. P1 stays disconnected → `connected === 0` → counts as "ready" immediately.

## 8. Gravity felt like a spring, not space

Initial parameters were way off:
- `gravityConstant: 50` gave ~2 px/tick² acceleration at 100px — balls snapped to planets instantly
- `maxShootPower: 8` crossed the arena in ~1.5 seconds — no time for gravity to curve the trajectory
- No velocity cap — balls accelerated to absurd speeds near planets
- `MIN_DIST_SQ: 100` (10px) — too small dead zone caused violent jerks at close range

**Fix:** `gravityConstant: 2`, `maxShootPower: 3.5`, added `maxBallSpeed: 6` clamp, `MIN_DIST_SQ: 400`, increased planet masses. Now balls curve gracefully like orbital mechanics.

## 9. `MathOps.init()` must be called before simulation

`MathOps` (WASM-backed deterministic math) requires async initialization. Without it, `MathOps.cos/sin/sqrt` crash. The user added a `LoaderProvider` wrapper in `app.tsx` that awaits `MathOps.init()` before rendering the router. This is documented in CLAUDE.md but easy to forget.

## 10. Nx workspace out of sync

After adding new packages, `nx typecheck` refused to run until `nx sync` was executed. Nx auto-detects tsconfig references from package dependencies and needed to update them.
