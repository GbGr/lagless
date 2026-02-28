# Fix all CI failures (`pnpm exec nx run-many -t lint test build typecheck`)

## Context

CI падает на 8 задачах. 23 задачи не запускаются из-за каскадных зависимостей. Корневая причина большинства — SWC-пакеты с `skipTypeCheck: true` не генерируют `.d.ts`, а tsc-пакеты зависят от них.

## 8 провалов — 3 корневые причины

### A. SWC не генерирует `.d.ts` (3 провала + 23 каскадных)
- `relay-client:build` — tsc не может зарезолвить `AbstractInputProvider` из `@lagless/core`
- `pixi-react:build` — tsc не может зарезолвить типы из `@lagless/core`
- `core:typecheck` — TS6305 каскадирует в ~70 ошибок в spec-файлах

### B. dev-player tsconfig конфликт (1 провал)
- `dev-player:typecheck` — `noEmit: true` несовместим с `tsc --build --emitDeclarationOnly`

### C. Lint ошибки (4 провала)
- `relay-client:lint` — пустая функция в моке
- `roblox-like-simulation:lint` — пустые конструкторы в codegen tag-компонентах
- `dev-player:lint` — `iframe.src = iframe.src` self-assignment
- `roblox-like-game:lint` — dynamic + static import `@lagless/core` нарушает module boundaries

---

## Фаза 1: Убрать `skipTypeCheck: true` из всех SWC-пакетов

Удалить `"skipTypeCheck": true` из `nx.targets.build.options` в 13 файлах:

| Файл | Строка |
|------|--------|
| `libs/core/package.json` | 35 |
| `libs/net-wire/package.json` | 35 |
| `libs/character-controller-3d/package.json` | 22 |
| `libs/animation-controller/package.json` | 22 |
| `libs/physics-shared/package.json` | 35 |
| `libs/physics3d/package.json` | 35 |
| `libs/physics2d/package.json` | 35 |
| `libs/animate/package.json` | 35 |
| `tools/codegen/package.json` | 46 |
| `tools/create/package.json` | 42 |
| `circle-sumo/circle-sumo-simulation/package.json` | 30 |
| `sync-test/sync-test-simulation/package.json` | 30 |
| `roblox-like/roblox-like-simulation/package.json` | 30 |

**Эффект:** `@nx/js:swc` будет: 1) SWC → `.js`, 2) `tsc --emitDeclarationOnly` → `.d.ts`

## Фаза 2: Исправить implicit-any в core spec-файлах

После фазы 1 в core:typecheck останутся 2 ошибки:

**`libs/core/src/lib/ecs-simulation.spec.ts:130`** — добавить тип параметру:
```ts
// было:  (tick) =>
// стало: (tick: number) =>
```

**`libs/core/src/lib/input/rpc-history.spec.ts:185`** — добавить тип параметру:
```ts
// было:  .every(r =>
// стало: .every((r: RPC) =>
```

## Фаза 3: dev-player tsconfig

**`tools/dev-player/tsconfig.json`** — заменить `"noEmit": true` на:
```json
"composite": true,
"emitDeclarationOnly": true,
"outDir": "out-tsc"
```

## Фаза 4: Lint-ошибки

### 4.1 relay-client:lint
**`libs/relay-client/src/lib/relay-input-provider.spec.ts:282`**:
```ts
sendStateResponse: () => { /* noop */ },
```

### 4.2 roblox-like-simulation:lint (codegen template)
**`tools/codegen/files/component/__name__.ts.template:3`** — добавить перед tag-классом:
```
/* eslint-disable @typescript-eslint/no-empty-function, @typescript-eslint/no-unused-vars */
```
Затем перегенерировать:
```bash
pnpm exec nx g @lagless/codegen:ecs --configPath roblox-like/roblox-like-simulation/src/lib/schema/ecs.yaml
```

### 4.3 dev-player:lint
**`tools/dev-player/src/app/components/iframe-grid.tsx:26`**:
```ts
// было:  if (iframe) iframe.src = iframe.src;
// стало: if (iframe) { const src = iframe.src; iframe.src = src; }
```

### 4.4 roblox-like-game:lint
**`roblox-like/roblox-like-game/src/app/game-view/runner-provider.tsx`**:
- Строка 19: добавить `ReplayInputProvider` в статический import
- Строка 166: заменить `(await import('@lagless/core')).ReplayInputProvider` на `ReplayInputProvider`

---

## Верификация

```bash
pnpm exec nx run-many -t lint test build typecheck --skip-nx-cache
```

Дополнительно убедиться что `.d.ts` генерируются:
```bash
ls libs/core/dist/index.d.ts
```
