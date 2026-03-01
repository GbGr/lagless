 # Dev Player — Multiplayer Debug & Testing Tool

## Context

При разработке мультиплеерных игр на Lagless нужно открывать несколько инстансов игры в одном окне, чтобы тестировать взаимодействие, находить ошибки детерминизма и дебажить сетевые краевые случаи. Сейчас приходится открывать несколько вкладок вручную.

**Dev Player** — standalone Vite-приложение, которое открывает N инстансов любой Lagless-игры в iframe-сетке, автоматически матчмейкит их в одну комнату, собирает статистику, сравнивает хэши симуляции, и позволяет управлять сетевыми условиями per-player.

---

## Architecture Overview

```
tools/dev-player/                    ← Standalone React + Vite app (port 4210)
  ├── iframe grid (2-4 game instances)
  ├── debug dashboard (hash comparison, stats table, hash timeline)
  ├── network controls (global + per-player latency/jitter/loss)
  └── presets saved to localStorage

libs/dev-tools/                      ← Separate lib for dev-only server features
  ├── per-player latency route handler
  └── setupDevTools(server) helper

libs/react/src/lib/dev-bridge/      ← Bridge code (in existing @lagless/react)
  ├── protocol.ts                    ← postMessage message types
  ├── dev-bridge.ts                  ← DevBridge class (iframe ↔ parent comms)
  └── use-dev-bridge.ts              ← React hook for game clients

relay-server (minimal change)        ← Add perPlayerLatency Map on RelayRoom
relay-game-server (minimal change)   ← Add addCustomRoute() method

Game clients (sync-test, circle-sumo, roblox-like)
  ├── URL param detection (?devBridge=true&autoMatch=true)
  ├── Auto-matchmaking trigger
  └── useDevBridge(runner) hook call
```

**Why iframes:** True isolation (own JS runtime, WebSocket, Canvas/WebGL), works with ANY game, HMR continues to work, each instance behaves exactly like a real browser tab.

**Communication:** `postMessage()` API — works cross-origin (games on ports 4200-4202, dev player on 4210).

---

## Phase 1: Dev Bridge Protocol & Library

### New: `libs/react/src/lib/dev-bridge/`

**`protocol.ts`** — Typed postMessage protocol (all prefixed `dev-bridge:` for filtering):

```typescript
// Instance → Parent
type DevBridgeChildMessage =
  | { type: 'dev-bridge:ready'; instanceId: string }
  | { type: 'dev-bridge:stats'; instanceId: string; tick: number; hash: number;
      rtt: number; jitter: number; inputDelay: number; rollbacks: number;
      fps: number; playerSlot: number; connected: boolean; clockReady: boolean }
  | { type: 'dev-bridge:match-state'; instanceId: string;
      state: 'idle' | 'queuing' | 'connecting' | 'playing' | 'error'; error?: string }
  | { type: 'dev-bridge:divergence'; instanceId: string;
      tick: number; slotA: number; slotB: number; hashA: number; hashB: number }

// Parent → Instance
type DevBridgeParentMessage =
  | { type: 'dev-bridge:start-match' }
  | { type: 'dev-bridge:reset' }
```

**`dev-bridge.ts`** — DevBridge class:
- `DevBridge.isActive()` — checks `?devBridge=true` URL param
- `DevBridge.fromUrlParams()` — parses `instanceId`, `serverUrl`, `scope`, `autoMatch`
- `sendReady()`, `sendStats(...)`, `sendMatchState(...)`, `sendDivergence(...)` — post to parent
- `onParentMessage(handler)` — listen for commands from parent

**`use-dev-bridge.ts`** — React hook:
- Stats sent every 6 ticks (~100ms at 60fps) via `runner.Simulation.addTickHandler()`
- Extracts stats using same pattern as `use-net-stats.ts`:
  - `runner.Simulation.tick` / `runner.Simulation.mem.getHash()`
  - `relayProvider.clockSync.rttEwmaMs` / `.jitterEwmaMs`
  - `relayProvider.rollbackCount` / `.currentInputDelay`
  - `runner.Simulation.clock.phaseNudger`
- Subscribes to DivergenceSignal if hashVerification config provided
- Detects `?devBridge=true` automatically, no-op if not in iframe

### Files:
- NEW: `libs/react/src/lib/dev-bridge/protocol.ts`
- NEW: `libs/react/src/lib/dev-bridge/dev-bridge.ts`
- NEW: `libs/react/src/lib/dev-bridge/use-dev-bridge.ts`
- NEW: `libs/react/src/lib/dev-bridge/index.ts`
- MODIFY: `libs/react/src/index.ts` — add `export * from './lib/dev-bridge/index.js'`

---

## Phase 2: Per-Player Latency Support

### relay-server (minimal change)

In `libs/relay-server/src/lib/relay-room.ts`:

1. Add property:
```typescript
private _perPlayerLatency: Map<number, LatencySimulator> | null = null;
public get perPlayerLatency() { return this._perPlayerLatency; }
public set perPlayerLatency(map: Map<number, LatencySimulator> | null) { this._perPlayerLatency = map; }
```

2. Add helper:
```typescript
private _getSimulatorForSlot(slot: number): LatencySimulator | null {
  return this._perPlayerLatency?.get(slot) ?? this._latencySimulator;
}
```

3. Modify `handleTickInputBatch` (line 439-444) — per-connection broadcast:
```typescript
if (this._perPlayerLatency) {
  const fanout = packTickInputFanout({ serverTick: this._clock.tick, inputs: accepted });
  for (const conn of this._connections.values()) {
    if (!conn.isReady) continue;
    const sim = this._perPlayerLatency.get(conn.slot);
    if (sim) { sim.apply(() => conn.send(fanout)); }
    else { conn.send(fanout); }
  }
} else if (this._latencySimulator) {
  this._latencySimulator.apply(broadcast);
} else {
  broadcast();
}
```

4. Modify `handlePing` (line 460-465) — use `_getSimulatorForSlot`:
```typescript
const sim = this._getSimulatorForSlot(conn.slot);
if (sim) { sim.apply(send); } else { send(); }
```

### relay-game-server (minimal change)

In `libs/relay-game-server/src/lib/relay-game-server.ts`:
- Add `addCustomRoute(handler: RouteHandler)` public method
- Store additional routes in `_additionalRoutes: RouteHandler[]`
- In `start()`, iterate both `_config.customRoutes` and `_additionalRoutes`

### New: `libs/dev-tools/`

Separate package — only imported by game servers during development, never in production.

```
libs/dev-tools/
  package.json               ← @lagless/dev-tools, deps: @lagless/relay-server, @lagless/relay-game-server
  src/
    index.ts
    lib/
      setup-dev-tools.ts     ← setupDevTools(server: RelayGameServer)
      per-player-latency.ts  ← route handler + room hook
  tsconfig.json
```

**`setup-dev-tools.ts`:**
```typescript
export function setupDevTools(server: RelayGameServer): void {
  // 1. Hook room creation to initialize per-player latency maps
  hookRoomCreation(server.roomRegistry);
  // 2. Register per-player latency API route
  server.addCustomRoute(perPlayerLatencyRoute(server.roomRegistry));
}
```

**`per-player-latency.ts`:**
- Route handler for `GET/POST /api/dev/latency/player`
- POST body: `{ slot: number, delayMs: number, jitterMs: number, packetLossPercent: number }`
- GET returns: all per-player configs as `{ [slot]: { delayMs, jitterMs, packetLossPercent } }`
- `DELETE /api/dev/latency/player` — reset all per-player latency
- Creates/updates LatencySimulator instances in room's `perPlayerLatency` map

**Game server usage:**
```typescript
import { setupDevTools } from '@lagless/dev-tools';

const server = new RelayGameServer({ ... });
setupDevTools(server);
server.start();
```

### Files:
- MODIFY: `libs/relay-server/src/lib/relay-room.ts` — add `perPlayerLatency` + modify 2 send paths
- MODIFY: `libs/relay-game-server/src/lib/relay-game-server.ts` — add `addCustomRoute()` method
- NEW: `libs/dev-tools/package.json`
- NEW: `libs/dev-tools/src/index.ts`
- NEW: `libs/dev-tools/src/lib/setup-dev-tools.ts`
- NEW: `libs/dev-tools/src/lib/per-player-latency.ts`
- NEW: `libs/dev-tools/tsconfig.json`

---

## Phase 3: Game Client Integration

~15 lines per game. Zero changes to simulation code.

### Per game (`sync-test`, `circle-sumo`, `roblox-like`):

**1. `use-start-multiplayer-match.ts`** — URL param overrides:
```typescript
const params = new URLSearchParams(window.location.search);
const SERVER_URL = params.get('serverUrl') || import.meta.env.VITE_RELAY_URL || 'ws://localhost:3334';
const SCOPE = params.get('scope') || 'sync-test';
// Use SCOPE in ws.send({ type: 'join', scope: SCOPE })
```

**2. `title.screen.tsx`** — Auto-match on `?autoMatch=true`:
```typescript
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('autoMatch') === 'true' && multiplayer.state === 'idle') {
    multiplayer.startMatch();
  }
}, []);
```

**3. `runner-provider.tsx` / `game-view.tsx`** — Enable bridge:
```typescript
import { useDevBridge } from '@lagless/react';
// Inside component with runner:
useDevBridge(runner);
```

### Files (per game):
- MODIFY: `*/hooks/use-start-multiplayer-match.ts` — 4 lines
- MODIFY: `*/screens/title.screen.tsx` — 5 lines
- MODIFY: `*/game-view/runner-provider.tsx` — 2 lines

### Game server integration:
- MODIFY: `sync-test/sync-test-server/src/main.ts` — add `setupDevTools(server)` (2 lines)
- MODIFY: `circle-sumo/circle-sumo-server/src/main.ts` — same
- MODIFY: `roblox-like/roblox-like-server/src/main.ts` — same

---

## Phase 4: Dev Player App (`tools/dev-player/`)

### Package structure:
```
tools/dev-player/
  package.json               ← @lagless/dev-player, deps: react 19, @lagless/react
  vite.config.ts             ← port 4210, @vitejs/plugin-react-swc
  index.html
  tsconfig.json
  src/
    main.tsx                 ← React root
    app/
      app.tsx                ← Main layout (top-bar + sidebar + grid + dashboard)
      app.module.css         ← Main layout styles
      types.ts               ← GamePreset, InstanceState, DevPlayerState
      store.ts               ← useReducer-based state (instances, stats, hash timeline)
      components/
        top-bar/
          top-bar.tsx        ← Game selector, instance count, Start/Stop/Restart
          top-bar.module.css
        sidebar/
          sidebar.tsx        ← Network controls wrapper
          sidebar.module.css
          latency-controls.tsx     ← Global latency sliders
          per-player-latency.tsx   ← Per-player latency sliders
        grid/
          iframe-grid.tsx    ← CSS grid of iframe containers
          iframe-grid.module.css
          iframe-instance.tsx ← Single iframe + status overlay + border color
          iframe-instance.module.css
        dashboard/
          dashboard.tsx      ← Bottom panel: tabs for stats table + hash timeline
          dashboard.module.css
          stats-table.tsx    ← Per-instance comparison table
          hash-timeline.tsx  ← Scrolling tick-aligned hash comparison
      hooks/
        use-bridge-messages.ts  ← window.addEventListener('message') → dispatch to store
        use-latency-control.ts  ← fetch() to server /api/latency and /api/dev/latency/player
        use-local-storage.ts    ← Persist/load config presets
```

### UI Layout:
```
+-------------------------------------------------------------+
| [Game ▾ Sync Test] [Instances: 2 ▾] [▶ Start] [⟳ Restart] |
+----------+--------------------------------------------------+
|          | ┌─────────────────┐  ┌─────────────────┐         |
| GLOBAL   | │  #0  P0  T:1234 │  │  #1  P1  T:1234 │         |
| Latency  | │                 │  │                 │         |
|  [====]  | │   (game iframe) │  │   (game iframe) │         |
| Jitter   | │                 │  │                 │         |
|  [====]  | └─────────────────┘  └─────────────────┘         |
| Loss     |                                                   |
|  [====]  |                                                   |
|──────────|                                                   |
| PER-PLAYER                                                   |
| P0 [====]|                                                   |
| P1 [====]|                                                   |
+----------+--------------------------------------------------+
| STATS: #0 P0 T:1234 H:a1b2c3d4 RTT:12 JIT:2 IDLY:2 RB:3  |
|        #1 P1 T:1234 H:a1b2c3d4 RTT:15 JIT:3 IDLY:2 RB:5  |
|──── HASH TIMELINE ──────────────────────────────────────────|
| ●● ●● ●● ●● ●● ●● ●● ○○ ←diverge  T:1200─1248           |
+-------------------------------------------------------------+
```

### Game Presets (hardcoded + custom):
```typescript
const PRESETS = [
  { label: 'Sync Test',   gameUrl: 'http://localhost:4201', serverUrl: 'ws://localhost:3334', scope: 'sync-test' },
  { label: 'Circle Sumo', gameUrl: 'http://localhost:4200', serverUrl: 'ws://localhost:3333', scope: 'circle-sumo' },
  { label: 'Roblox-Like', gameUrl: 'http://localhost:4202', serverUrl: 'ws://localhost:3335', scope: 'roblox-like' },
];
// + Custom URL input
```

### Key behaviors:

**Start flow:**
1. User selects game + instance count, clicks Start
2. Creates N iframes: `{gameUrl}?devBridge=true&autoMatch=true&instanceId=inst-{i}&serverUrl={serverUrl}&scope={scope}`
3. Waits for all `dev-bridge:ready` messages
4. All instances auto-start matchmaking simultaneously (via `autoMatch` URL param)
5. Server matches them into the same room
6. Dashboard starts showing live stats

**Hash timeline:**
- Ring buffer of last 300 ticks
- Groups `{ tick, hash }` from each instance by tick number
- When all instances report same tick → compare hashes
- Green dot = match, red dot = divergence, gray = waiting for all reports
- Click divergent tick to see detailed hash values

**Network controls:**
- Global: sliders → `POST http://{serverHttpUrl}/api/latency`
- Per-player: sliders → `POST http://{serverHttpUrl}/api/dev/latency/player`
- Server URL derived from WS: `ws://` → `http://`
- Reset button sets all to 0

**Instance status overlay:**
- Badge in top-left: `#0 P0 T:1234`
- Border color: gray=idle, blue=connecting, green=playing, red=error/divergence
- Staleness: no stats for >3s → "STALE" warning
- Reload button per instance: sets `iframe.src` to refresh

**localStorage presets:**
- Save current config (game, instance count, latency) with a name
- Load saved presets
- Auto-save last used config

---

## Implementation Order

### Step 1: Protocol + Bridge (foundation)
1. `libs/react/src/lib/dev-bridge/protocol.ts`
2. `libs/react/src/lib/dev-bridge/dev-bridge.ts`
3. `libs/react/src/lib/dev-bridge/use-dev-bridge.ts`
4. `libs/react/src/lib/dev-bridge/index.ts` + update `libs/react/src/index.ts`

### Step 2: relay-server per-player latency
5. `libs/relay-server/src/lib/relay-room.ts` — add `perPlayerLatency` + modify sends
6. `libs/relay-game-server/src/lib/relay-game-server.ts` — add `addCustomRoute()`

### Step 3: dev-tools lib
7. `libs/dev-tools/` package scaffold
8. `libs/dev-tools/src/lib/per-player-latency.ts` — route handler
9. `libs/dev-tools/src/lib/setup-dev-tools.ts` — main setup function

### Step 4: sync-test integration (test with one game first)
10. `sync-test/sync-test-game/src/app/hooks/use-start-multiplayer-match.ts`
11. `sync-test/sync-test-game/src/app/screens/title.screen.tsx`
12. `sync-test/sync-test-game/src/app/game-view/runner-provider.tsx`
13. `sync-test/sync-test-server/src/main.ts` — add setupDevTools
14. **Manual test**: open `http://localhost:4201?devBridge=true&autoMatch=true` directly

### Step 5: Dev Player app (core)
15. `tools/dev-player/` package scaffold (package.json, vite, tsconfig, index.html)
16. `src/app/types.ts` + `src/app/store.ts` — state management
17. `src/app/hooks/use-bridge-messages.ts` — postMessage listener
18. `src/app/hooks/use-latency-control.ts` — HTTP latency API
19. `src/app/components/top-bar/` — game selector + controls
20. `src/app/components/grid/` — iframe grid + instances
21. `src/app/components/sidebar/` — network controls (global + per-player)
22. `src/app/components/dashboard/` — stats table + hash timeline
23. `src/app/app.tsx` — main layout
24. `src/main.tsx` — entry point

### Step 6: Remaining games + polish
25. circle-sumo game client (3 files) + server (1 file)
26. roblox-like game client (3 files) + server (1 file)
27. localStorage presets (`use-local-storage.ts`)
28. Update `CLAUDE.md` with dev-player commands

---

## Verification

1. `pnpm exec nx serve @lagless/sync-test-server` (terminal 1)
2. `pnpm exec nx serve @lagless/sync-test-game` (terminal 2)
3. `cd tools/dev-player && pnpm dev` (terminal 3)
4. Open `http://localhost:4210`
5. Select "Sync Test", 2 instances → Start
6. Verify: both auto-match, play together, stats in dashboard, hash timeline green
7. Set global latency to 100ms → verify delayed gameplay
8. Set per-player latency (P0=0ms, P1=200ms) → verify asymmetric behavior
9. Move players to trigger hash verification → confirm no divergence
10. Test with 3-4 instances
11. Test with circle-sumo and roblox-like
12. Test reload instance, restart all, preset save/load

---

## Critical Files Reference

| File | Role |
|------|------|
| `libs/react/src/lib/debug-panel/use-net-stats.ts` | Pattern for extracting stats from runner |
| `libs/react/src/lib/debug-panel/types.ts` | `NetStats` interface — reuse fields |
| `libs/relay-server/src/lib/relay-room.ts:63,140-141,439-444,460-465` | Latency sim usage points |
| `libs/relay-server/src/lib/latency-simulator.ts` | `LatencySimulator` class — reuse for per-player |
| `libs/relay-game-server/src/lib/relay-game-server.ts:176-179` | Existing `/api/latency` endpoint |
| `libs/relay-game-server/src/lib/latency-setup.ts` | Pattern for latency API handling |
| `libs/relay-game-server/src/lib/types.ts:21-29` | `RouteHandler` type for custom routes |
| `sync-test/sync-test-game/src/app/hooks/use-start-multiplayer-match.ts` | Matchmaking hook — modify |
| `sync-test/sync-test-game/src/app/screens/title.screen.tsx` | Title screen — add autoMatch |
| `sync-test/sync-test-game/src/app/game-view/runner-provider.tsx` | Runner setup — add useDevBridge |
| `libs/core/src/lib/ecs-simulation.ts:48,217` | `addTickHandler()`, `mem.getHash()` |
| `libs/core/src/lib/input/abstract-input-provider.ts:38-40` | `currentInputDelay` getter |
| `libs/relay-client/src/lib/relay-input-provider.ts:63,67,71,86` | Public getters for stats |
