# Plan: @lagless/create — Dev-Player Integration & Cleanup

## Context

Generated standalone projects from `@lagless/create` are missing dev-player integration. All three existing monorepo games (circle-sumo, sync-test, roblox-like) have 4 client-side + 2 server-side integration points that the template lacks. Additionally, standalone projects have no way to run the dev-player tool since it's a private monorepo app.

**Goal:** Add full dev-player support to generated projects with a master `pnpm dev` script that starts backend + frontend + dev-player together, add all missing integration code, and fix bugs.

---

## Part 1: Make `@lagless/dev-player` Publishable with CLI

The dev-player is currently `"private": true`. We need to make it an npm package with a CLI binary so standalone projects can run it.

### 1.1 `tools/dev-player/package.json` — make publishable
- Remove `"private": true`
- Set version to `0.0.38`
- Add `"license": "MIT"`, `"repository"`, `"publishConfig": { "access": "public" }`
- Add `"bin": { "lagless-dev-player": "./bin/lagless-dev-player.mjs" }`
- Add `"files": ["dist", "bin"]`
- Add Nx build target: `vite build`

### 1.2 Create `tools/dev-player/bin/lagless-dev-player.mjs` — CLI entry point
- Simple Node.js HTTP server (zero dependencies, only `node:` builtins)
- Parses args: `--game-url`, `--server-url`, `--scope`, `--label`, `--port`
- Serves pre-built static files from `dist/`
- Injects config into `index.html`: `<script>window.__LAGLESS_DEV_PLAYER_CONFIG__=[{...}]</script>`
- SPA fallback: serves `index.html` for unknown routes

### 1.3 `tools/dev-player/src/app/types.ts` — support injected presets
```typescript
// CLI injects presets via window.__LAGLESS_DEV_PLAYER_CONFIG__
const injected: GamePreset[] | undefined =
  typeof window !== 'undefined'
    ? (window as Record<string, unknown>).__LAGLESS_DEV_PLAYER_CONFIG__ as GamePreset[] | undefined
    : undefined;

const MONOREPO_PRESETS: GamePreset[] = [
  { label: 'Sync Test', ... },
  { label: 'Circle Sumo', ... },
  { label: 'Roblox-Like', ... },
];

export const PRESETS: GamePreset[] = injected ?? MONOREPO_PRESETS;
```

---

## Part 2: Template Changes (6 integration points)

### 2.1 Backend `package.json` — add `@lagless/dev-tools` dependency
**File:** `templates/pixi-react/__packageName__-backend/package.json`
```json
"@lagless/dev-tools": "^<%= laglessVersion %>"
```

### 2.2 Backend `main.ts` — add `setupDevTools(server)` call
**File:** `templates/pixi-react/__packageName__-backend/src/main.ts`
```typescript
import { setupDevTools } from '@lagless/dev-tools';
// ... after server creation, before server.start():
setupDevTools(server);
server.start();
```

### 2.3 `use-start-multiplayer-match.ts` — URL params + bug fix
**File:** `templates/pixi-react/__packageName__-frontend/src/app/hooks/use-start-multiplayer-match.ts`

**Add URL param support** (matches pattern from circle-sumo/sync-test/roblox-like):
```typescript
const _params = new URLSearchParams(window.location.search);
const SERVER_URL = _params.get('serverUrl') || import.meta.env.VITE_RELAY_URL || 'ws://localhost:<%= serverPort %>';
const SCOPE = _params.get('scope') || '<%= packageName %>';
```
Use `SCOPE` variable in `ws.onopen` instead of hardcoded `'<%= packageName %>'`.

**Fix `ws.onclose` bug** — captures stale closure `state`:
```typescript
// Before (bug):
ws.onclose = () => { if (state === 'queuing') setState('idle'); };
// After (fix):
ws.onclose = () => { setState((prev) => (prev === 'queuing' ? 'idle' : prev)); };
```

### 2.4 `title.screen.tsx` — add auto-match + DevBridge
**File:** `templates/pixi-react/__packageName__-frontend/src/app/screens/title.screen.tsx`

Add imports and `useEffect` for dev-bridge (same pattern as all 3 existing games):
```typescript
import { useEffect } from 'react';  // add to existing import
import { DevBridge } from '@lagless/react';

// Inside TitleScreen, before return:
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('autoMatch') === 'true' && multiplayer.state === 'idle') {
    multiplayer.startMatch();
  }
  const bridge = DevBridge.fromUrlParams();
  if (!bridge) return;
  bridge.sendMatchState(multiplayer.state === 'idle' ? 'idle' : multiplayer.state);
  return bridge.onParentMessage((msg) => {
    if (msg.type === 'dev-bridge:start-match' && multiplayer.state === 'idle') {
      multiplayer.startMatch();
    }
  });
}, [multiplayer.state]);
```

### 2.5 `runner-provider.tsx` — add `useDevBridge(runner)`
**File:** `templates/pixi-react/__packageName__-frontend/src/app/game-view/runner-provider.tsx`

```typescript
import { useDevBridge } from '@lagless/react';
// Inside RunnerProvider, before the return statement:
useDevBridge(runner, { hashTrackingInterval: <%= projectName %>Arena.hashReportInterval });
```

### 2.6 Root `package.json` — add scripts + dependencies
**File:** `templates/pixi-react/package.json`

Add master `dev` script using `concurrently` to run all 3 services in parallel with colored labels, file watching handled by each sub-process (bun --watch, vite HMR, dev-player static server):

```json
{
  "private": true,
  "scripts": {
    "dev": "concurrently -k -n backend,frontend,player -c blue,green,yellow \"pnpm dev:backend\" \"pnpm dev:frontend\" \"pnpm dev:player\"",
    "dev:frontend": "pnpm --filter <%= packageName %>-frontend dev",
    "dev:backend": "pnpm --filter <%= packageName %>-backend dev",
    "dev:player": "lagless-dev-player --game-url http://localhost:<%= frontendPort %> --server-url ws://localhost:<%= serverPort %> --scope <%= packageName %>",
    "codegen": "npx @lagless/codegen -c <%= packageName %>-simulation/src/lib/schema/ecs.yaml"
  },
  "devDependencies": {
    "@lagless/dev-player": "^<%= laglessVersion %>",
    "concurrently": "^9.1.0"
  }
}
```

- `concurrently -k` kills all processes when one exits
- `-n backend,frontend,player` prefixes each process output with a label
- `-c blue,green,yellow` color-codes each process
- Backend uses `bun --watch` (auto-restarts on code changes)
- Frontend uses Vite (HMR for instant updates)
- Dev-player serves pre-built static files (no HMR needed — it reads game state via postMessage)

The dev-player is **pre-configured** for the generated project: `--game-url`, `--server-url`, and `--scope` are template-injected with the project's specific ports and package name. No manual configuration needed.

---

## Part 3: Create CLI & Docs Updates

### 3.1 `tools/create/src/index.ts` — update "next steps" output
Update the next steps to highlight `pnpm dev` as the primary command:
```
  pnpm install
  pnpm codegen           # Generate ECS code from schema
  pnpm dev               # Start backend + frontend + dev-player
```
Also mention individual scripts: `pnpm dev:backend`, `pnpm dev:frontend`, `pnpm dev:player`.

### 3.2 Template `CLAUDE.md` — add commands
Add to the Commands section:
```
# Start everything (backend + frontend + dev-player)
pnpm dev

# Or run individually:
pnpm dev:backend    # Game server (Bun, watches for changes)
pnpm dev:frontend   # Frontend (Vite HMR)
pnpm dev:player     # Dev-player (multiplayer testing tool, port 4210)
```

### 3.3 Template `README.md` — add dev-player section
Update Getting Started to use `pnpm dev` as the main command. Add brief section about dev-player for multiplayer testing.

---

## Part 4: Prerequisite — `@lagless/dev-tools` Publishability

**File:** `libs/dev-tools/package.json`
- Already not private, but missing `publishConfig` and `repository`
- Add `"publishConfig": { "access": "public" }`
- Add `"repository"` field
- Bump version to `0.0.38`

---

## Verification

1. **Build dev-player:** `pnpm exec nx build @lagless/dev-player` → produces `dist/`
2. **Test CLI locally:** `node tools/dev-player/bin/lagless-dev-player.mjs --game-url http://localhost:4200 --server-url ws://localhost:3333 --scope circle-sumo`
3. **Test template generation:** `node tools/create/dist/index.js test-game --simulation-type raw` → verify generated files contain all integration points
4. **Test generated project:** `cd test-game && pnpm install && pnpm codegen && pnpm dev:backend & pnpm dev:frontend` → verify game works, then `pnpm dev:player` → verify dev-player connects
5. **Verify monorepo dev-player still works:** `pnpm exec nx serve @lagless/dev-player` → should show monorepo presets
