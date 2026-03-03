# Fix: ColliderEntityMap не восстанавливается при rollback

## Context

`ColliderEntityMap` (маппинг Rapier collider handle → ECS entity ID) живёт как instance-переменная в `PhysicsWorldManager3d/2d`. Она **не входит** ни в ECS ArrayBuffer snapshot, ни в Rapier binary snapshot. При rollback оба снэпшота восстанавливаются, но ColliderEntityMap остаётся в состоянии из «будущей» предиктивной временной линии.

**Сценарий бага:**
1. Tick 8: Пуля создана → `registerCollider(H, B)` → map имеет `H→B`
2. Tick 10: Snapshot сохранён (пуля жива)
3. Tick 12: Пуля уничтожена → `unregisterCollider(H)` → map теряет `H→B`
4. Приходит удалённый input → rollback к tick 10
5. ECS ArrayBuffer восстановлен → entity B жива, PhysicsRefs содержит handle H
6. Rapier World восстановлен → collider H существует
7. **ColliderEntityMap НЕ восстановлен** → маппинг `H→B` отсутствует
8. Ресимуляция: collision event с handle H → `entityMap.get(H)` → `UNMAPPED_ENTITY` → событие молча отбрасывается → desync

Та же проблема при late-join state transfer — клиент получает ECS+Rapier state, но ColliderEntityMap пуст для всех entity из переданного состояния.

## Approach: Rebuild ColliderEntityMap from ECS state

После любого восстановления (rollback / state transfer), перестраиваем ColliderEntityMap из восстановленного ECS состояния — итерируем PhysicsRefsFilter и читаем `colliderHandle` для каждого entity.

**Почему не snapshot подход:**
- Snapshot ColliderEntityMap потребовал бы дополнительной памяти (~1-4KB на каждый snapshot в истории)
- Изменил бы формат данных `takeSnapshot()/restoreSnapshot()`, что затронет state transfer
- Rebuild из ECS O(N) — быстрый (N = кол-во physics entities), нулевой оверхед по памяти, не меняет форматы

## Changes

### 1. `libs/physics-shared/src/lib/physics-simulation-base.ts`

Добавить callback для rebuild и вызывать его во всех точках восстановления:

```typescript
private _colliderEntityMapRebuildFn: (() => void) | null = null;

public setColliderEntityMapRebuild(fn: () => void): void {
  this._colliderEntityMapRebuildFn = fn;
}
```

Вызвать `this._colliderEntityMapRebuildFn?.()` в трёх местах:
- **`rollback()`** — после `restoreSnapshot()` и `rollback()` на snapshot history (строка ~47)
- **`applyStateFromTransfer()`** — после `restoreSnapshot()`, перед `notifyStateTransferHandlers()` (строка ~115)
- **`applyExternalPhysicsState()`** — после `restoreSnapshot()` (строка ~65)

### 2. `libs/physics3d/src/lib/physics-runner-3d.ts`

После `super()` (строка 43), добавить автодетект PhysicsRefs и настройку rebuild callback:

```typescript
// Auto-detect PhysicsRefs component by schema shape
const physicsRefsCtor = Deps.components.find(
  (c) => (c as any).schema?.colliderHandle === Float64Array
    && (c as any).schema?.bodyHandle === Float64Array
);

if (physicsRefsCtor) {
  // Find filter that includes PhysicsRefs
  const physicsRefsFilterCtor = Deps.filters.find(
    (f) => (f as any).include?.includes(physicsRefsCtor)
  );

  if (physicsRefsFilterCtor) {
    const refsInstance = simulation.mem.componentsManager.get(physicsRefsCtor);
    const filterInstance = simulation.mem.filtersManager.get(physicsRefsFilterCtor);
    const colliderHandles = (refsInstance as any).unsafe.colliderHandle as Float64Array;
    const entityMap = worldManager.colliderEntityMap;

    simulation.setColliderEntityMapRebuild(() => {
      entityMap.clear();
      for (const entity of filterInstance) {
        entityMap.set(colliderHandles[entity], entity);
      }
    });
  }
}
```

**Как это работает:**
- `Deps.components` — массив конструкторов из codegen (ECSDeps)
- Находим PhysicsRefs по наличию `static schema` с полями `colliderHandle: Float64Array` и `bodyHandle: Float64Array` — уникальная комбинация, не сломается при минификации
- Находим PhysicsRefsFilter по `static include` содержащему PhysicsRefs конструктор
- `simulation.mem.componentsManager.get(ctor)` возвращает instance с `.unsafe.colliderHandle` (Float64Array view в ECS ArrayBuffer)
- `filterInstance` extends `AbstractFilter` — iterable через `[Symbol.iterator]()`, `length` — public getter из `_length[0]` (в ArrayBuffer)
- После rollback: ArrayBuffer восстановлен → `colliderHandles[entity]` и данные фильтра корректны → rebuild даёт правильный маппинг

### 3. `libs/physics2d/src/lib/physics-runner-2d.ts`

Идентичные изменения, но с PhysicsWorldManager2d/PhysicsSimulation2d типами.

### 4. Tests

Добавить тест в `libs/physics3d/src/lib/__tests__/` (или `libs/physics-shared/`):

**Сценарий теста:**
1. Создать PhysicsWorldManager + ColliderEntityMap
2. Создать несколько colliders, зарегистрировать в map
3. Удалить один collider из map (имитация destroy в prediction)
4. Вызвать restoreSnapshot → ECS ArrayBuffer восстановлен (filter и PhysicsRefs вернулись)
5. Вызвать rebuild callback
6. Assert: все collider handles снова маппятся на правильные entity

## Execution order verification

```
checkAndRollback(currentTick):
  1. rollback(tick):
     a. super.rollback()           — ECS ArrayBuffer восстановлен
     b. restoreSnapshot(rapier)    — Rapier World восстановлен + updateSceneQueries()
     c. _colliderEntityMapRebuildFn()  — ColliderEntityMap перестроен  ← NEW
  2. for handler of rollbackHandlers  — KCC recreation и другие handlers
simulationTicks(current, target):
  3. Ресимуляция с корректным ColliderEntityMap
```

ColliderEntityMap перестраивается ДО rollback handlers (важно — KCC recreation может зависеть от корректного маппинга) и ДО ресимуляции.

## Files to modify

| File | Change |
|------|--------|
| `libs/physics-shared/src/lib/physics-simulation-base.ts` | Add `setColliderEntityMapRebuild()`, call in 3 restore points |
| `libs/physics3d/src/lib/physics-runner-3d.ts` | Auto-detect PhysicsRefs, wire rebuild callback |
| `libs/physics2d/src/lib/physics-runner-2d.ts` | Same as physics3d |
| `libs/physics3d/src/lib/__tests__/collider-entity-map-rebuild.spec.ts` | New test |

## What does NOT change

- No codegen changes
- No game code changes (fully automatic)
- No snapshot format changes
- No new interfaces or abstract methods
- Existing `IPhysicsWorldManagerBase` interface unchanged

## Verification

1. `npx vitest run --project=@lagless/physics3d` — новый тест проходит
2. `npx vitest run` — все существующие тесты проходят
3. `pnpm exec nx run-many -t lint build typecheck` — no regressions
