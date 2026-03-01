# Additional Architecture Improvements (beyond squishy-swimming-hejlsberg.md)

## Context

Existing plan covers 11 items (DI fix, dead code, snapshot reset, scratch objects, hardcoded values, normalizeAngle, deprecated aliases, animation adapter, `any` types, dispose consistency, RPC sanitization). This plan covers **additional** architectural issues discovered during deep code review.

---

## 11. Delete SimpleMovementSystem (dead debug code)

**Problem:** `SimpleMovementSystem` is a stripped-down copy of `CharacterMovementSystem` created to "isolate desync" (comment in file). It duplicates ~90% of CharacterMovementSystem's logic (speed, gravity, direction, rotation, locomotion angle) — only replacing KCC with hardcoded `y=0` ground check. It's not in the active systems array (only `CharacterMovementSystem` is active).

**Files:**
- `roblox-like/roblox-like-simulation/src/lib/systems/simple-movement.system.ts` — **delete**
- `roblox-like/roblox-like-simulation/src/lib/systems/index.ts` — remove import (line 8)

---

## 12. Make CharacterMovementSystem extend AbstractCharacterControllerSystem

**Problem:** `CharacterMovementSystem` (133 lines) is a full copy-paste of `AbstractCharacterControllerSystem.updateEntity()` (160 lines). Same acceleration, gravity, KCC, rotation, locomotion angle logic. The abstract system exists in `@lagless/character-controller-3d` precisely to avoid this duplication, but the game doesn't use it because:
1. The abstract system uses `.get()/.set()` interface (ICharacterStateComponent)
2. The game system uses `.unsafe` direct typed array access for performance

**Fix:** Make CharacterMovementSystem extend AbstractCharacterControllerSystem. Create a lightweight adapter in the constructor that wraps `unsafe` arrays into the ICharacterStateComponent interface (same pattern already used in AnimationSystem). The abstract system handles all movement logic; game only configures it.

**Files:**
- `roblox-like/roblox-like-simulation/src/lib/systems/character-movement.system.ts` — rewrite to extend abstract
- `libs/character-controller-3d/src/lib/character-controller-interfaces.ts` — verify adapter compatibility

**Result:** ~130 lines of duplicated movement logic replaced with ~20 lines of adapter setup.

---

## 13. PhysicsRunner2d: add `extraRegistrations` parameter

**Problem:** PhysicsRunner3d accepts `extraRegistrations?: Array<[unknown, unknown]>` and passes them to `super()` **before** systems are resolved. PhysicsRunner2d has no such parameter — any game using 2D physics that needs custom DI registrations (like a 2D character controller) has no way to register them before system resolution.

**File:** `libs/physics2d/src/lib/physics-runner-2d.ts`

**Fix:** Add `extraRegistrations` parameter (same as 3d). Collect all physics regs + extras into a single array and pass to `super()`:
```typescript
protected constructor(
  Config, InputProviderInstance, Systems, Signals, Deps,
  rapier, physicsConfig?, collisionLayers?,
  extraRegistrations?: Array<[unknown, unknown]>,  // ADD
) {
  // ... create worldManager, simulation ...
  const extraRegs: Array<[unknown, unknown]> = [
    [PhysicsWorldManager2d, worldManager],
    [PhysicsConfig2d, config],
    [CollisionEvents2d, worldManager.collisionEvents],
  ];
  if (collisionLayers) extraRegs.push([CollisionLayers, collisionLayers]);
  if (extraRegistrations) extraRegs.push(...extraRegistrations);
  super(Config, InputProviderInstance, Systems, Signals, Deps, simulation, extraRegs);
  // ... assign fields ...
}
```

This also unifies the DI registration pattern with 3d (addresses item #1 in existing plan from a different angle — the root cause is the same).

---

## 14. CharacterControllerManager: remove legacy dual-constructor

**Problem:** Two constructor overloads with type-unsafe runtime dispatch:
```typescript
constructor(config: CharacterControllerConfig);
constructor(worldManager: PhysicsWorldManager3d, config: CharacterControllerConfig);
```
The "Legacy" overload (worldManager, config) exists but the codebase only uses the deferred init pattern (config only + `.init(worldManager)` later). The dual constructor is confusing, uses `as` casts, and the "legacy" path is never called.

**File:** `libs/character-controller-3d/src/lib/character-controller-manager.ts`

**Fix:** Single constructor, always deferred:
```typescript
constructor(private readonly _config: CharacterControllerConfig) {}

public init(worldManager: PhysicsWorldManager3d): void {
  this._worldManager = worldManager;
}
```

---

## 15. Export UNMAPPED_ENTITY constant from collider-entity-map

**Problem:** `SENTINEL = -1` is a private constant in `collider-entity-map.ts`, but `collision-events-base.ts` hardcodes `-1` checks:
```typescript
if (e1 === -1 || e2 === -1) return;  // implicit contract with SENTINEL
```
If SENTINEL ever changes, CollisionEventsBase breaks silently.

**Files:**
- `libs/physics-shared/src/lib/collider-entity-map.ts` — export `UNMAPPED_ENTITY = -1`
- `libs/physics-shared/src/lib/collision-events-base.ts` — import and use `UNMAPPED_ENTITY`
- `libs/physics-shared/src/index.ts` — add to barrel export

---

## 16. Normalize sprint boolean in ApplyCharacterInputSystem

**Problem:** Line 46: `cs.isSprinting[entity] = rpc.data.sprint` assigns the raw uint8 value (0-255). CLAUDE.md convention says uint8 booleans should be treated as `!= 0`, never use raw numeric value in arithmetic. Should normalize to 0/1.

**File:** `roblox-like/roblox-like-simulation/src/lib/systems/apply-character-input.system.ts`

**Fix:** `cs.isSprinting[entity] = rpc.data.sprint ? 1 : 0;`

---

## 17. Re-enable AnimationSystem

**Problem:** `AnimationSystem` is commented out in `index.ts:31` with note "TEMPORARILY DISABLED — isolating desync". Desync is now fixed.

**File:** `roblox-like/roblox-like-simulation/src/lib/systems/index.ts`

**Fix:** Uncomment `AnimationSystem` in the `RobloxLikeSystems` array (line 31).

---

## Summary of additional changes

| # | What | Risk | Impact |
|---|------|------|--------|
| 11 | Delete SimpleMovementSystem | LOW | Remove 123 lines of dead debug code |
| 12 | CharacterMovementSystem extends abstract | MED | Eliminate ~130 lines of copy-paste, single source of truth for movement |
| 13 | PhysicsRunner2d extraRegistrations | LOW | API parity with 3d, future-proof for 2D games |
| 14 | CharacterControllerManager single constructor | LOW | Remove confusing dual-constructor pattern |
| 15 | Export UNMAPPED_ENTITY | LOW | Make implicit SENTINEL contract explicit |
| 16 | Normalize sprint boolean | LOW | Convention compliance |
| 17 | Re-enable AnimationSystem | LOW | Desync fixed, uncomment in systems array |

---

## Test Coverage

### New test: Input sanitization (`roblox-like/.../src/lib/__tests__/input-sanitization.spec.ts`)

Covers items 5 (hardcoded jump values), 10b (RPC sanitization), 16 (sprint normalization) from both plans.

Tests:
- NaN/Infinity direction values → replaced with 0
- Direction values > 1 or < -1 → clamped
- NaN cameraYaw → replaced with 0
- Sprint uint8 value (e.g. 255) → normalized to 0/1
- Jump with hardcoded jumpForce → uses CHARACTER_CONFIG.jumpForce
- Jump with maxJumps → uses CHARACTER_CONFIG.maxJumps
- No jump when not grounded and jumpCount >= maxJumps

Approach: Create a minimal test setup with DI container, inject mock InputProvider with crafted RPCs, run ApplyCharacterInputSystem.update(), verify CharacterState values.

### New test: UNMAPPED_ENTITY constant (`libs/physics-shared/.../collider-entity-map.spec.ts`)

Update existing test to import and verify `UNMAPPED_ENTITY`:
- `expect(map.get(unknownHandle)).toBe(UNMAPPED_ENTITY)`

### Existing tests that must still pass after refactoring:

1. **kcc-determinism.spec.ts** — end-to-end character controller test (8 cases including rollback + resimulation). This validates that CharacterMovementSystem refactor (item 12) doesn't break movement determinism.
2. **collider-entity-map.spec.ts** — validates UNMAPPED_ENTITY export (item 15)
3. **collision-layers.spec.ts** — unaffected but should still pass
4. **physics-world-manager-3d/2d.spec.ts** — validates dispose consistency (item 10a)
5. **All physics-shared, physics3d, physics2d tests** — must pass

---

## Verification

1. `npx vitest run` — all existing + new tests pass
2. `pnpm exec nx test @lagless/roblox-like-simulation` — kcc-determinism + input-sanitization tests pass
3. `pnpm exec nx run-many -t build typecheck --projects=@lagless/physics-shared,@lagless/physics2d,@lagless/physics3d,@lagless/character-controller-3d`
4. Manual: run roblox-like (server + client) — verify character movement, jumping, animation transitions
