# Extract Game Objects to Domain Project

Created: 2026-03-09
Status: VERIFIED
Approved: Yes
Iterations: 0
Worktree: No
Type: Feature

## Summary

**Goal:** Move game-specific object definitions (`StandardObjectType`, `STANDARD_OBJECT_REGISTRY`) and generator preset (`createStandardGenerator`) out of `@lagless/2d-map-generator` into `2d-map-test-simulation`, making the generator library fully game-agnostic.

**Architecture:** Two files move from `libs/2d-map/2d-map-generator/src/lib/presets/` to `2d-map-test/2d-map-test-simulation/src/lib/map-config/`. `STANDARD_BIOME` stays in the library. All consumers update imports. Tests and README updated.

**Tech Stack:** TypeScript, ESM, Nx monorepo

## Scope

### In Scope
- Move `standard-objects.ts` → `2d-map-test-simulation/src/lib/map-config/objects.ts`
- Move `standard-map.ts` → `2d-map-test-simulation/src/lib/map-config/create-map-generator.ts`
- Update consumers: `map-test-runner-with-map.ts`, `map-gen-demo.screen.tsx`
- Remove exports from generator's `index.ts`
- Delete source files from generator
- Move `createStandardGenerator` tests to simulation
- Update generator README

### Out of Scope
- `STANDARD_BIOME` / `standard-biome.ts` — stays in generator library
- `createMapColliders` / `MapPhysicsProvider` — stays (generic utility, not game-specific)
- Object type system (`MapObjectDef`, `MapObjectRegistry`, etc.) — stays (framework types)
- Renderer changes — doesn't reference standard objects

## Context for Implementer

- **Patterns to follow:** `2d-map-test-simulation/src/lib/arena.ts` — simple domain config file pattern
- **Conventions:** ESM imports with `.js` extension, `@lagless/source` custom condition for cross-package resolution
- **Key files:**
  - `libs/2d-map/2d-map-generator/src/lib/presets/standard-objects.ts` — source: `StandardObjectType` enum + `STANDARD_OBJECT_REGISTRY`
  - `libs/2d-map/2d-map-generator/src/lib/presets/standard-map.ts` — source: `createStandardGenerator()` with all feature config
  - `libs/2d-map/2d-map-generator/src/index.ts` — barrel exports to clean up
  - `2d-map-test/2d-map-test-simulation/src/lib/map-test-runner-with-map.ts` — main consumer in simulation
  - `2d-map-test/2d-map-test-game/src/app/screens/map-gen-demo.screen.tsx` — client consumer
  - `libs/2d-map/2d-map-generator/src/__tests__/features/places-feature.spec.ts:84-101` — `createStandardGenerator` test to move
- **Gotchas:**
  - `standard-map.ts` imports `STANDARD_BIOME` from `./standard-biome.js` — after move, import changes to `@lagless/2d-map-generator`
  - `standard-map.ts` imports feature classes from `../features/*.js` — after move, import from `@lagless/2d-map-generator`
  - `standard-map.ts` imports types from `../types/*.js` — after move, import from `@lagless/2d-map-generator`
  - `map-gen-demo.screen.tsx` (client) will import `createStandardGenerator` from `@lagless/2d-map-test-simulation` — verify tsconfig path alias works

## Feature Inventory

| Source File | Function/Export | Destination | Task |
|---|---|---|---|
| `presets/standard-objects.ts` | `StandardObjectType` enum | `map-config/objects.ts` | Task 1 |
| `presets/standard-objects.ts` | `STANDARD_OBJECT_REGISTRY` | `map-config/objects.ts` | Task 1 |
| `presets/standard-map.ts` | `createStandardGenerator()` | `map-config/create-map-generator.ts` | Task 1 |
| `presets/standard-map.ts` | `StandardGeneratorOptions` type | `map-config/create-map-generator.ts` | Task 1 |
| `presets/standard-biome.ts` | `STANDARD_BIOME` | Stays in generator | Out of Scope |

## Progress Tracking

- [x] Task 1: Create map-config in simulation
- [x] Task 2: Update consumers and remove from generator
- [x] Task 3: Update tests and README

**Total Tasks:** 3 | **Completed:** 3 | **Remaining:** 0

## Implementation Tasks

### Task 1: Create map-config in simulation

**Objective:** Create `map-config/` directory in `2d-map-test-simulation` with objects and generator preset files. Export from simulation barrel.

**Dependencies:** None

**Files:**
- Create: `2d-map-test/2d-map-test-simulation/src/lib/map-config/objects.ts`
- Create: `2d-map-test/2d-map-test-simulation/src/lib/map-config/create-map-generator.ts`
- Modify: `2d-map-test/2d-map-test-simulation/src/index.ts`

**Key Decisions / Notes:**
- `objects.ts`: Copy `StandardObjectType` enum + `STANDARD_OBJECT_REGISTRY` from `presets/standard-objects.ts`. Imports for `MapObjectDef`, `MapObjectRegistry`, `RenderLayer`, `ShapeType` come from `@lagless/2d-map-generator`.
- `create-map-generator.ts`: Copy `createStandardGenerator()` from `presets/standard-map.ts`. All feature/type imports come from `@lagless/2d-map-generator`. `STANDARD_BIOME` imported from `@lagless/2d-map-generator`. `StandardObjectType` and `STANDARD_OBJECT_REGISTRY` imported from local `./objects.js`.
- Add exports to simulation's `index.ts`:
  ```typescript
  export { StandardObjectType, STANDARD_OBJECT_REGISTRY } from './lib/map-config/objects.js';
  export { createStandardGenerator } from './lib/map-config/create-map-generator.js';
  export type { StandardGeneratorOptions } from './lib/map-config/create-map-generator.js';
  ```

**Definition of Done:**
- [ ] `objects.ts` exports `StandardObjectType` and `STANDARD_OBJECT_REGISTRY`
- [ ] `create-map-generator.ts` exports `createStandardGenerator()` and `StandardGeneratorOptions`
- [ ] Simulation barrel exports all new symbols
- [ ] TypeScript compiles: `pnpm exec nx typecheck @lagless/2d-map-test-simulation`

**Verify:**
- `pnpm exec nx typecheck @lagless/2d-map-test-simulation`

---

### Task 2: Update consumers and remove from generator

**Objective:** Update all import sites to use simulation-local paths, then delete source files from generator and remove exports.

**Dependencies:** Task 1

**Files:**
- Modify: `2d-map-test/2d-map-test-simulation/src/lib/map-test-runner-with-map.ts`
- Modify: `2d-map-test/2d-map-test-game/src/app/screens/map-gen-demo.screen.tsx`
- Modify: `libs/2d-map/2d-map-generator/src/index.ts`
- Delete: `libs/2d-map/2d-map-generator/src/lib/presets/standard-objects.ts`
- Delete: `libs/2d-map/2d-map-generator/src/lib/presets/standard-map.ts`

**Key Decisions / Notes:**
- `map-test-runner-with-map.ts`: Change `createStandardGenerator` and `STANDARD_OBJECT_REGISTRY` imports from `@lagless/2d-map-generator` to local `./map-config/create-map-generator.js` and `./map-config/objects.js`. Keep `SpatialGridCollisionProvider`, `ObjectPlacementFeature`, `createMapColliders`, `ObjectPlacementOutput`, `MapPhysicsProvider` imported from `@lagless/2d-map-generator`.
- `map-gen-demo.screen.tsx`: Change `createStandardGenerator` import from `@lagless/2d-map-generator` to `@lagless/2d-map-test-simulation`. Keep `SpatialGridCollisionProvider`, `ObjectPlacementFeature` from `@lagless/2d-map-generator`.
- Remove from generator's `index.ts`: the lines exporting `StandardObjectType`, `STANDARD_OBJECT_REGISTRY`, `createStandardGenerator`, `StandardGeneratorOptions`.

**Definition of Done:**
- [ ] `map-test-runner-with-map.ts` imports objects/generator from local paths
- [ ] `map-gen-demo.screen.tsx` imports `createStandardGenerator` from `@lagless/2d-map-test-simulation`
- [ ] Generator's `index.ts` has no standard-objects or standard-map exports
- [ ] `standard-objects.ts` and `standard-map.ts` deleted from generator
- [ ] All tests pass: `npx vitest run --project=@lagless/2d-map-generator`
- [ ] No diagnostics errors

**Verify:**
- `npx vitest run --project=@lagless/2d-map-generator`
- `pnpm exec nx typecheck @lagless/2d-map-test-simulation`
- `pnpm exec nx typecheck @lagless/2d-map-test-game`

---

### Task 3: Update tests and README

**Objective:** Move `createStandardGenerator` integration tests from generator to simulation. Update generator README to remove standard object references.

**Dependencies:** Task 2

**Files:**
- Modify: `libs/2d-map/2d-map-generator/src/__tests__/features/places-feature.spec.ts`
- Create: `2d-map-test/2d-map-test-simulation/src/lib/__tests__/create-map-generator.spec.ts`
- Modify: `libs/2d-map/2d-map-generator/README.md`

**Key Decisions / Notes:**
- `places-feature.spec.ts`: Remove the `createStandardGenerator` describe block (lines 84-101). Remove now-unused imports: `createStandardGenerator` (line 9), `BiomeFeature` (line 4), `ShoreFeature` (line 5), `GrassFeature` (line 6), `MathOps` (line 2). Remove the `beforeAll` block (lines 15-17) — PlacesFeature tests don't require WASM math init. Keep `createMockRandom` (used by `createContext`).
- New test `create-map-generator.spec.ts` in simulation: Move the two `createStandardGenerator` test cases. Import from local `../map-config/create-map-generator.js`. Import `BiomeFeature`, `ShoreFeature`, `GrassFeature` from `@lagless/2d-map-generator`. For PRNG, inline a simple `ISeededRandom` implementation (like `DemoRandom` in `map-gen-demo.screen.tsx`) — the generator's `createMockRandom` helper is internal and not exported.
- `README.md`: Remove `StandardObjectType`, `STANDARD_OBJECT_REGISTRY` mentions. Remove `createStandardGenerator` usage example. Keep framework API docs (MapGenerator, features, types). Note that presets are game-specific and should be defined in the game project.

**Definition of Done:**
- [ ] `places-feature.spec.ts` has no `createStandardGenerator` references
- [ ] New test file verifies `createStandardGenerator` works
- [ ] README has no standard-objects/standard-map references
- [ ] All generator tests pass: `npx vitest run --project=@lagless/2d-map-generator`
- [ ] All simulation tests pass: `npx vitest run --project=@lagless/2d-map-test-simulation`

**Verify:**
- `npx vitest run --project=@lagless/2d-map-generator`
- `npx vitest run --project=@lagless/2d-map-test-simulation`

## Testing Strategy

- **Unit:** New test for `createStandardGenerator` in simulation test suite
- **Integration:** Existing `places-feature.spec.ts` retains `PlacesFeature` and `STANDARD_BIOME` tests
- **Build verification:** TypeScript typecheck for generator, simulation, and game client

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `map-gen-demo.screen.tsx` can't resolve `@lagless/2d-map-test-simulation` | Low | High | Verify tsconfig path alias exists in `tsconfig.base.json`; simulation uses `@lagless/source` condition |
| Stale dist/ after removing exports from generator | Medium | Medium | Rebuild generator with `--skip-nx-cache` before testing consumers |

## Goal Verification

### Truths
1. `@lagless/2d-map-generator` has no `StandardObjectType`, `STANDARD_OBJECT_REGISTRY`, or `createStandardGenerator` exports
2. `@lagless/2d-map-generator/src/lib/presets/` contains only `standard-biome.ts`
3. `2d-map-test-simulation` exports `StandardObjectType`, `STANDARD_OBJECT_REGISTRY`, `createStandardGenerator`
4. All tests pass across generator and simulation
5. README has no game-specific object references

### Artifacts
- `2d-map-test/2d-map-test-simulation/src/lib/map-config/objects.ts`
- `2d-map-test/2d-map-test-simulation/src/lib/map-config/create-map-generator.ts`
- `libs/2d-map/2d-map-generator/src/index.ts` (cleaned)

### Key Links
- `create-map-generator.ts` → imports `STANDARD_BIOME` from `@lagless/2d-map-generator`
- `create-map-generator.ts` → imports feature classes from `@lagless/2d-map-generator`
- `create-map-generator.ts` → imports `StandardObjectType`/`STANDARD_OBJECT_REGISTRY` from local `./objects.js`
- `map-test-runner-with-map.ts` → imports from local `./map-config/`
- `map-gen-demo.screen.tsx` → imports `createStandardGenerator` from `@lagless/2d-map-test-simulation`
