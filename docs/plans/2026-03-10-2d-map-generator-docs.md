# 2D Map Generator Documentation Update

Created: 2026-03-10
Status: VERIFIED
Approved: Yes
Iterations: 0
Worktree: No
Type: Feature

## Summary

**Goal:** Add comprehensive 2D map generation documentation to the `@lagless/create` template and update the root `CLAUDE.md`, so users have full guidance on integrating `@lagless/2d-map-generator` + `@lagless/2d-map-renderer` into their games.

**Architecture:** New doc file `docs/11-2d-map-generation.md` in the create template, conditionally included only for `physics2d` projects (same pattern as existing physics docs). Recipe added to `09-recipes.md`. Root `CLAUDE.md` gets a dedicated `## 2D Map Generation` section. No new dependencies added — documentation only.

**Tech Stack:** Markdown, EJS templates, TypeScript (create script modification)

## Scope

### In Scope
- Create `docs/11-2d-map-generation.md` in `tools/create/templates/pixi-react/docs/`
- Update `tools/create/templates/pixi-react/CLAUDE.md` — add doc reference in table
- Update `tools/create/src/index.ts` — delete 11-2d-map-generation.md for non-physics2d projects
- Add "Add Procedural 2D Map" recipe to `tools/create/templates/pixi-react/docs/09-recipes.md`
- Add dedicated `## 2D Map Generation` section to root `CLAUDE.md`
- Update `libs/2d-map/2d-map-generator/README.md` if any API details are stale

### Out of Scope
- Adding `@lagless/2d-map-generator` or `@lagless/2d-map-renderer` as dependencies to the create template
- Creating new template variants or presets
- Modifying any library source code
- Adding documentation for 3D map generation (doesn't exist)

## Context for Implementer

> Write for an implementer who has never seen the codebase.

**Patterns to follow:**
- Existing docs (`01-10`) in `tools/create/templates/pixi-react/docs/` — same markdown style, code examples with game-relevant patterns
- Physics docs conditional inclusion: `tools/create/src/index.ts:170-178` — delete files for non-matching simulation types
- CLAUDE.md doc table: `tools/create/templates/pixi-react/CLAUDE.md:238-244` — EJS conditional for physics-specific docs
- Root CLAUDE.md Physics section: `CLAUDE.md` line ~278 — dedicated section with subsections

**Conventions:**
- Docs use h1 for title, h2 for major sections, h3 for subsections
- Code examples use TypeScript with full imports
- References to other docs use relative markdown links `[docs/XX-name.md](docs/XX-name.md)`

**Key files:**
- `tools/create/templates/pixi-react/docs/` — all template docs
- `tools/create/templates/pixi-react/CLAUDE.md` — template CLAUDE instructions
- `tools/create/src/index.ts` — create script with conditional file deletion
- `CLAUDE.md` — root project Claude instructions
- `libs/2d-map/2d-map-generator/README.md` — existing generator docs (368 lines)
- `2d-map-test/` — reference implementation (game using 2d-map-generator)

**Gotchas:**
- CLAUDE.md in create template uses EJS (`<%= %>` and `<% if %>`) — must respect template syntax
- `11-2d-map-generation.md` does NOT need EJS because it is excluded via file deletion. Other doc files like `09-recipes.md` DO support EJS conditionals (all `.md` files are EJS-processed by `create/src/index.ts:148`)
- `isInsideCanopyZone` is exported from generator but not in README — discovered in `map-test-view.tsx:12`

**Domain context:**
- 2d-map-generator produces deterministic maps from a seed using a feature pipeline
- 2d-map-renderer renders those maps using Pixi.js (MapTerrainRenderer for terrain, MapObjectRenderer for objects)
- Map generation happens BEFORE simulation starts (in runner constructor), not during simulation ticks
- Physics colliders for map objects are created via `createMapColliders()` adapter pattern
- Canopy transparency is view-only (non-deterministic) — uses `extractCanopyZones()` + per-frame distance checks
- `2d-map-test` game is the reference implementation showing full integration

## Assumptions

- Doc numbering `11-*` is the correct next number — supported by existing docs ending at `10-common-mistakes.md` — Tasks 1, 3 depend on this
- The conditional deletion pattern in `create/src/index.ts` is the canonical way to exclude docs — supported by `index.ts:170-178` physics cleanup — Task 2 depends on this
- The `2d-map-test` game in the monorepo represents the current recommended integration pattern — supported by reading all its source files — Tasks 1, 4 depend on this
- The 2d-map-generator README is mostly current but may need minor updates for `isInsideCanopyZone` and `optional` field — Task 5 depends on this

## Testing Strategy

- **No unit tests** — documentation-only changes
- **Manual verification:** Build the create script (`pnpm exec nx build @lagless/create`), verify the template processes correctly
- **Typecheck:** Ensure root CLAUDE.md doesn't break any existing references
- **Content review:** Verify all code examples match current API exports from `src/index.ts`

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Code examples reference removed/renamed APIs | Low | Medium | Verify every import against `src/index.ts` exports |
| EJS syntax errors in CLAUDE.md template | Low | High | Test with `ejs.render()` or build the create script |
| Doc too long / overwhelming | Medium | Low | Structure with clear sections, link to generator README for deep dive |

## Pre-Mortem

*Assume this plan failed. Most likely internal reasons:*
1. **Code examples don't compile** (Task 1) → Trigger: any import or type reference in code blocks doesn't match current exports in `libs/2d-map/2d-map-generator/src/index.ts` or `libs/2d-map/2d-map-renderer/src/index.ts`
2. **Conditional exclusion breaks other files** (Task 2) → Trigger: creating a `raw` or `physics3d` project fails or shows errors about missing doc links in CLAUDE.md

## Goal Verification

### Truths
1. A project created with `--simulation-type physics2d` contains `docs/11-2d-map-generation.md`
2. A project created with `--simulation-type raw` does NOT contain `docs/11-2d-map-generation.md`
3. The create template's `CLAUDE.md` references the new doc conditionally (physics2d only)
4. `docs/09-recipes.md` contains a "Add Procedural 2D Map" recipe
5. Root `CLAUDE.md` has a `## 2D Map Generation` section covering both generator and renderer
6. All code examples in the new doc use correct imports matching current `src/index.ts` exports

### Artifacts
- `tools/create/templates/pixi-react/docs/11-2d-map-generation.md` — new comprehensive doc
- `tools/create/templates/pixi-react/CLAUDE.md` — updated doc table
- `tools/create/templates/pixi-react/docs/09-recipes.md` — new recipe section
- `tools/create/src/index.ts` — conditional deletion logic
- `CLAUDE.md` — dedicated 2D Map Generation section

### Key Links
- `11-2d-map-generation.md` ← referenced by → `CLAUDE.md` doc table (EJS conditional)
- `11-2d-map-generation.md` ← deleted by → `create/src/index.ts` (non-physics2d)
- Code examples ← must match → `2d-map-generator/src/index.ts` + `2d-map-renderer/src/index.ts` exports
- Recipe in `09-recipes.md` ← links to → `11-2d-map-generation.md` for details

## Progress Tracking

- [x] Task 1: Create docs/11-2d-map-generation.md
- [x] Task 2: Update create script for conditional exclusion
- [x] Task 3: Update create template CLAUDE.md
- [x] Task 4: Add recipe to 09-recipes.md
- [x] Task 5: Update root CLAUDE.md
- [x] Task 6: Verify 2d-map-generator README accuracy

**Total Tasks:** 6 | **Completed:** 6 | **Remaining:** 0

## Implementation Tasks

### Task 1: Create docs/11-2d-map-generation.md

**Objective:** Write comprehensive documentation for 2D map generation covering both `@lagless/2d-map-generator` and `@lagless/2d-map-renderer`.
**Dependencies:** None

**Files:**
- Create: `tools/create/templates/pixi-react/docs/11-2d-map-generation.md`

**Key Decisions / Notes:**
- Structure: Overview → Installation → Architecture → MapGenerator Setup → Object Definitions → Placement Stages → Terrain Query → Physics Integration → Rendering (Terrain + Objects) → Canopy Transparency → Minimap → Determinism Notes → API Reference
- Use `2d-map-test` as reference for all code examples — the patterns there are verified working
- Cover the full integration flow: simulation (runner constructor) → physics colliders → client rendering
- Include `MapPhysicsProvider` adapter pattern from `2d-map-test/map-test-runner-with-map.ts`
- Include `MapData` DI pattern for passing map data to systems
- Include `isInsideCanopyZone` utility (not in README but used in `map-test-view.tsx`)
- No EJS in this file — it's plain markdown, conditionally excluded by file deletion

**Definition of Done:**
- [ ] File created with all sections listed above
- [ ] All code examples compile (verified against `src/index.ts` exports)
- [ ] Covers full flow: generate → colliders → render terrain → render objects → canopy transparency
- [ ] References to other docs use correct relative paths

**Verify:**
- Read the file and compare every import to `libs/2d-map/2d-map-generator/src/index.ts` and `libs/2d-map/2d-map-renderer/src/index.ts`

---

### Task 2: Update create script for conditional exclusion

**Objective:** Add logic to `tools/create/src/index.ts` to delete `docs/11-2d-map-generation.md` for non-physics2d projects.
**Dependencies:** Task 1

**Files:**
- Modify: `tools/create/src/index.ts`

**Key Decisions / Notes:**
- Follow exact pattern from lines 170-178 where physics2d/3d docs are conditionally removed
- Add after the existing physics doc cleanup block:
  ```typescript
  if (simulationType !== 'physics2d') {
    const f = path.join(docsDir, '11-2d-map-generation.md');
    if (fs.existsSync(f)) fs.rmSync(f);
  }
  ```

**Definition of Done:**
- [ ] Script deletes `11-2d-map-generation.md` when `simulationType !== 'physics2d'`
- [ ] Existing cleanup logic unchanged
- [ ] Build succeeds: `pnpm exec nx build @lagless/create`
- [ ] Confirmed `11-2d-map-generation.md` is present for physics2d and absent for raw/physics3d projects

**Verify:**
- `pnpm exec nx build @lagless/create`
- Manual check: review the deletion logic matches the existing physics docs pattern

---

### Task 3: Update create template CLAUDE.md

**Objective:** Add reference to `11-2d-map-generation.md` in the docs table, conditionally shown for physics2d projects.
**Dependencies:** Task 1

**Files:**
- Modify: `tools/create/templates/pixi-react/CLAUDE.md`

**Key Decisions / Notes:**
- Add to the "Detailed Documentation" table at line ~238, inside an EJS conditional block like the existing physics docs:
  ```
  <% if (simulationType === 'physics2d') { -%>
  | [docs/11-2d-map-generation.md](docs/11-2d-map-generation.md) | Procedural 2D map generation, terrain rendering, object placement |
  <% } -%>
  ```
- Place after the physics2d/3d conditional entries

**Definition of Done:**
- [ ] CLAUDE.md shows doc link for physics2d projects
- [ ] CLAUDE.md does NOT show doc link for raw/physics3d projects
- [ ] EJS syntax is valid

**Verify:**
- Review the EJS template for correct syntax

---

### Task 4: Add recipe to 09-recipes.md

**Objective:** Add a "Add Procedural 2D Map" recipe to the cookbook doc.
**Dependencies:** Task 1

**Files:**
- Modify: `tools/create/templates/pixi-react/docs/09-recipes.md`

**Key Decisions / Notes:**
- Add a concise recipe section showing the quick steps:
  1. Install dependencies
  2. Define object registry
  3. Create map generator
  4. Generate map in runner constructor
  5. Create physics colliders
  6. Render terrain and objects
  7. Link to `11-2d-map-generation.md` for full details
- Wrap in EJS conditional: `<% if (simulationType === 'physics2d') { -%>...<% } -%>`
- Keep recipe concise (~30-50 lines) — full details in the dedicated doc

**Definition of Done:**
- [ ] Recipe added with clear step-by-step
- [ ] Wrapped in physics2d EJS conditional
- [ ] Links to `11-2d-map-generation.md` for details

**Verify:**
- Review content for correctness against `2d-map-test` patterns

---

### Task 5: Update root CLAUDE.md

**Objective:** Add a dedicated `## 2D Map Generation` section to the root project `CLAUDE.md`, similar to the existing `## Physics Libraries` section.
**Dependencies:** None

**Files:**
- Modify: `CLAUDE.md`

**Key Decisions / Notes:**
- Place after the `## Physics Libraries` section (or after `## Character Controller & Animation`)
- Cover:
  - Package overview (`@lagless/2d-map-generator`, `@lagless/2d-map-renderer`)
  - Architecture: MapGenerator → features → IGeneratedMap → renderers
  - Key types and exports
  - Integration pattern (runner constructor, MapPhysicsProvider, capturePreStartState)
  - Reference to `2d-map-test/` as example game
- Style: match existing CLAUDE.md sections — concise, reference-oriented, code snippets

**Definition of Done:**
- [ ] Section added with architecture overview
- [ ] Key APIs documented (MapGenerator, features, renderers, createMapColliders)
- [ ] Integration pattern explained
- [ ] `2d-map-test` referenced as example
- [ ] `2d-map-test` listed in the Games line of the Directory Structure section (verify, add if missing)

**Verify:**
- Read section and verify all referenced types exist in exports

---

### Task 6: Verify 2d-map-generator README accuracy

**Objective:** Check the existing `libs/2d-map/2d-map-generator/README.md` against current API and fix any stale content.
**Dependencies:** None

**Files:**
- Modify (if needed): `libs/2d-map/2d-map-generator/README.md`

**Key Decisions / Notes:**
- Check that `isInsideCanopyZone` is documented (it's exported but not in README)
- Verify `optional` field name (was recently renamed from `retryOnFailure` per session history)
- Verify `CanopyZoneCuboid` type is mentioned (added recently)
- Check all imports in code examples match current `src/index.ts`
- Fix any stale references to old field names

**Definition of Done:**
- [ ] `isInsideCanopyZone` documented
- [ ] All field names current (no stale `retryOnFailure` references)
- [ ] `CanopyZone` variant types mentioned
- [ ] All code example imports valid

**Verify:**
- Compare README imports against `libs/2d-map/2d-map-generator/src/index.ts`

## Open Questions

None — all decisions resolved during planning.

## Deferred Ideas

- Add `@lagless/2d-map-generator` as an optional dependency in the create template (with a prompt during project creation)
- Create a separate `pixi-react-map` preset that includes map generation out of the box
