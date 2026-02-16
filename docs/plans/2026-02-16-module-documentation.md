# Module Documentation for AI Agents — Implementation Plan

Created: 2026-02-16
Status: VERIFIED
Approved: Yes
Iterations: 0
Worktree: No

> **Status Lifecycle:** PENDING → COMPLETE → VERIFIED
> **Iterations:** Tracks implement→verify cycles (incremented by verify phase)
>
> - PENDING: Initial state, awaiting implementation
> - COMPLETE: All tasks implemented
> - VERIFIED: All checks passed
>
> **Approval Gate:** Implementation CANNOT proceed until `Approved: Yes`
> **Worktree:** Set at plan creation (from dispatcher). `Yes` uses git worktree isolation; `No` works directly on current branch (default)

## Summary

**Goal:** Create comprehensive README.md documentation for every module in the Lagless monorepo, enabling AI agents to understand architecture, responsibilities, public API, dependencies, and safety constraints of each library/app without reading source code.

**Architecture:** Each module gets a README.md following a consistent 12-section template. Documentation is written in English, covers the deterministic ECS framework stack from binary primitives up through game simulations and React frontends.

**Tech Stack:** Markdown documentation files only — no code changes.

## Scope

### In Scope

- README.md for each of the 11 modules: `libs/binary`, `libs/core`, `libs/math`, `libs/misc`, `libs/net-wire`, `libs/animate`, `libs/pixi-react`, `libs/react`, `circle-sumo/circle-sumo-simulation`, `circle-sumo/circle-sumo-game`, `tools/codegen`
- Consistent 12-section template across all modules
- Dependency graph and module role descriptions
- AI-agent-friendly safety notes, invariants, gotchas

### Out of Scope

- Code changes or refactoring
- Root-level monorepo README (can be added later)
- Test additions or modifications
- API documentation auto-generation tools

## Prerequisites

- None — documentation-only task, no environment setup needed

## Context for Implementer

> This section is critical for cross-session continuity.

- **Patterns to follow:** The template below must be applied consistently across all 11 modules. No deviation.
- **Conventions:** English language, GitHub-flavored Markdown, file paths relative to module root
- **Key files:** Each module's `src/index.ts` defines the public API surface. `package.json` defines dependencies.
- **Gotchas:**
  - `@lagless/deterministic-math` is a WASM module for cross-platform deterministic trig/sqrt — MathOps wraps it
  - Components use SoA (Struct of Arrays) layout backed by a single ArrayBuffer — not traditional JS objects
  - The codegen tool reads YAML schema and generates TypeScript classes for components/singletons/filters/inputs
  - `Mem` is the single-ArrayBuffer deterministic world state — snapshot = `arrayBuffer.slice(0)`, rollback = overwrite bytes
- **Domain context:** Lagless is a client-side deterministic ECS framework for multiplayer games with rollback netcode. All game state lives in a single ArrayBuffer. Systems must be pure functions of inputs + state. The relay server broadcasts inputs; clients simulate identically.
- **Note on `tools/docs`:** The root `package.json` has `docs:verify` and `docs:inventory` scripts referencing `tools/docs/`, but this directory does not exist yet. Those scripts are planned but not created. Ignore these references — verification is done manually via template section checks.

### README Template (12 sections)

Every README.md must follow this exact structure:

```
# @lagless/<name>

## 1. Responsibility & Context
What this module does, why it exists, one paragraph.

## 2. Architecture Role
Where this module sits in the dependency graph. Upstream/downstream.

## 3. Public API
Exported classes, functions, types with one-line descriptions.

## 4. Preconditions
What must be true before using this module (init calls, config, etc.).

## 5. Postconditions
What is guaranteed after correct usage.

## 6. Invariants & Constraints
Rules that must hold at all times (determinism, byte order, etc.).

## 7. Safety Notes (AI Agent)
Things an AI agent MUST NOT do when modifying this module.

## 8. Usage Examples
Minimal code showing typical usage patterns.

## 9. Testing Guidance (optional — skip if no tests exist)
How to run tests, what framework, existing test patterns.

## 10. Change Checklist
Steps to follow when modifying this module.

## 11. Integration Notes (optional — skip for standalone tools)
How this module connects with others, common integration patterns.

## 12. Appendix (optional — include for modules with complex layouts/protocols)
Memory layout diagrams, protocol tables, schema references.
Include when: binary layouts (binary, core), protocol specs (net-wire),
schema files (codegen, simulation), component/system lists (simulation).
```

### Public API Description Format

Each export in section 3 must include: (1) TypeScript signature or parameter types, (2) one-sentence purpose, (3) key constraints if any. Example:

```
- `align8(byteOffset: number): number` — Round up to next 8-byte boundary. Required before all struct allocations.
```

### Safety Notes: Common Mistakes Pattern

For modules where determinism matters (core, math, simulation), the Safety Notes section must include a "Common Mistakes" subsection showing what NOT to do:

```
### Common Mistakes
- **DO NOT** use `Math.random()`, `Date.now()`, or async I/O inside systems — causes desyncs
- **DO NOT** allocate JS objects in systems — breaks snapshot/rollback (use SoA arrays)
- **DO NOT** reorder systems — execution order is critical for determinism
```

### Verification Rule

Before documenting any module's Public API, first extract actual exports: `grep '^export' <module>/src/index.ts`. Only document what is actually exported. Internal files NOT re-exported from index.ts are implementation details — do not include in Public API.

### Module Dependency Graph (bottom-up)

```
@lagless/binary          ← foundation: typed arrays, binary schemas, MemoryTracker
@lagless/math            ← deterministic math (WASM sin/cos/sqrt/atan2), Vector2
@lagless/misc            ← utilities: SimulationClock, SnapshotHistory, RingBuffer, UUID
@lagless/core            ← ECS engine: Mem, ECSSimulation, ECSRunner, DI, input, signals
@lagless/net-wire        ← networking: binary protocol, ClockSync, InputDelayController
@lagless/animate         ← UI animation helpers (easing, requestAnimationFrame)
@lagless/pixi-react      ← Pixi.js React bindings (joystick, VFX)
@lagless/react           ← React auth/query utilities
tools/codegen            ← YAML→TypeScript code generator for ECS schemas
circle-sumo-simulation   ← game simulation: components, systems, signals for Circle Sumo
circle-sumo-game         ← React+Pixi.js frontend for Circle Sumo
```

## Progress Tracking

**MANDATORY: Update this checklist as tasks complete. Change `[ ]` to `[x]`.**

- [x] Task 1: libs/binary README.md
- [x] Task 2: libs/math README.md
- [x] Task 3: libs/misc README.md
- [x] Task 4: libs/core README.md
- [x] Task 5: libs/net-wire README.md
- [x] Task 6: libs/animate README.md
- [x] Task 7: libs/pixi-react README.md
- [x] Task 8: libs/react README.md
- [x] Task 9: tools/codegen README.md
- [x] Task 10: circle-sumo/circle-sumo-simulation README.md
- [x] Task 11: circle-sumo/circle-sumo-game README.md

**Total Tasks:** 11 | **Completed:** 11 | **Remaining:** 0

## Implementation Tasks

### Task 1: libs/binary README.md

**Objective:** Document the binary serialization library that underpins all ECS memory and network protocols.

**Dependencies:** None

**Files:**
- Create: `libs/binary/README.md`

**Key Decisions / Notes:**
- Exports: `FieldType`, `BinarySchema`, `BinarySchemaPackPipeline`, `BinarySchemaUnpackPipeline`, `InputBinarySchema`, `MemoryTracker`, `binaryRead`, `binaryWrite`, `align8`, `toFloat32`, `getFastHash`, `packBatchBuffers`, `unpackBatchBuffers`, type utilities
- Critical: always little-endian (`LE = true`), 8-byte alignment via `align8()`
- `MemoryTracker` tracks byte offsets during ArrayBuffer initialization
- `BinarySchema` is type-safe pack/unpack for fixed-layout binary structs
- `InputBinarySchema` handles variable-length input batch serialization with ordinal

**Definition of Done:**
- [ ] README.md exists at `libs/binary/README.md`
- [ ] All applicable template sections present with non-empty content
- [ ] All exported symbols documented in Public API section
- [ ] Little-endian invariant and alignment rules in Invariants section
- [ ] Memory layout diagram in Appendix

**Verify:**
- `test -f libs/binary/README.md` — file exists
- `grep -c "^## " libs/binary/README.md` — 10+ sections present

### Task 2: libs/math README.md

**Objective:** Document deterministic math and Vector2 library.

**Dependencies:** None

**Files:**
- Create: `libs/math/README.md`

**Key Decisions / Notes:**
- `MathOps` wraps `@lagless/deterministic-math` WASM module for `sin`, `cos`, `atan2`, `sqrt`
- `MathOps.init()` must be called before use (async WASM init)
- `Vector2` uses deterministic math ops internally — `length()` uses `MathOps.sqrt()`
- `Vector2` provides `InPlace`, `ToRef`, `ToNew` variants to control allocation
- `Vector2Buffers` in `vector2-buffers.ts` for TypedArray-backed vector operations

**Definition of Done:**
- [ ] README.md exists at `libs/math/README.md`
- [ ] All applicable template sections present with non-empty content
- [ ] WASM init precondition documented
- [ ] `toFloat32()` determinism note (use for cross-platform float consistency)
- [ ] Vector2 allocation patterns documented

**Verify:**
- `test -f libs/math/README.md` — file exists
- `grep -c "^## " libs/math/README.md` — 10+ sections present

### Task 3: libs/misc README.md

**Objective:** Document utility library used by core and net-wire.

**Dependencies:** None

**Files:**
- Create: `libs/misc/README.md`

**Key Decisions / Notes:**
- `SimulationClock` — manages game time accumulation with `PhaseNudger` for server sync
- `SnapshotHistory` — stores snapshots by tick for rollback, has `getNearest(tick)` and `rollback(tick)`
- `RingBuffer` — fixed-size circular buffer
- `now()` — `performance.now()` wrapper
- `UUID` — UUID generation with masked bot detection (`generateMasked()`, `isMaskedUint8()`)
- `transform2d-utils` — helper for interpolating Transform2d between ticks

**Definition of Done:**
- [ ] README.md exists at `libs/misc/README.md`
- [ ] All applicable template sections present with non-empty content
- [ ] Each utility class documented with purpose and API
- [ ] UUID masking scheme for bots documented

**Verify:**
- `test -f libs/misc/README.md` — file exists
- `grep -c "^## " libs/misc/README.md` — 10+ sections present

### Task 4: libs/core README.md

**Objective:** Document the ECS engine core — the central library of the framework.

**Dependencies:** Task 1, Task 2, Task 3 (for understanding upstream dependencies)

**Files:**
- Create: `libs/core/README.md`

**Key Decisions / Notes:**
- `Mem` — single ArrayBuffer world state with managers: TickManager, PRNGManager, ComponentsManager, SingletonsManager, FiltersManager, EntitiesManager, PlayerResourcesManager
- `ECSSimulation` — tick loop, rollback, snapshot storage, signal orchestration
- `ECSRunner` — abstract base class wiring DI, simulation, systems, signals
- `ECSConfig` — all simulation parameters (fps, maxEntities, snapshotRate, inputDelay, seed)
- DI: `Container` with `@ECSSystem()` and `@ECSSignal()` decorators
- Input: `AbstractInputProvider`, `InputRegistry`, `RPC`, `RPCHistory`
- Signals: `Signal<TData>` with Predicted/Verified/Cancelled emitters, rollback-safe
- Components use SoA in ArrayBuffer — `component.unsafe.fieldName[entityId]`
- Filters are bitmask-based entity iterators
- `Prefab` for entity creation with initial component values
- Types: `IECSSystem`, `IComponentConstructor`, `ISingletonConstructor`, `IFilterConstructor`, `ECSDeps`, `ECSSchema`

**Definition of Done:**
- [ ] README.md exists at `libs/core/README.md`
- [ ] All applicable template sections present with non-empty content
- [ ] Memory layout (single ArrayBuffer, manager order) documented
- [ ] DI pattern with `@ECSSystem()` decorator documented
- [ ] Signal lifecycle (Predicted → Verified/Cancelled) documented
- [ ] Rollback mechanics documented
- [ ] System registration order caveat documented
- [ ] Common Mistakes section in Safety Notes (Math.random, Date.now, async in systems, etc.)

**Verify:**
- `test -f libs/core/README.md` — file exists
- `grep -c "^## " libs/core/README.md` — 10+ sections present

### Task 5: libs/net-wire README.md

**Objective:** Document networking protocol, clock sync, and input delay controller.

**Dependencies:** Task 1 (binary schema understanding)

**Files:**
- Create: `libs/net-wire/README.md`

**Key Decisions / Notes:**
- Binary protocol structs: `HeaderStruct`, `ServerHelloStruct`, `TickInputStruct`, `TickInputFanoutStruct`, `CancelInputStruct`, `PingStruct`, `PongStruct`, `PlayerFinishedGameStruct`
- `MsgType` enum and `WireVersion`
- `ClockSync` — EWMA-based RTT/jitter/server-time-offset estimation with warmup phase
- `InputDelayController` — adaptive input delay: `deltaTicks = ceil((RTT/2 + k*JITTER + SAFETY) / TICK_MS) + 1`
- `RelayRoomOptions` — room configuration type
- `TickInputBuffer` — buffer for incoming tick inputs

**Definition of Done:**
- [ ] README.md exists at `libs/net-wire/README.md`
- [ ] All applicable template sections present with non-empty content
- [ ] Protocol message table with byte layouts in Appendix
- [ ] ClockSync warmup/EWMA phases documented
- [ ] InputDelayController formula documented

**Verify:**
- `test -f libs/net-wire/README.md` — file exists
- `grep -c "^## " libs/net-wire/README.md` — 10+ sections present

### Task 6: libs/animate README.md

**Objective:** Document the animation utility library.

**Dependencies:** None

**Files:**
- Create: `libs/animate/README.md`

**Key Decisions / Notes:**
- `animate()` — requestAnimationFrame-based animation with timing function
- `animatePromise()` — Promise wrapper for animate
- `AnimationCancelToken` — cancellation mechanism
- Built-in timing functions: `easing`, `easingInOut`, `linear`
- Browser-only (uses `requestAnimationFrame`)

**Definition of Done:**
- [ ] README.md exists at `libs/animate/README.md`
- [ ] All applicable template sections present with non-empty content
- [ ] Browser-only constraint in Safety Notes
- [ ] Usage example with easing and cancellation

**Verify:**
- `test -f libs/animate/README.md` — file exists
- `grep -c "^## " libs/animate/README.md` — 8+ sections present (no tests, no complex integration)

### Task 7: libs/pixi-react README.md

**Objective:** Document Pixi.js React integration components.

**Dependencies:** None

**Files:**
- Create: `libs/pixi-react/README.md`

**Key Decisions / Notes:**
- `VirtualJoystick` — touch/mouse joystick React component for game input
- `useVfxContainer` — hook for Neutrino particles VFX container
- Read source files: `virtual-joystick.tsx`, `virtual-joystick-ctx.ts`, `use-vfx-container.ts`

**Definition of Done:**
- [ ] README.md exists at `libs/pixi-react/README.md`
- [ ] All applicable template sections present with non-empty content
- [ ] Joystick API and VFX hook documented

**Verify:**
- `test -f libs/pixi-react/README.md` — file exists
- `grep -c "^## " libs/pixi-react/README.md` — 8+ sections present

### Task 8: libs/react README.md

**Objective:** Document React auth and query provider utilities.

**Dependencies:** None

**Files:**
- Create: `libs/react/README.md`

**Key Decisions / Notes:**
- Auth system: `api.ts` (HTTP client), `auth-token-store.ts` (JWT persistence), `auth.query.ts` (React Query hooks), `instance-auth.provider.tsx`
- `ReactQueryProvider` — wraps TanStack React Query
- Note: `auth.context.ts` is INTERNAL (not re-exported from index.ts) — do NOT document as public API
- Before writing, verify actual exports: `grep '^export' libs/react/src/index.ts`

**Definition of Done:**
- [ ] README.md exists at `libs/react/README.md`
- [ ] All applicable template sections present with non-empty content
- [ ] Auth flow documented (token store → provider → query hooks)
- [ ] React Query provider documented

**Verify:**
- `test -f libs/react/README.md` — file exists
- `grep -c "^## " libs/react/README.md` — 8+ sections present

### Task 9: tools/codegen README.md

**Objective:** Document the ECS code generation tool.

**Dependencies:** Task 4 (core types understanding)

**Files:**
- Create: `tools/codegen/README.md`

**Key Decisions / Notes:**
- Reads YAML schema (e.g., `ecs.yaml`) → generates TypeScript classes
- Parser: `parseYamlConfig()` → `ECSSchema` + `projectName`
- Generator: produces component, singleton, filter, input, playerResource classes + runner + core deps + input registry
- Template engine renders `.template` files from `files/` directory
- Nx generator integration via `nx-generator.ts`
- CLI entry point in `cli.ts`
- Component IDs are powers of 2 for bitmask filtering

**Definition of Done:**
- [ ] README.md exists at `tools/codegen/README.md`
- [ ] All applicable template sections present with non-empty content
- [ ] YAML schema format documented with example
- [ ] Generated file list documented
- [ ] Nx generator usage documented

**Verify:**
- `test -f tools/codegen/README.md` — file exists
- `grep -c "^## " tools/codegen/README.md` — 10+ sections present

### Task 10: circle-sumo/circle-sumo-simulation README.md

**Objective:** Document the Circle Sumo game simulation library.

**Dependencies:** Task 4 (core ECS understanding), Task 9 (codegen understanding)

**Files:**
- Create: `circle-sumo/circle-sumo-simulation/README.md`

**Key Decisions / Notes:**
- 13 systems in strict execution order (determinism depends on order)
- Components: Skin, Transform2d, Velocity2d, CircleBody, PendingImpulse, LastHit, LastAssist, Bot
- Singleton: GameState
- PlayerResource: PlayerResource (with 16-byte UUID id array)
- Inputs: PlayerJoined, PlayerLeft, Move, LookAt
- Filters: Transform2dFilter, PendingImpulseFilter, Velocity2dFilter, DampingFilter, SumoCharacterFilter, BotFilter
- Signals: GameOverSignal, HighImpactSignal, PlayerFinishedGameSignal
- Game logic: players, gameplay, map configuration
- Generated code lives in `src/lib/schema/code-gen/`
- CRITICAL: System execution order MUST be verified against `src/lib/systems/index.ts` — documented order must match exactly
- Include a "Common Mistakes" subsection in Safety Notes

**Definition of Done:**
- [ ] README.md exists at `circle-sumo/circle-sumo-simulation/README.md`
- [ ] All applicable template sections present with non-empty content
- [ ] System execution order documented AND verified against source code
- [ ] All components/singletons/inputs/filters listed
- [ ] Signal lifecycle documented
- [ ] ECS YAML schema reference in Appendix
- [ ] Common Mistakes section included

**Verify:**
- `test -f circle-sumo/circle-sumo-simulation/README.md` — file exists
- `grep -c "^## " circle-sumo/circle-sumo-simulation/README.md` — 10+ sections present

### Task 11: circle-sumo/circle-sumo-game README.md

**Objective:** Document the Circle Sumo React+Pixi.js game frontend.

**Dependencies:** Task 10 (simulation understanding)

**Files:**
- Create: `circle-sumo/circle-sumo-game/README.md`

**Key Decisions / Notes:**
- React app with React Router (screens: title, game, locker, roulette)
- Pixi.js for game rendering (arena, player views, VFX, direction arrows)
- Runner provider wires ECSRunner to React context
- Game view components: arena, player-view, HUD, game-over, impact VFX, countdown
- Custom Pixi filters (flow-stripe-noise, screen-space-noise)
- Viewport provider for camera/zoom
- Character preview components for UI
- Auth integration via `@lagless/react`
- Virtual joystick via `@lagless/pixi-react`

**Definition of Done:**
- [ ] README.md exists at `circle-sumo/circle-sumo-game/README.md`
- [ ] All applicable template sections present with non-empty content
- [ ] Screen/route structure documented
- [ ] Game view component tree documented
- [ ] Runner initialization flow documented

**Verify:**
- `test -f circle-sumo/circle-sumo-game/README.md` — file exists
- `grep -c "^## " circle-sumo/circle-sumo-game/README.md` — 10+ sections present

## Testing Strategy

- No automated test suite — documentation-only task
- Verification per task: file exists, all 12 template sections present with non-empty content, Public API section lists all exports from `src/index.ts`
- Template compliance: `grep -c "^## " <file>` must return 12 (one per section)
- Content check: each section header must be followed by at least one non-empty line

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Documentation becomes stale after code changes | Medium | Medium | Change Checklist section in each README reminds developers to update docs |
| AI agent misunderstands determinism constraints | High | High | Dedicated "Safety Notes (AI Agent)" section with explicit DO NOT rules |
| Missing undocumented internal details | Low | Low | Documentation based on actual source code reading, not assumptions |

## Open Questions

- None — task scope is clear

### Deferred Ideas

- Root-level monorepo README with architecture overview and quick-start guide
- Auto-generated API docs from TypeScript (tsdoc/typedoc)
- Interactive dependency graph visualization
