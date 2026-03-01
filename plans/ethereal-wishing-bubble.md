# Dev Player — Implementation Plan

## Context

Для тестирования мультиплеера нужна утилита, которая открывает N инстансов игры в iframe-сетке, автоматически матчмейкит их, показывает статистику, сравнивает хэши и позволяет управлять задержками per-player.

Основные требования:
- Dev-специфичный код **никогда** не попадает в production сборку
- Per-player latency — отдельный плагин для сервера
- Чистый, лаконичный код без костылей
- Стабильная, надёжная утилита (не MVP)

---

## Phase 1: Dev Bridge Protocol & Library

### Новые файлы: `libs/react/src/lib/dev-bridge/`

> Код в `@lagless/react` — tree-shakeable. Если не импортировать `useDevBridge`, ничего не попадает в бандл. Хук — no-op без `?devBridge=true` в URL.

**`protocol.ts`** — Типы postMessage сообщений (префикс `dev-bridge:`):

```typescript
// Instance → Parent
type DevBridgeChildMessage =
  | { type: 'dev-bridge:ready'; instanceId: string }
  | { type: 'dev-bridge:stats'; instanceId: string; tick: number; hash: number;
      rtt: number; jitter: number; inputDelay: number; rollbacks: number;
      fps: number; playerSlot: number; connected: boolean; clockReady: boolean }
  | { type: 'dev-bridge:match-state'; instanceId: string;
      state: 'idle' | 'queuing' | 'connecting' | 'playing' | 'error'; error?: string }

// Parent → Instance
type DevBridgeParentMessage =
  | { type: 'dev-bridge:start-match' }
  | { type: 'dev-bridge:reset' }
```

**`dev-bridge.ts`** — DevBridge class:
- Статические методы: `isActive()` (проверяет `?devBridge=true`), `fromUrlParams()` (парсит `instanceId`, `serverUrl`, `scope`, `autoMatch`)
- Instance методы: `sendReady()`, `sendStats(...)`, `sendMatchState(...)` — `window.parent.postMessage()`
- `onParentMessage(handler)` — слушает `window.addEventListener('message')` с фильтрацией по `dev-bridge:` префиксу

**`use-dev-bridge.ts`** — React hook:
- Использует тот же паттерн извлечения статистики, что и `useNetStats` (`libs/react/src/lib/debug-panel/use-net-stats.ts`):
  - `runner.InputProviderInstance` → проверка `instanceof RelayInputProvider`
  - `relayProvider.clockSync.rttEwmaMs` / `.jitterEwmaMs`
  - `relayProvider.rollbackCount` / `.currentInputDelay`
  - `runner.Simulation.tick` / `runner.Simulation.mem.getHash()`
  - `runner.Simulation.clock.phaseNudger`
- Выделить общую утилиту `extractRunnerStats(runner): BridgeStats` — reuse между `useDevBridge` и `useNetStats`
- Статистика отправляется каждые 6 тиков через `runner.Simulation.addTickHandler()` (возвращает cleanup для useEffect)
- No-op если `DevBridge.isActive()` === false

**`index.ts`** — реэкспорт всего.

### Изменяемые файлы:
- `libs/react/src/index.ts` — добавить `export * from './lib/dev-bridge/index.js'`

---

## Phase 2: Per-Player Latency (серверный плагин)

### relay-server: минимальные изменения

**`libs/relay-server/src/lib/relay-room.ts`** — добавить `perPlayerLatency` по аналогии с существующим `latencySimulator` (строки 140-141):

```typescript
// Новое свойство (рядом с latencySimulator, строка 141):
private _perPlayerLatency: Map<number, LatencySimulator> | null = null;
public get perPlayerLatency() { return this._perPlayerLatency; }
public set perPlayerLatency(map: Map<number, LatencySimulator> | null) { this._perPlayerLatency = map; }
```

Модификация `handleTickInputBatch` (строки 439-444). Сейчас:
```typescript
const broadcast = () => this._inputHandler.broadcastInputBatch(accepted, this._connections);
if (this._latencySimulator) {
  this._latencySimulator.apply(broadcast);
} else {
  broadcast();
}
```

Станет:
```typescript
if (this._perPlayerLatency) {
  // Per-player path: serialize once, send individually with per-slot delay
  const fanout = packTickInputFanout({ serverTick: this._clock.tick, inputs: accepted });
  for (const conn of this._connections.values()) {
    if (!conn.isReady) continue;
    const sim = this._perPlayerLatency.get(conn.slot);
    if (sim) sim.apply(() => conn.send(fanout));
    else conn.send(fanout);
  }
} else {
  const broadcast = () => this._inputHandler.broadcastInputBatch(accepted, this._connections);
  if (this._latencySimulator) {
    this._latencySimulator.apply(broadcast);
  } else {
    broadcast();
  }
}
```

> `packTickInputFanout` уже импортируется в `input-handler.ts` (`@lagless/net-wire`). Нужно добавить импорт в `relay-room.ts`. `conn.send()` принимает `Uint8Array` (строка 49 player-connection.ts) — `packTickInputFanout` возвращает `Uint8Array`.

Модификация `handlePing` (строки 460-465) — аналогично, использовать per-slot simulator:
```typescript
const send = () => conn.send(pong);
const sim = this._perPlayerLatency?.get(conn.slot) ?? this._latencySimulator;
if (sim) sim.apply(send);
else send();
```

### relay-game-server: `addCustomRoute()`

**`libs/relay-game-server/src/lib/relay-game-server.ts`** — добавить возможность регистрации маршрутов до `start()`:

```typescript
private readonly _additionalRoutes: RouteHandler[] = [];

public addCustomRoute(handler: RouteHandler): void {
  this._additionalRoutes.push(handler);
}
```

В `start()` (строка 182) заменить:
```typescript
const customRoutes = [...(this._config.customRoutes ?? []), ...this._additionalRoutes];
```

Это generic API — не dev-specific. Позволяет любому плагину регистрировать маршруты.

### Новый пакет: `libs/dev-tools/`

Отдельный пакет `@lagless/dev-tools` — **никогда** не импортируется в production.

```
libs/dev-tools/
  package.json        ← @lagless/dev-tools, peerDeps: @lagless/relay-server, @lagless/relay-game-server
  tsconfig.json
  tsconfig.lib.json
  src/
    index.ts
    lib/
      setup-dev-tools.ts
      per-player-latency.ts
```

**`per-player-latency.ts`** — Route handler для per-player latency API:
- `POST /api/dev/latency/player` — body: `{ slot, delayMs, jitterMs, packetLossPercent }`. Создаёт/обновляет LatencySimulator для конкретного слота в единственной активной комнате (берём первую через `roomRegistry.forEachRoom()`).
- `GET /api/dev/latency/player` — возвращает все per-player конфиги.
- `DELETE /api/dev/latency/player` — сбрасывает все per-player latency (устанавливает `room.perPlayerLatency = null`).

**`setup-dev-tools.ts`:**
```typescript
export function setupDevTools(server: RelayGameServer): void {
  const registry = server.roomRegistry;

  // Hook room creation — init perPlayerLatency map на новых комнатах
  const origCreate = registry.createRoom.bind(registry);
  registry.createRoom = async (...args) => {
    const room = await origCreate(...args);
    room.perPlayerLatency = new Map();
    return room;
  };

  // Register per-player latency API route
  server.addCustomRoute(createPerPlayerLatencyRoute(registry));
}
```

Паттерн хука `createRoom` уже используется в `latency-setup.ts` (строка 13-18).

### Использование в game server:
```typescript
import { setupDevTools } from '@lagless/dev-tools';

const server = new RelayGameServer({ ... });
setupDevTools(server);
server.start();
```

### Изменяемые файлы:
- `libs/relay-server/src/lib/relay-room.ts` — `perPlayerLatency` prop + 2 модифицированных send-пути (~15 строк)
- `libs/relay-game-server/src/lib/relay-game-server.ts` — `addCustomRoute()` (~5 строк)
- NEW: `libs/dev-tools/` — весь пакет

---

## Phase 3: Game Client Integration

~15 строк на игру. Zero changes to simulation code.

### Per game (sync-test, circle-sumo, roblox-like):

**1. `use-start-multiplayer-match.ts`** — URL param overrides:
```typescript
const params = new URLSearchParams(window.location.search);
const SERVER_URL = params.get('serverUrl') || import.meta.env.VITE_RELAY_URL || 'ws://localhost:3334';
const SCOPE = params.get('scope') || 'sync-test';
```

**2. `title.screen.tsx`** — Auto-match + координация через dev-bridge:
```typescript
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('autoMatch') === 'true' && multiplayer.state === 'idle') {
    multiplayer.startMatch();
  }
}, []);
```

Также слушать `dev-bridge:start-match` от parent через `DevBridge.onParentMessage()` для координированного запуска.

**3. `runner-provider.tsx`** — Enable bridge:
```typescript
import { useDevBridge } from '@lagless/react';
useDevBridge(runner);
```

### Game servers — добавить `setupDevTools`:
```typescript
// sync-test-server/src/main.ts, circle-sumo-server/src/main.ts, roblox-like-server/src/main.ts
import { setupDevTools } from '@lagless/dev-tools';

const server = new RelayGameServer({ ... });
setupDevTools(server);
server.start();
```

### Изменяемые файлы (per game):
- `*/hooks/use-start-multiplayer-match.ts` — 4 строки
- `*/screens/title.screen.tsx` — 5 строк
- `*/game-view/runner-provider.tsx` — 2 строки
- `*/server/src/main.ts` — 2 строки

---

## Phase 4: Dev Player App (`tools/dev-player/`)

### Структура пакета:
```
tools/dev-player/
  package.json          ← @lagless/dev-player
  vite.config.ts        ← port 4210, @vitejs/plugin-react-swc
  index.html
  tsconfig.json
  src/
    main.tsx
    app/
      app.tsx            ← Main layout
      app.css            ← Простые стили (не CSS Modules)
      types.ts           ← GamePreset, InstanceState, DevPlayerState
      store.ts           ← useReducer-based state
      components/
        top-bar.tsx      ← Game selector, instance count, Start/Stop/Restart
        iframe-grid.tsx  ← CSS grid + iframe instances + status overlay
        sidebar.tsx      ← Network controls (global + per-player latency sliders)
        dashboard.tsx    ← Stats table + hash timeline (canvas)
      hooks/
        use-bridge-messages.ts  ← window.addEventListener('message') → dispatch
        use-latency-control.ts  ← fetch() to server /api/latency + /api/dev/latency/player
        use-local-storage.ts    ← Persist/load config presets
```

### Ключевые решения:

**Гарантия одной комнаты:** Генерировать уникальный scope на каждую dev-сессию: `sync-test-dev-${nanoid(6)}`. Передавать через URL param `?scope=...`. Все инстансы используют один scope → матчмейкинг соберёт их в одну комнату.

**Координация старта:** Dev Player ждёт все `dev-bridge:ready` от iframe-ов, затем шлёт `dev-bridge:start-match` всем. `autoMatch` URL param остаётся как fallback для ручного тестирования iframe в браузере.

**Hash timeline (canvas):** Ring buffer на 300 тиков. Данные хранятся в `useRef`, рендеринг через `requestAnimationFrame` + canvas. Группировка по тику — ждём hash от ВСЕХ инстансов для тика, timeout 3с для incomplete. Зелёная точка = совпадение, красная = расхождение, серая = неполные данные.

**Stats table:** Данные обновляются через postMessage (~10 msg/sec per instance). React state обновляется с throttle (каждые 200ms) чтобы не перерисовывать на каждое сообщение.

**Network controls:**
- Global: слайдеры → `POST http://{httpUrl}/api/latency`
- Per-player: слайдеры → `POST http://{httpUrl}/api/dev/latency/player`
- HTTP URL вычисляется из WS URL: `ws://` → `http://`

**Instance overlay:**
- Бейдж: `#0 P0 T:1234`
- Рамка: серая=idle, синяя=connecting, зелёная=playing, красная=error
- Staleness: нет stats >3с → "STALE"
- Кнопка reload: `iframe.src = iframe.src`

**Presets (localStorage):**
- Save/load текущей конфигурации (game, count, latency) с именем
- Auto-save последнего использования

### Game presets (hardcoded):
```typescript
const PRESETS: GamePreset[] = [
  { label: 'Sync Test',   gameUrl: 'http://localhost:4201', serverUrl: 'ws://localhost:3334', scope: 'sync-test' },
  { label: 'Circle Sumo', gameUrl: 'http://localhost:4200', serverUrl: 'ws://localhost:3333', scope: 'circle-sumo' },
  { label: 'Roblox-Like', gameUrl: 'http://localhost:4202', serverUrl: 'ws://localhost:3335', scope: 'roblox-like' },
];
```

---

## Phase 5: CLAUDE.md Update

Добавить в CLAUDE.md:
- Команды запуска dev-player: `cd tools/dev-player && pnpm dev`
- Правило: **все мультиплеерные игры должны реализовывать DivergenceSignal и hash verification** (через `AbstractHashVerificationSystem` + `createHashReporter`)
- Правило: game servers должны вызывать `setupDevTools(server)` из `@lagless/dev-tools`
- Правило: game clients должны добавлять `useDevBridge(runner)` и поддерживать URL params (`devBridge`, `autoMatch`, `serverUrl`, `scope`, `instanceId`)

---

## Implementation Order

1. `libs/react/src/lib/dev-bridge/protocol.ts`
2. `libs/react/src/lib/dev-bridge/dev-bridge.ts`
3. `libs/react/src/lib/dev-bridge/use-dev-bridge.ts`
4. `libs/react/src/lib/dev-bridge/index.ts` + update `libs/react/src/index.ts`
5. `libs/relay-server/src/lib/relay-room.ts` — `perPlayerLatency` + modify sends
6. `libs/relay-game-server/src/lib/relay-game-server.ts` — `addCustomRoute()`
7. `libs/dev-tools/` package scaffold + per-player-latency route + setupDevTools
8. sync-test game client (3 files) + server (1 file) — test integration
9. `tools/dev-player/` — full app
10. circle-sumo + roblox-like game integration
11. localStorage presets
12. CLAUDE.md update

---

## Verification

1. `pnpm exec nx serve @lagless/sync-test-server` (terminal 1)
2. `pnpm exec nx serve @lagless/sync-test-game` (terminal 2)
3. `cd tools/dev-player && pnpm dev` (terminal 3)
4. Open `http://localhost:4210`
5. Select "Sync Test", 2 instances → Start
6. Verify: оба auto-match через уникальный scope, играют вместе, stats в dashboard, hash timeline зелёная
7. Set global latency 100ms → verify
8. Set per-player latency (P0=0ms, P1=200ms) → verify asymmetric
9. Test с 3-4 инстансами
10. Test reload instance, restart all
11. Test preset save/load
12. Repeat с circle-sumo и roblox-like

---

## Critical Files Reference

| File | Role |
|------|------|
| `libs/react/src/lib/debug-panel/use-net-stats.ts` | Паттерн извлечения stats из runner — reuse |
| `libs/relay-server/src/lib/relay-room.ts:140-141,439-444,460-465` | Latency sim usage |
| `libs/relay-server/src/lib/latency-simulator.ts` | LatencySimulator class — reuse |
| `libs/relay-game-server/src/lib/latency-setup.ts` | Паттерн хука `createRoom` — reuse |
| `libs/relay-game-server/src/lib/relay-game-server.ts:176-185,196-198` | Custom routes + roomRegistry getter |
| `libs/relay-game-server/src/lib/types.ts:21-29` | `RouteHandler`, `RouteHelpers` types |
| `libs/relay-server/src/lib/input-handler.ts:148-162` | `broadcastInputBatch` — bypass при per-player |
| `libs/core/src/lib/ecs-simulation.ts:48` | `addTickHandler()` — lifecycle hook |
| `libs/relay-client/src/lib/relay-input-provider.ts:63,67,71` | Public getters для stats |
