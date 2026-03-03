# Migrate Rapier to Deterministic-Compat Packages

## Context

The project uses `@dimforge/rapier2d-compat@0.14.0` and `@dimforge/rapier3d-compat@0.14.0` — standard Rapier builds without cross-platform determinism guarantees. For a deterministic ECS framework like Lagless, the deterministic builds (`@dimforge/rapier2d-deterministic-compat` / `@dimforge/rapier3d-deterministic-compat`) are the correct choice. The deterministic packages didn't exist at 0.14.0 (they start at 0.15.0), so this is also a version upgrade to 0.19.x.

**API compatibility:** All Rapier APIs used by the project (World, RigidBody, Collider, KCC, EventQueue, snapshots) are backwards compatible between 0.14 and 0.19. The `rapier-types.ts` interfaces already use post-0.12.0 naming (e.g., `translationDeltaApplied`). No source logic changes needed — this is a package rename + version bump.

## Changes

### Phase 1: Package manifests (5 files)

Replace package names and update versions:

| File | Old | New |
|------|-----|-----|
| `libs/physics3d/package.json` | `rapier3d-compat` peer `>=0.14.0`, dev `^0.14.0` | `rapier3d-deterministic-compat` peer `>=0.15.0`, dev `^0.19.0` |
| `libs/physics2d/package.json` | `rapier2d-compat` peer `>=0.14.0`, dev `^0.14.0` | `rapier2d-deterministic-compat` peer `>=0.15.0`, dev `^0.19.0` |
| `roblox-like/roblox-like-simulation/package.json` | `rapier3d-compat` dev `^0.14.0` | `rapier3d-deterministic-compat` dev `^0.19.0` |
| `roblox-like/roblox-like-game/package.json` | `rapier3d-compat` dep `^0.14.0` | `rapier3d-deterministic-compat` dep `^0.19.0` |
| `tools/create/templates/pixi-react/__packageName__-frontend/package.json` | both 2d/3d `^0.14.0` | both 2d/3d deterministic `^0.19.0` |

Then run `pnpm install`.

### Phase 2: Test file imports (10 files)

Replace `import RAPIER from '@dimforge/rapierXd-compat'` → `'@dimforge/rapierXd-deterministic-compat'`:

**physics3d (4 files):**
- `libs/physics3d/src/lib/__tests__/collision-events-3d.spec.ts`
- `libs/physics3d/src/lib/__tests__/physics-determinism.spec.ts`
- `libs/physics3d/src/lib/__tests__/physics-simulation-3d.spec.ts`
- `libs/physics3d/src/lib/__tests__/physics-world-manager-3d.spec.ts`

**physics2d (4 files):**
- `libs/physics2d/src/lib/__tests__/collision-events-2d.spec.ts`
- `libs/physics2d/src/lib/__tests__/physics-determinism-2d.spec.ts`
- `libs/physics2d/src/lib/__tests__/physics-simulation-2d.spec.ts`
- `libs/physics2d/src/lib/__tests__/physics-world-manager-2d.spec.ts`

**roblox-like-simulation (2 files):**
- `roblox-like/roblox-like-simulation/src/lib/__tests__/input-sanitization.spec.ts`
- `roblox-like/roblox-like-simulation/src/lib/__tests__/kcc-determinism.spec.ts`

### Phase 3: Runtime import (2 files)

- `roblox-like/roblox-like-game/src/app/game-view/runner-provider.tsx` — `import('@dimforge/rapier3d-compat')` → `import('@dimforge/rapier3d-deterministic-compat')`
- `tools/create/templates/pixi-react/__packageName__-frontend/src/app/game-view/runner-provider.tsx` — both 2d and 3d dynamic imports

### Phase 4: ESLint configs (2 files)

- `libs/physics3d/eslint.config.mjs` — `ignoredDependencies: ['@dimforge/rapier3d-deterministic-compat']`
- `libs/physics2d/eslint.config.mjs` — `ignoredDependencies: ['@dimforge/rapier2d-deterministic-compat']`

### Phase 5: Comments and docs (4 files)

- `libs/physics3d/src/lib/rapier-types.ts` — update comment mentioning `rapier3d-compat`
- `libs/physics2d/src/lib/rapier-types-2d.ts` — update comment mentioning `rapier2d-compat`
- `libs/physics3d/README.md` — install command, peer dep text, code samples
- `libs/physics2d/README.md` — install command, peer dep text, code samples

## Verification

1. `npx vitest run --project=@lagless/physics3d` — core 3D physics tests (snapshot, rollback, collisions, determinism)
2. `npx vitest run --project=@lagless/physics2d` — core 2D physics tests
3. `npx vitest run` — full test suite
4. `pnpm exec nx run-many -t lint build typecheck` — lint, build, typecheck
