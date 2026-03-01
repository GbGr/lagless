# Plan: Comprehensive Documentation Package for @lagless/create Templates

## Context

`@lagless/create` generates game project templates with three packages (simulation, frontend, backend). The current template has a minimal CLAUDE.md (~80 lines), basic AGENTS.md (~42 lines), and a README.md. This is insufficient for an AI agent to autonomously build games on the framework.

**Goal:** Create a documentation package (CLAUDE.md + docs/*.md + docs/sources/) that gives Claude AI everything needed to write high-quality, deterministic, multiplayer-ready game code without needing to consult external sources.

---

## File Structure (in generated project)

```
<generated-project>/
  CLAUDE.md                          # ~200 lines, primary AI instruction file (rewrite)
  AGENTS.md                          # ~80 lines, multi-agent guide (expand)
  README.md                          # Keep as-is (human-facing)
  docs/
    01-schema-and-codegen.md         # YAML format, field types, codegen workflow
    02-ecs-systems.md                # Writing systems, DI, execution order
    03-determinism.md                # CRITICAL: rules, pitfalls, debugging
    04-input-system.md               # drainInputs, RPCs, validation
    05-signals.md                    # Predicted/Verified/Cancelled events
    06-rendering.md                  # FilterViews, VisualSmoother, Pixi.js
    07-multiplayer.md                # Relay, server hooks, state transfer
    08-physics2d.md                  # Rapier 2D (only for physics2d sims)
    08-physics3d.md                  # Rapier 3D (only for physics3d sims)
    09-recipes.md                    # Step-by-step cookbook for common tasks
    10-common-mistakes.md            # "Never do X" reference + error solutions
    api-quick-reference.md           # One-page cheat sheet of key APIs
  docs/sources/                      # .gitignored, full lagless repo clone
    lagless/                         # git clone --depth 1 of the framework repo
      libs/                          # All framework source code
      circle-sumo/                   # Example game for reference
      roblox-like/                   # 3D example with character controller
      sync-test/                     # Determinism testing reference
      ...
```

---

## Implementation Steps

### Step 1: Update `tools/create/src/index.ts` — add git clone step

After template rendering, run `git clone --depth 1 https://github.com/GbGr/lagless.git` into `<targetDir>/docs/sources/lagless/`.

```typescript
// After template files are rendered:
const sourcesDir = path.join(targetDir, 'docs', 'sources');
fs.mkdirSync(sourcesDir, { recursive: true });
console.log('Cloning lagless framework source for AI reference...');
execSync(`git clone --depth 1 https://github.com/GbGr/lagless.git "${path.join(sourcesDir, 'lagless')}"`, {
  stdio: 'inherit',
});
// Optionally remove .git to save space:
fs.rmSync(path.join(sourcesDir, 'lagless', '.git'), { recursive: true, force: true });
```

**Import `execSync` from `child_process`** at the top of index.ts.

No changes to `package.json` `files` array needed — sources are cloned at runtime, not bundled.

**File:** `tools/create/src/index.ts`

### Step 2: Update template `.gitignore`

Add `docs/sources/` to `tools/create/templates/pixi-react/.gitignore`.

**File:** `tools/create/templates/pixi-react/.gitignore`

```
node_modules/
dist/
.vite/
*.tsbuildinfo
.DS_Store
docs/sources/
```

### Step 3: Rewrite CLAUDE.md template

**File:** `tools/create/templates/pixi-react/CLAUDE.md`

Complete rewrite (~200 lines). Dense, action-oriented, with code templates. Uses EJS for `<%= projectName %>`, `<%= packageName %>`, and simulationType conditionals.

**Sections:**
1. **What This Is** (3 lines) — game + framework + architecture summary
2. **Commands** (8 lines) — install, dev:backend, dev:frontend, codegen, test
3. **Project Structure** (12 lines) — tree of 3 packages, key files in each
4. **Quick Recipe: Adding a Feature** (12 lines) — schema → codegen → system → render → hooks
5. **ECS System Pattern** (15 lines) — complete @ECSSystem() code template
6. **Input Handling Pattern** (15 lines) — drainInputs + collectTickRPCs + sanitization code
7. **Rendering Pattern** (12 lines) — FilterViews + filterView + VisualSmoother code
8. **Signal Pattern** (10 lines) — define + emit + subscribe code
9. **DETERMINISM RULES (CRITICAL)** (20 lines) — bold rules, safe/forbidden function lists
10. **Input Validation Rules** (8 lines) — finite() → clamp, NaN propagation warning
11. **Schema Quick Reference** (15 lines) — field types, components, singletons, inputs, filters, tags
12. **Key APIs Cheat Sheet** (20 lines) — table: class → purpose → how to access
13. **System Execution Order** (8 lines) — canonical order for systems array
14. **Detailed Documentation** (15 lines) — links to all docs/*.md with one-line descriptions
15. **Source Reference** (5 lines) — docs/sources/lagless/ contains full repo for deep dives

Physics sections conditionally included based on `simulationType`.

### Step 4: Write docs/ markdown files

All placed in `tools/create/templates/pixi-react/docs/`.

**4a. `01-schema-and-codegen.md`** (~200 lines)
- YAML schema location and codegen command
- Complete field type table (type → TypedArray → bytes → range)
- Components syntax + tag components (empty body = bitmask-only)
- Singletons, PlayerResources, Inputs, Filters syntax with examples
- simulationType auto-prepend behavior (physics2d: Transform2d+PhysicsRefs, etc.)
- Generated files inventory (Runner, Core, InputRegistry, component/filter classes)
- Common schema patterns (player entity, projectile, game phases)

**4b. `02-ecs-systems.md`** (~180 lines)
- System anatomy: @ECSSystem() + IECSSystem + constructor DI + update(tick)
- DI injectable tokens: components, singletons, filters, managers, signals, PRNG, ECSConfig, AbstractInputProvider
- Data access: `.unsafe.field[entity]` (hot path) vs `.getCursor(entity)` (convenient)
- Entity lifecycle: EntitiesManager.createEntity/removeEntity/addComponent/removeComponent/hasComponent
- Prefabs: `Prefab.create().with(Component, { field: value })`
- Filter iteration: `for (const entity of this._filter) { ... }`
- PRNG: `this._prng.getFloat()`, `getRandomInt(from, to)`
- PlayerResources access pattern
- Complete annotated system example

**4c. `03-determinism.md`** (~150 lines) — **THE MOST CRITICAL DOC**
- Why determinism matters (desync = permanent, unrepairable without state reset)
- **ALWAYS** rules: MathOps for trig, prevPosition on spawn, PRNG not Math.random
- **NEVER** rules: Math.sin/cos/atan2/sqrt, Date.now(), Math.random(), Array.sort() without comparator
- **SAFE** Math functions: abs, min, max, floor, ceil, round, trunc, hypot, sign, fround
- NaN propagation chain: NaN → MathOps.clamp → NaN → Rapier → permanent divergence
- Float precision: float32 truncation by framework, don't manually cast
- Input sanitization: `Number.isFinite()` BEFORE `MathOps.clamp()`
- Debugging divergence: F3 debug panel → hash table → binary search between systems
- Testing determinism: same inputs twice → compare ArrayBuffer hash
- Determinism code review checklist

**4d. `04-input-system.md`** (~180 lines)
- Architecture overview: client → drainInputs → addRPC → RPCHistory → server relay → system reads
- Client-side: drainInputs pattern with keyboard + joystick examples
- System-side: `collectTickRPCs(tick, InputClass)` iteration + rpc.meta/data access
- Input sanitization: complete code example with `finite()` helper
- Server events: ctx.emitServerEvent in RoomHooks
- Adding a new input type: step-by-step (yaml → codegen → send → read)
- Input delay mechanics
- Hash reporting: createHashReporter integration

**4e. `05-signals.md`** (~120 lines)
- Three streams: Predicted (instant), Verified (permanent), Cancelled (undo)
- verifiedTick by provider: Local=tick, Relay=maxServerTick-1
- Defining: @ECSSignal() + extends Signal<TData>
- Emitting in systems: signal.emit(tick, data)
- Subscribing in view: signal.Predicted.subscribe(e => ...), Verified, Cancelled
- Rollback behavior: _pending clears, _awaitingVerification preserved for comparison
- Use cases: sounds (Predicted), score (Verified), cancel sound (Cancelled)
- Deduplication: shallow object comparison via _dataEquals

**4f. `06-rendering.md`** (~150 lines)
- Architecture: simulation (deterministic) → view (non-deterministic, read-only)
- FilterViews: `<FilterViews filter={f} View={V} />` lifecycle management
- filterView: `filterView(({ entity }, ref) => ...)` with onCreate/onUpdate/onDestroy
- VisualSmoother2d: interpolation + rollback smoothing (absorbs jump, exponential decay)
- Pixi.js setup: extend(), Application, RunnerTicker
- Adding new entity visuals: step-by-step
- Performance: unsafe arrays in onUpdate, minimize re-renders
- Virtual joystick: VirtualJoystickProvider + useVirtualJoystick

**4g. `07-multiplayer.md`** (~160 lines)
- Architecture: server relays inputs, clients simulate deterministically
- Client: LocalInputProvider (single-player) vs RelayInputProvider (multiplayer)
- RelayConnection: WebSocket management, server URL, matchmaking
- Server: RelayGameServer setup pattern with all config options
- RoomHooks: complete interface (onRoomCreated, onPlayerJoin, onPlayerLeave, onPlayerReconnect, shouldAcceptLateJoin, shouldAcceptReconnect, onPlayerFinished, onMatchEnd, onRoomDisposed)
- ctx.emitServerEvent for server-originated RPCs
- State transfer: late-join flow (StateRequest → snapshot → majority hash → StateResponse)
- Reconnect: disconnect timeout → state transfer on reconnect
- Testing: two tabs, dev-player tool, F3 debug panel

**4h. `08-physics2d.md`** (~180 lines) — **only generated for simulationType='physics2d'**
- Rapier 2D integration overview
- Transform2d auto-prepend: 6 float32 fields (posX/Y, rot, prevPosX/Y, prevRot)
- PhysicsRefs: bodyHandle, colliderHandle, bodyType, collisionLayer
- Body types: Dynamic, Fixed, KinematicPosition, KinematicVelocity
- Creating bodies and colliders: PhysicsWorldManager2d API
- Collision layers: named groups, max 16
- ColliderEntityMap: Rapier Float64 handle → entity mapping (handleToIndex)
- Physics step system: substeps, event draining
- Rollback: Rapier snapshot/restore, QueryPipeline fix (updateSceneQueries)
- State transfer: rebuild ColliderEntityMap after applyExternalState
- Complete physics system code example

**4i. `08-physics3d.md`** (~200 lines) — **only generated for simulationType='physics3d'**
- Same structure as physics2d.md but for 3D
- Transform3d: 14 float32 fields (pos XYZ, rot XYZW, prev*)
- 3D-specific: quaternion rotation, 3D collider shapes
- Character controller: CharacterControllerManager, KCC setup, recreateAll() after rollback
- Animation controller: AnimationStateMachine, crossfade, LocomotionBlendCalculator
- System execution order for 3D: SavePrevTransform → Input → CharacterMovement → PhysicsStep → Animation
- Complete 3D physics + character controller example

**4j. `09-recipes.md`** (~200 lines)
Step-by-step cookbook:
- Add a new component / system / input / entity type / signal / screen / singleton
- Add bot AI
- Add game phases (lobby/playing/gameover)
- Add timer/countdown
- Add collision detection (raw vs physics)
- Add score tracking
- Add death/respawn
- Add projectile with lifetime

**4k. `10-common-mistakes.md`** (~120 lines)
By category: Determinism, Input, Schema, Systems, Rendering, Physics, Multiplayer.
Each: what goes wrong → correct approach.
Plus error message → solution mapping section.

**4l. `api-quick-reference.md`** (~100 lines)
One-page cheat sheet:
- Entity Management: create, remove, add/remove component, hasComponent
- Component Access: unsafe arrays, getCursor, set
- Input: drainInputs, collectTickRPCs, addRPC, getFrameRPCBuffer
- Signals: emit, Predicted/Verified/Cancelled subscribe
- Filters: iteration, length
- PRNG: getFloat, getRandomInt, getRandomIntInclusive
- Config: ECSConfig options with defaults
- Physics: WorldManager, ColliderEntityMap, CollisionLayers (if applicable)
- Rendering: FilterViews, filterView, VisualSmoother2d
- Runner: start, update, dispose, DIContainer, Simulation

### Step 5: Expand AGENTS.md template

**File:** `tools/create/templates/pixi-react/AGENTS.md`

Expand to ~80 lines:
- Project overview (3 packages)
- Task decomposition for: new feature, debugging determinism, testing
- Explicit file ownership per task type
- Verification checklist per feature type
- Key files table

### Step 6: Add docs/sources/README.md to template

**File:** `tools/create/templates/pixi-react/docs/sources/README.md`

Short explanation:
```markdown
# Source Reference

This directory contains a clone of the Lagless framework repository.
It is .gitignored and provided solely for AI agent reference.
Do NOT import from these files — use the @lagless/* npm packages instead.
To update: delete this directory and re-run the init command.
```

Note: This README.md is a static template file. The actual framework code is cloned at runtime into the `lagless/` subdirectory alongside it.

---

## Key Design Decisions

1. **git clone --depth 1 for sources:** Full repo cloned at project generation time. Gives AI access to all libs, game examples, tests. `.git` removed to save space. Gitignored in the project.

2. **Two separate physics docs:** `08-physics2d.md` and `08-physics3d.md` — no EJS in docs folder. Generator copies only the relevant one based on simulationType. Cleaner, easier to maintain.

3. **Most docs are plain .md (no EJS):** Use generic names like `MyComponent`, `PlayerFilter`. Only CLAUDE.md and AGENTS.md use EJS for project-specific names.

4. **CLAUDE.md ~200 line target:** Dense index with inline code templates. All deep dives in docs/*.md with explicit links.

5. **03-determinism.md is the priority doc:** Determinism bugs are the #1 failure mode. Gets the most attention, most examples, most explicit rules.

---

## Files to Modify/Create

| File | Action |
|------|--------|
| `tools/create/src/index.ts` | Add git clone step + import execSync |
| `tools/create/templates/pixi-react/.gitignore` | Add `docs/sources/` |
| `tools/create/templates/pixi-react/CLAUDE.md` | Complete rewrite (~200 lines) |
| `tools/create/templates/pixi-react/AGENTS.md` | Expand (~80 lines) |
| `tools/create/templates/pixi-react/docs/01-schema-and-codegen.md` | New file |
| `tools/create/templates/pixi-react/docs/02-ecs-systems.md` | New file |
| `tools/create/templates/pixi-react/docs/03-determinism.md` | New file |
| `tools/create/templates/pixi-react/docs/04-input-system.md` | New file |
| `tools/create/templates/pixi-react/docs/05-signals.md` | New file |
| `tools/create/templates/pixi-react/docs/06-rendering.md` | New file |
| `tools/create/templates/pixi-react/docs/07-multiplayer.md` | New file |
| `tools/create/templates/pixi-react/docs/08-physics2d.md` | New file (physics2d only) |
| `tools/create/templates/pixi-react/docs/08-physics3d.md` | New file (physics3d only) |
| `tools/create/templates/pixi-react/docs/09-recipes.md` | New file |
| `tools/create/templates/pixi-react/docs/10-common-mistakes.md` | New file |
| `tools/create/templates/pixi-react/docs/api-quick-reference.md` | New file |
| `tools/create/templates/pixi-react/docs/sources/README.md` | New file (static) |

---

## Verification

1. Run `create-lagless test-raw --simulation-type raw` — verify no physics docs, sources cloned
2. Run `create-lagless test-2d --simulation-type physics2d` — verify 08-physics2d.md present, no 08-physics3d.md
3. Run `create-lagless test-3d --simulation-type physics3d` — verify 08-physics3d.md present, no 08-physics2d.md
4. Verify CLAUDE.md is under 200 lines in each variant
5. Verify all doc links from CLAUDE.md resolve to existing files
6. Verify docs/sources/ is in .gitignore
7. Verify docs/sources/lagless/ directory exists with libs/ and game examples
8. Build: `pnpm exec nx build @lagless/create` succeeds
