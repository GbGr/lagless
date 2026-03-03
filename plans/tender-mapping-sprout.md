# Актуализация create tool после auto-wire ColliderEntityMap rebuild

## Context

`PhysicsRunner2d` и `PhysicsRunner3d` теперь автоматически wiring'ат `ColliderEntityMap` rebuild через `_wireColliderEntityMapRebuild()` в конструкторе. Rebuild вызывается на rollback, `applyExternalPhysicsState()` и `applyStateFromTransfer()` — ручной `addStateTransferHandler` в game-коде больше не нужен.

Также убран `updateSceneQueries()` (Rapier 0.18+ делает это автоматически) и пакеты переименованы из `-compat` в `-deterministic-compat@^0.19.0` — эти изменения уже в staging.

## Changes

### 1. `tools/create/templates/pixi-react/__packageName__-frontend/src/app/game-view/runner-provider.tsx`

**Удалить ручной `addStateTransferHandler` блок** (lines 145-158) — теперь auto-wired в `PhysicsRunner2d/3d`.

**Удалить неиспользуемые импорты:**
- `PhysicsRefs` — использовался только в удаляемом блоке
- `PhysicsRefsFilter` — аналогично
- `PlayerFilter` — не используется в runner-provider (используется в `game-scene.tsx`, где импортируется отдельно)

### 2. `tools/create/templates/pixi-react/docs/08-physics2d.md`

Обновить секцию **Rollback** (line 197):
- Добавить пункт 3: `ColliderEntityMap` is rebuilt automatically

### 3. `tools/create/templates/pixi-react/docs/08-physics3d.md`

Обновить секцию **Rollback** (line 279):
- Добавить пункт 3 (перед KCC): `ColliderEntityMap` is rebuilt automatically

### 4. `tools/create/templates/pixi-react/AGENTS.md`

Line 56: изменить `- [ ] ColliderEntityMap rebuilt after state transfer` → `- [ ] ColliderEntityMap rebuild is automatic (verify no manual rebuild code)`

### 5. `roblox-like/roblox-like-game/src/app/game-view/runner-provider.tsx`

**Удалить дублирующий ColliderEntityMap rebuild** из `addStateTransferHandler` (lines 146-153), оставив только KCC recreation:
```typescript
sim.addStateTransferHandler(() => {
  const charFilter = _runner.DIContainer.resolve(CharacterFilter);
  kccManager.recreateFromEntities(charFilter);
});
```

**Удалить неиспользуемые импорты:** `PhysicsRefs`, `PhysicsRefsFilter` (больше не нужны после удаления ручного rebuild).

## Verification

1. `pnpm exec nx build @lagless/physics-shared` — physics-shared builds
2. `pnpm exec nx test @lagless/physics-shared` — tests pass (collider-entity-map-rebuild.spec.ts)
3. `pnpm exec nx build @lagless/physics2d && pnpm exec nx test @lagless/physics2d` — physics2d clean
4. `pnpm exec nx build @lagless/physics3d && pnpm exec nx test @lagless/physics3d` — physics3d clean
5. `pnpm exec nx typecheck @lagless/roblox-like-game` — roblox-like compiles without removed imports
6. `pnpm exec nx build tools-create` — create tool builds
