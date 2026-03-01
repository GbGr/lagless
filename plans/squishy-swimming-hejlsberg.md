 # Refactoring Plan: Physics2D/3D + CharacterController + AnimationController

## Context

Full code review of physics-shared, physics2d, physics3d, character-controller-3d, animation-controller и roblox-like выявил: баг-риск в DI-регистрации physics2d, мёртвый код (RobloxLikeSimulation), избыточные аллокации в hot path, дублирование SnapshotHistory reset, захардкоженные значения вместо конфига, boilerplate в анимациях, deprecated алиасы. Цель — исправить всё и сделать конфетку.

---

## 1. Fix PhysicsRunner2d DI registration (BUG-RISK)

**Проблема:** `PhysicsRunner3d` передаёт physics-регистрации через `extraRegs` в `super()` — они доступны при DI-разрешении систем. `PhysicsRunner2d` вызывает `super()` БЕЗ регистраций, потом регистрирует вручную ПОСЛЕ (lines 38-44). Если 2D-система инжектит `PhysicsWorldManager2d` через DI конструктор — она не найдёт его.

**Файл:** `libs/physics2d/src/lib/physics-runner-2d.ts`

**Исправление:** Переписать по паттерну 3D — собрать `extraRegs` массив и передать в `super()`. Добавить параметр `extraRegistrations`.

---

## 2. Delete dead code: RobloxLikeSimulation

**Проблема:** `RobloxLikeSimulation` (roblox-like-simulation/roblox-like-simulation.ts) определён но НИГДЕ не импортируется. Сгенерированный `RobloxLikeRunner` наследует `PhysicsRunner3d` → создаёт `PhysicsSimulation3d`. Override `rollback()` в `RobloxLikeSimulation` никогда не вызывается.

**Файл:** `roblox-like/roblox-like-simulation/src/lib/roblox-like-simulation.ts`

**Исправление:** Удалить файл. Rollback KCC уже обрабатывается хендлером в `runner-provider.tsx:140-142`.

---

## 3. Remove redundant SnapshotHistory reset

**Проблема:** `PhysicsSimulationBase.applyStateFromTransfer()` создаёт `new SnapshotHistory()` 3 раза:
- Line 106: 1-й reset
- Line 109 → `this.applyExternalState()` → line 54: 2-й reset (перезаписывает 1-й)
- Line 115: 3-й reset

Line 106 полностью бесполезна — `applyExternalState()` на line 54 тут же пересоздаёт историю.

**Файл:** `libs/physics-shared/src/lib/physics-simulation-base.ts`

**Исправление:** Удалить lines 105-106 (комментарий + `new SnapshotHistory()`).

---

## 4. Hot-path allocations — scratch objects

**Проблема:** Object literals (`{ x, y, z }`, `{ x, y, z, w }`) создаются per-entity per-tick:
- `PhysicsStepSync3d.syncKinematicToRapier` — 2 аллокации на kinematic body
- `PhysicsStepSync2d.syncKinematicToRapier` — 1 аллокация на kinematic body
- `AbstractCharacterControllerSystem.updateEntity` — 3 аллокации на character (computeColliderMovement + setNextKinematicTranslation + setNextKinematicRotation)
- `CharacterMovementSystem` (roblox-like) — 3 аллокации на character

**Файлы:**
- `libs/physics3d/src/lib/physics-step-sync-3d.ts`
- `libs/physics2d/src/lib/physics-step-sync-2d.ts`
- `libs/character-controller-3d/src/lib/character-controller-system.ts`
- `roblox-like/roblox-like-simulation/src/lib/systems/character-movement.system.ts`

**Исправление:** Module-level scratch objects, мутировать вместо создания новых:
```typescript
const _vec3 = { x: 0, y: 0, z: 0 };
const _quat = { x: 0, y: 0, z: 0, w: 1 };

// Вместо body.setNextKinematicTranslation({ x: posX, y: posY, z: posZ }):
_vec3.x = posX; _vec3.y = posY; _vec3.z = posZ;
body.setNextKinematicTranslation(_vec3);
```

---

## 5. Fix hardcoded values in ApplyCharacterInputSystem

**Проблема:** `_tryJump()` line 60: `cs.verticalVelocity[entity] = 8` — hardcode вместо `CHARACTER_CONFIG.jumpForce`. Line 58: `jumpCount >= 1` — hardcode вместо `CHARACTER_CONFIG.maxJumps`.

**Файл:** `roblox-like/roblox-like-simulation/src/lib/systems/apply-character-input.system.ts`

**Исправление:** Импортировать `CHARACTER_CONFIG` и использовать `cfg.jumpForce` и `cfg.maxJumps`. Инжектить `CharacterControllerConfig` через DI или использовать импорт конфига.

---

## 6. Extract `normalizeAngle` utility

**Проблема:** Angle normalization через `while` loops дублируется в:
- `AbstractCharacterControllerSystem` (lines 136-137)
- `CharacterMovementSystem` (lines 125-126)

While-loops хрупкие и не-идиоматичные.

**Файлы:**
- `libs/math/src/index.ts` — добавить экспорт
- Один из: `libs/math/src/lib/math-ops.ts` или новый `libs/math/src/lib/normalize-angle.ts`
- `libs/character-controller-3d/src/lib/character-controller-system.ts`
- `roblox-like/roblox-like-simulation/src/lib/systems/character-movement.system.ts`

**Исправление:**
```typescript
export function normalizeAngle(angle: number): number {
  angle %= MathOps.PI_2;
  if (angle > MathOps.PI) angle -= MathOps.PI_2;
  else if (angle < -MathOps.PI) angle += MathOps.PI_2;
  return angle;
}
```

---

## 7. Remove deprecated type aliases

**Проблема:** Deprecated aliases из pre-refactor API:
- `physics-step-sync-3d.ts:8` — `IPhysicsBody3dComponent`
- `physics-step-sync-2d.ts:8` — `IPhysicsBody2dComponent`

**Файлы:**
- `libs/physics3d/src/lib/physics-step-sync-3d.ts`
- `libs/physics2d/src/lib/physics-step-sync-2d.ts`

**Исправление:** Удалить deprecated export строки. Проверить что нигде не импортируются.

---

## 8. Clean up animation adapter boilerplate

**Проблема:** `AnimationSystem` создаёт 8 dummy get/set пар (lines 10-19) которые тут же перезаписываются в конструкторе (lines 32-39). Лишний код + лишние аллокации.

**Файл:** `roblox-like/roblox-like-simulation/src/lib/systems/animation.system.ts`

**Исправление:** Объявить `_animAdapter` как `IAnimationStateComponent` и инициализировать сразу в конструкторе:
```typescript
private readonly _animAdapter: IAnimationStateComponent;

constructor(...) {
  this._dt = this._ECSConfig.frameLength / 1000;
  const a = this._AnimationState.unsafe;
  this._animAdapter = {
    animationId: { get: (e) => a.animationId[e], set: (e, v) => { a.animationId[e] = v; } },
    animationTime: { get: (e) => a.animationTime[e], set: (e, v) => { a.animationTime[e] = v; } },
    // ...
  };
}
```

---

## 9. Fix `any` type in collision-events-base

**Проблема:** `maxForceDirection(): any` в типе callback и в `IRapierEventQueue` interface.

**Файл:** `libs/physics-shared/src/lib/collision-events-base.ts`

**Исправление:** Заменить `any` на `unknown` (мы не используем это значение в callback).

---

## 10. Minor consistency fixes

### 10a. `dispose()` optional chaining inconsistency
`PhysicsWorldManager2d.dispose()` использует `this._collisionEvents?.dispose()` (optional chaining), а 3d — `this._collisionEvents.dispose()`. `_collisionEvents` всегда инициализируется в конструкторе.

**Fix:** Убрать `?` в 2d (align с 3d).

**File:** `libs/physics2d/src/lib/physics-world-manager-2d.ts:214`

### 10b. Add RPC input sanitization to ApplyCharacterInputSystem

Согласно новому разделу "Input Validation" в CLAUDE.md — все RPC-данные от игроков должны быть проверены на `Number.isFinite()` и clamp к допустимому диапазону.

**File:** `roblox-like/roblox-like-simulation/src/lib/systems/apply-character-input.system.ts`

**Fix:** Добавить sanitization для `directionX`, `directionZ`, `cameraYaw`:
```typescript
const finite = (v: number): number => Number.isFinite(v) ? v : 0;

let dirX = finite(rpc.data.directionX);
let dirZ = finite(rpc.data.directionZ);
dirX = MathOps.clamp(dirX, -1, 1);
dirZ = MathOps.clamp(dirZ, -1, 1);
const cameraYaw = finite(rpc.data.cameraYaw);
```

---

## Summary of changes

| # | What | Risk | Files |
|---|------|------|-------|
| 1 | PhysicsRunner2d DI fix | HIGH | physics-runner-2d.ts |
| 2 | Delete RobloxLikeSimulation dead code | LOW | roblox-like-simulation.ts |
| 3 | Remove redundant SnapshotHistory reset | LOW | physics-simulation-base.ts |
| 4 | Scratch objects for hot paths | MED | physics-step-sync-3d/2d.ts, character-controller-system.ts, character-movement.system.ts |
| 5 | Fix hardcoded jump values | LOW | apply-character-input.system.ts |
| 6 | Extract normalizeAngle | LOW | math/, character-controller-system.ts, character-movement.system.ts |
| 7 | Remove deprecated aliases | LOW | physics-step-sync-3d/2d.ts |
| 8 | Clean animation adapter | LOW | animation.system.ts |
| 9 | Fix `any` → `unknown` | LOW | collision-events-base.ts |
| 10a | dispose() consistency | LOW | physics-world-manager-2d.ts |
| 10b | RPC input sanitization | MED | apply-character-input.system.ts |

---

## Verification

1. **Tests:** `npx vitest run` — все существующие тесты должны пройти
2. **Build:** `pnpm exec nx run-many -t build typecheck --projects=@lagless/physics-shared,@lagless/physics2d,@lagless/physics3d,@lagless/character-controller-3d,@lagless/animation-controller`
3. **Lint:** `pnpm exec nx run-many -t lint --projects=@lagless/physics-shared,@lagless/physics2d,@lagless/physics3d`
4. **Manual:** Запустить roblox-like (server + client) — проверить character movement, jumping, animation transitions
