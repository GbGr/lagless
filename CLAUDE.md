# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Development Commands

```bash
# Install dependencies
pnpm install

# Build a specific library
pnpm nx build @lagless/core

# Run tests for a library
pnpm nx test @lagless/core

# Run all checks (what CI runs)
pnpm nx run-many -t lint test build typecheck

# Run the Circle Sumo demo game
pnpm nx serve circle-sumo-game

# Generate ECS code from schema
nx g @lagless/codegen:ecs --configPath <path-to-schema.yaml>

# Documentation tools
pnpm docs:inventory    # Generate and sync metadata for docs
pnpm docs:verify       # Verify README files are complete
```

## Project Architecture

**Lagless** is a deterministic ECS (Entity Component System) framework for multiplayer games. The core principle: write game logic once, get multiplayer support automatically via snapshot/rollback netcode.

### Monorepo Structure (Nx + pnpm)

```
libs/
├── core/        # ECS engine, memory, DI, input, signals
├── binary/      # Binary serialization, typed arrays
├── math/        # Deterministic math, Vector2
├── misc/        # Ring buffers, snapshots, clock
├── animate/     # Animation utilities with easing
├── net-wire/    # Network protocol
├── pixi-react/  # Pixi.js React integration
└── react/       # React utilities, authentication

tools/
└── codegen/     # YAML → TypeScript code generator

circle-sumo/     # Complete demo game
├── circle-sumo-simulation/  # Game logic
└── circle-sumo-game/        # React/Pixi.js client
```

### Key Architectural Concepts

1. **Single ArrayBuffer State**: All game state lives in one `ArrayBuffer` enabling instant snapshots/rollback
2. **Structure of Arrays (SoA)**: Components store fields as separate typed arrays for cache efficiency
3. **Code Generation**: Game schema in YAML generates TypeScript classes (components, singletons, filters, inputs)
4. **Dependency Injection**: Systems receive dependencies via constructor with `@ECSSystem()` decorator

### Code Generation Pipeline

```
Schema (ecs.yaml) → nx g @lagless/codegen:ecs → Generated Classes → Systems → Runner
```

Schema location: `<project>/src/lib/schema/ecs.yaml`
Generated output: `<project>/src/lib/schema/code-gen/` (do not edit)

### System Execution

Systems run in exact order passed to the runner - order matters for determinism.

```typescript
@ECSSystem()
export class MySystem implements IECSSystem {
  constructor(
    private readonly _Component: Component,
    private readonly _Filter: Filter,
    private readonly _InputProvider: InputProvider,
  ) {}

  public update(tick: number): void {
    // Use unsafe accessors for performance
    for (const entity of this._Filter) {
      this._Component.unsafe.fieldX[entity] += 1;
    }
  }
}
```

## Important Conventions

- Use `unsafe` accessors in hot paths for performance (direct typed array access)
- Use static vector buffers (`VECTOR2_BUFFER_1`, etc.) to avoid allocations
- Use `PRNG` for any randomness in simulation (never `Math.random()`)
- Never edit generated files in `code-gen/` directories
- Process inputs via `this._InputProvider.getTickRPCs(tick, InputType)`

## Detailed AI Guidance

See [AGENTS.md](./AGENTS.md) for comprehensive framework documentation including:
- Schema definition guide with field types
- System writing patterns
- Entity management with prefabs
- Data access patterns (unsafe vs cursor)
- Signal system (Predicted/Verified/Cancelled)
- Input system
- Common patterns (interpolation, PRNG, vectors)
- DO's and DON'Ts

Module-specific guides are in each library's `AGENTS.md` file.
