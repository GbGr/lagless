# @lagless/core

## 1. Responsibility & Context

Provides the core Entity-Component-System (ECS) engine for deterministic multiplayer games with rollback netcode. Manages all game state in a single ArrayBuffer, orchestrates simulation ticks with snapshot/rollback, implements a dependency injection container for systems and signals, and provides input handling with prediction/verification. This is the central library of the Lagless framework — all game logic is built on top of this ECS foundation.

## 2. Architecture Role

**Foundation layer** — sits above `@lagless/binary`, `@lagless/math`, and `@lagless/misc`. The core ECS engine that all game simulations depend on.

**Downstream consumers:**
- `circle-sumo-simulation` — Implements game-specific components, systems, and logic using the core ECS abstractions
- Game-specific runners — Extend `ECSRunner` to wire up custom game logic

**Upstream dependencies:**
- `@lagless/binary` — Binary serialization and memory layout (MemoryTracker, TypedArray schemas)
- `@lagless/math` — Deterministic math operations (MathOps.clamp01 for interpolation)
- `@lagless/misc` — SimulationClock, SnapshotHistory, PRNG, UUID

## 3. Public API

### Core Classes

#### Mem

Single ArrayBuffer containing all game state. Manages 7 memory regions via specialized managers:

```typescript
class Mem {
  readonly tickManager: TickManager;                     // Current tick counter
  readonly prngManager: PRNGManager;                      // Deterministic PRNG with seed
  readonly componentsManager: ComponentsManager;          // All ECS components (SoA layout)
  readonly singletonsManager: SingletonsManager;          // Global state singletons
  readonly filtersManager: FiltersManager;                // Entity filters (bitmask-based)
  readonly entitiesManager: EntitiesManager;              // Entity lifecycle (create/destroy)
  readonly playerResourcesManager: PlayerResourcesManager; // Per-player resources

  constructor(config: ECSConfig, deps: ECSDeps);

  exportSnapshot(): ArrayBuffer;                 // Clone ArrayBuffer (for snapshot storage)
  applySnapshot(arrayBuffer: ArrayBuffer): void; // Overwrite ArrayBuffer (for rollback)
  getHash(): number;                              // Hash entire ArrayBuffer (for debugging desyncs)
}
```

**Key behavior:**
- All managers write to the same ArrayBuffer in strict order (deterministic layout)
- Components stored as SoA (Struct of Arrays) — e.g., `component.unsafe.positionX[entityId]`
- Snapshot = `arrayBuffer.slice(0)`, Rollback = overwrite bytes

#### ECSSimulation

Manages the simulation loop: tick accumulation, snapshot storage, rollback, input processing, and signal orchestration.

```typescript
class ECSSimulation {
  readonly mem: Mem;                          // Game state
  readonly clock: SimulationClock;            // Time accumulation with PhaseNudger

  get tick(): number;                         // Current simulation tick
  get interpolationFactor(): number;          // [0, 1] for smooth rendering between ticks

  constructor(config: ECSConfig, deps: ECSDeps, inputProvider: AbstractInputProvider);

  registerSystems(systems: IECSSystem[]): void; // Register systems (called once by ECSRunner)
  addTickHandler(handler: (tick: number) => void): () => void; // Subscribe to tick events
  start(): void;                               // Start simulation clock
  update(dt: number): void;                    // Main loop: check rollback, simulate ticks, update interpolation
}
```

**Simulation flow:**
1. `update(dt)` — Advances `clock.accumulatedTime` by dt
2. Check for rollback (if input provider invalidates past ticks)
3. Simulate ticks from current tick to target tick
4. Each tick: run all systems in order, handle signals, save snapshot (if snapshotRate)
5. Update `interpolationFactor` for smooth rendering

#### ECSRunner

Abstract base class that wires together DI container, simulation, systems, and signals. Extend this to create game-specific runners.

```typescript
abstract class ECSRunner {
  readonly DIContainer: Container;              // DI container for systems/signals
  readonly Simulation: ECSSimulation;           // Simulation instance
  readonly Config: ECSConfig;                   // Configuration
  readonly InputProviderInstance: AbstractInputProvider; // Input handling

  protected constructor(
    config: ECSConfig,
    inputProvider: AbstractInputProvider,
    systems: IECSSystemConstructor[],
    signals?: ISignalConstructor[],
    deps: ECSDeps,
  );

  start(): void;                                // Start simulation
  update(dt: number): void;                     // Update simulation
  dispose(): void;                              // Clean up resources
}
```

**What it does:**
- Registers all components, singletons, filters, player resources with DI container
- Resolves all systems and signals via DI
- Registers systems with simulation
- Initializes signal registry

#### ECSConfig

Configuration for simulation parameters. All values have sensible defaults.

```typescript
class ECSConfig {
  readonly seed: RawSeed;                       // PRNG seed (16 bytes)
  readonly maxEntities: number;                 // Max entities (default: 1000)
  readonly maxPlayers: number;                  // Max players (default: 6)
  readonly initialInputDelayTick: number;       // Starting input delay (default: 2)
  readonly minInputDelayTick: number;           // Min delay (default: 1)
  readonly maxInputDelayTick: number;           // Max delay (default: 8)
  readonly fps: number;                         // Target FPS (default: 60)
  readonly frameLength: number;                 // Frame duration in ms (1000/fps)
  readonly snapshotRate: number;                // Save snapshot every N ticks (default: 5)
  readonly snapshotHistorySize: number;         // Max snapshots stored (default: 100)
  readonly maxNudgePerFrame: number;            // Max time correction per frame (default: frameLength/4)

  constructor(options?: Partial<ECSConfig>);
}

type RawSeed = [number, ...number[]]; // 16-element array for 128-bit PRNG seed
```

#### Prefab

Builder pattern for creating entities with initial component values.

```typescript
class Prefab {
  static create(): Prefab;                      // Create new prefab builder

  with<T extends IComponentConstructor>(
    Component: T,
    values?: Partial<ComponentValues<T['schema']>>
  ): Prefab;                                     // Add component with optional initial values

  [Symbol.iterator](): IterableIterator<...>;   // Iterate component assignments
}
```

**Usage:**
```typescript
const playerPrefab = Prefab.create()
  .with(Transform2d, { positionX: 0, positionY: 0, rotation: 0 })
  .with(Velocity2d, { velocityX: 0, velocityY: 0 })
  .with(CircleBody, { radius: 10 });

const entityId = entitiesManager.createEntity(playerPrefab);
```

### Dependency Injection

#### Container

DI container for automatic dependency resolution. Systems and signals use `@ECSSystem()` and `@ECSSignal()` decorators for dependency injection.

```typescript
class Container {
  resolve<T>(cls: Token<T>): T;                 // Resolve class and its dependencies (cached as singleton)
  register<T>(cls: Token<T>, instance: T): void; // Register pre-created instance
}

type Token<T = any> = new (...args: any[]) => T; // Constructor type
```

#### Decorators

```typescript
function ECSSystem(...overrideDeps: Token[]): ClassDecorator;
function ECSSignal(...overrideDeps: Token[]): ClassDecorator;
```

**How it works:**
- Decorators use TypeScript metadata (`reflect-metadata`) to infer constructor dependencies
- Override deps explicitly if needed: `@ECSSystem(ComponentA, FilterB)`
- Container resolves dependencies recursively and caches instances

### Input System

#### AbstractInputProvider

Base class for input handling. Implementations: `LocalInputProvider` (client-side), `ReplayInputProvider` (for replays).

```typescript
abstract class AbstractInputProvider {
  abstract init(simulation: ECSSimulation): void;
  abstract update(): void;                       // Called after simulation ticks
  abstract getInvalidateRollbackTick(): number | undefined; // Return tick to rollback to if inputs changed
  abstract dispose(): void;
}
```

#### RPC (Remote Procedure Call)

Represents player input for a single tick.

```typescript
class RPC {
  tick: number;                                  // Tick this input applies to
  playerId: number;                              // Player who sent this input
  ordinal: number;                               // Input type ID
  data: ArrayBuffer;                             // Binary-encoded input data

  constructor(tick: number, playerId: number, ordinal: number, data: ArrayBuffer);
}
```

#### RPCHistory

Stores input history with efficient tick-based lookup.

```typescript
class RPCHistory {
  addRPC(rpc: RPC): void;                        // Add input to history
  getRPCsByTick(tick: number): RPC[];            // Get all inputs for a tick
  getRPCsByTickAndPlayer(tick: number, playerId: number): RPC[]; // Get player's inputs for tick
  clear(): void;                                 // Clear all history
  rollback(tick: number): void;                  // Remove inputs >= tick
}
```

#### InputRegistry

Maps input constructors to their ordinals and schemas.

```typescript
class InputRegistry {
  constructor(inputs: IInputConstructor[]);
  getByOrdinal(ordinal: number): IInputConstructor;
  getByConstructor(constructor: IInputConstructor): number; // Returns ordinal
}
```

### Signals

#### Signal<TData>

Event system with rollback-aware Predicted/Verified/Cancelled lifecycle. Systems emit signals, UI subscribes to Predicted/Verified/Cancelled events.

```typescript
abstract class Signal<TData = unknown> {
  readonly Predicted: EventEmitter<SignalEvent<TData>>;   // Emitted when signal first occurs
  readonly Verified: EventEmitter<SignalEvent<TData>>;    // Emitted after input delay confirms signal
  readonly Cancelled: EventEmitter<SignalEvent<TData>>;   // Emitted if rollback invalidates signal

  constructor(config: ECSConfig);

  emit(tick: number, data: TData): void;         // Emit signal from system
}

interface SignalEvent<TData> {
  tick: number;                                  // Tick when signal occurred
  data: TData;                                   // Signal payload
}
```

**Lifecycle:**
1. System emits signal at tick T → `Predicted` fires (UI shows immediate feedback)
2. At tick T + maxInputDelayTick → Check if signal still exists after rollback/replay
   - If yes → `Verified` fires (confirmed)
   - If no → `Cancelled` fires (was misprediction)

### Types

```typescript
// ECS Schema (generated by codegen tool)
interface ECSSchema {
  components: IComponentConstructor[];
  singletons: ISingletonConstructor[];
  filters: IFilterConstructor[];
  inputs: IInputConstructor[];
  playerResource: IPlayerResourceConstructor;
}

interface ECSDeps extends ECSSchema {}

// System interface
interface IECSSystem {
  run(dt: number): void;                         // Called every tick
}

interface IECSSystemConstructor {
  new (...args: any[]): IECSSystem;
  deps: Token[];                                 // Injected by @ECSSystem() decorator
}

// Component (SoA layout)
interface IComponentConstructor {
  name: string;
  ID: number;                                    // Power of 2 for bitmask filtering
  schema: Record<string, TypedArrayConstructor>; // Field name -> TypedArray constructor

  calculateSize(maxEntities: number, memTracker: MemoryTracker): void;
  new (maxEntities: number, buffer: ArrayBuffer, memTracker: MemoryTracker): IComponentInstance;
}

interface IComponentInstance {
  unsafe: Record<string, TypedArray>;            // Field name -> TypedArray (e.g., positionX[entityId])
}

// Singleton (single instance, not per-entity)
interface ISingletonConstructor {
  name: string;
  schema: Record<string, TypedArrayConstructor>;

  calculateSize(memTracker: MemoryTracker): void;
  new (buffer: ArrayBuffer, memTracker: MemoryTracker): ISingletonInstance;
}

interface ISingletonInstance {
  unsafe: Record<string, TypedArray>;            // Field name -> TypedArray (single element)
}

// Filter (entity iteration)
abstract class AbstractFilter implements Iterable<number> {
  [Symbol.iterator](): IterableIterator<number>; // Iterate entity IDs matching filter
}

interface IFilterConstructor {
  new (...args: any[]): AbstractFilter;
}

// Input (player commands)
interface IInputConstructor {
  ordinal: number;                               // Input type ID
  schema: Record<string, InputFieldDefinition>;  // Binary layout schema
  new (): IInputInstance;
}

interface IInputInstance {
  tick: number;
  playerId: number;
  [key: string]: any;                            // Input-specific fields
}

// Player Resource (per-player state, e.g., score)
interface IPlayerResourceConstructor {
  name: string;
  schema: Record<string, TypedArrayConstructor>;

  calculateSize(maxPlayers: number, memTracker: MemoryTracker): void;
  new (maxPlayers: number, buffer: ArrayBuffer, memTracker: MemoryTracker): IPlayerResourceInstance;
}

interface IPlayerResourceInstance {
  unsafe: Record<string, TypedArray>;            // Field name -> TypedArray[playerId]
}
```

### Managers (exported from Mem)

```typescript
class PRNGManager {
  readonly prng: PRNG;                           // Deterministic random number generator
}

class PRNG {
  next(): number;                                // [0, 1) uniform random
  nextInt(max: number): number;                  // [0, max) integer
  nextIntInRange(min: number, max: number): number; // [min, max) integer
}

class EntitiesManager {
  createEntity(prefab?: Prefab): number;         // Create entity, returns entityId
  destroyEntity(entityId: number): void;         // Destroy entity (deferred until end of tick)
  hasComponent(entityId: number, componentId: number): boolean;
}

class PlayerResourcesManager {
  readonly PlayerResources: IPlayerResourceInstance; // Access per-player resources
}
```

## 4. Preconditions

- **`await MathOps.init()` must be called before starting ECSRunner** — MathOps uses WASM and needs async initialization
- **Systems must be registered before calling `simulation.start()`** — Throws error if no systems registered
- **ECSRunner constructor requires valid `ECSDeps` schema** — Components/singletons/filters/inputs must be generated by codegen tool
- **Component IDs must be powers of 2** — Required for bitmask filtering (1, 2, 4, 8, 16, ...)
- **System execution order matters** — Systems run in the order passed to ECSRunner constructor

## 5. Postconditions

- After `simulation.start()`, `simulation.update(dt)` runs the tick loop until stopped
- After `mem.applySnapshot(snapshot)`, all game state reverts to the snapshot's tick
- After `simulation.update()`, `interpolationFactor` is in [0, 1] for smooth rendering
- Systems registered via `ECSRunner` are injected with all dependencies via `DIContainer`

## 6. Invariants & Constraints

- **Single ArrayBuffer constraint:** All game state MUST fit in the allocated ArrayBuffer. Exceeding this size is undefined behavior.
- **Determinism guarantee:** Given identical inputs and seed, simulation produces identical results across all platforms.
- **System execution order:** Systems MUST run in the same order every tick. Changing order breaks determinism.
- **Component SoA layout:** Components are stored as Struct of Arrays. Access via `component.unsafe.fieldName[entityId]`, NOT `component[entityId].fieldName`.
- **Entity destruction is deferred:** `destroyEntity()` marks entity for deletion, but actual cleanup happens at end of tick.
- **Signal Predicted→Verified/Cancelled flow:** Signals emitted at tick T are verified/cancelled at tick T + maxInputDelayTick.
- **Snapshot rate:** Snapshots are saved every `snapshotRate` ticks. Rollback finds nearest past snapshot.

## 7. Safety Notes (AI Agent)

### DO NOT

- **DO NOT use `Math.random()`, `Date.now()`, or async I/O inside systems** — This breaks determinism. Use `PRNG` for randomness.
- **DO NOT allocate JS objects inside systems** — Components are SoA arrays in ArrayBuffer. Allocating objects breaks snapshot/rollback.
- **DO NOT reorder systems** — Execution order is critical for determinism. Changing order causes desyncs.
- **DO NOT mutate component data outside of systems** — Systems are the only place game logic should run.
- **DO NOT access `component[entityId]`** — Components use SoA layout. Use `component.unsafe.fieldName[entityId]` instead.
- **DO NOT call `destroyEntity()` and then access the entity in the same tick** — Destruction is deferred until end of tick.
- **DO NOT modify `ECSConfig` after ECSRunner constructor** — Config is readonly and baked into managers during initialization.
- **DO NOT forget to register systems** — Simulation throws error if `start()` is called without systems.

### Common Mistakes

**Using non-deterministic APIs:**
```typescript
// ❌ WRONG
class MovementSystem {
  run() {
    const randomSpeed = Math.random() * 10; // ← NON-DETERMINISTIC
    entity.velocity = randomSpeed;
  }
}

// ✅ CORRECT
class MovementSystem {
  constructor(private prng: PRNG) {}
  run() {
    const randomSpeed = this.prng.next() * 10; // ← Deterministic PRNG
    entity.velocity = randomSpeed;
  }
}
```

**Allocating objects in systems:**
```typescript
// ❌ WRONG
class CollisionSystem {
  run() {
    const collisions = []; // ← JS object allocation breaks rollback
    for (const entity of filter) {
      collisions.push({ a: entity, b: other });
    }
  }
}

// ✅ CORRECT
class CollisionSystem {
  run() {
    // Store collision data in components (SoA arrays)
    for (const entity of filter) {
      component.unsafe.collidingWith[entity] = other;
    }
  }
}
```

**Accessing components incorrectly:**
```typescript
// ❌ WRONG
const position = transform2d[entityId]; // ← Components are NOT indexed by entity

// ✅ CORRECT
const positionX = transform2d.unsafe.positionX[entityId];
const positionY = transform2d.unsafe.positionY[entityId];
```

**Forgetting system order matters:**
```typescript
// ❌ WRONG - Order changed between sessions
const runner1 = new Runner(config, provider, [PhysicsSystem, MovementSystem], ...);
const runner2 = new Runner(config, provider, [MovementSystem, PhysicsSystem], ...); // ← DESYNC

// ✅ CORRECT - Same order always
const systemOrder = [MovementSystem, PhysicsSystem];
const runner = new Runner(config, provider, systemOrder, ...);
```

## 8. Usage Examples

### Creating an ECS Runner

```typescript
import { ECSRunner, ECSConfig, LocalInputProvider, MathOps } from '@lagless/core';
import { MyGameSchema } from './generated/schema'; // From codegen
import * as Systems from './systems';
import * as Signals from './signals';

class MyGameRunner extends ECSRunner {
  constructor() {
    const config = new ECSConfig({
      fps: 60,
      maxEntities: 500,
      maxPlayers: 4,
    });

    const inputProvider = new LocalInputProvider();

    const systems = [
      Systems.InputSystem,
      Systems.MovementSystem,
      Systems.PhysicsSystem,
      Systems.CollisionSystem,
      Systems.RenderSystem,
    ];

    const signals = [
      Signals.GameOverSignal,
      Signals.ScoreChangedSignal,
    ];

    super(config, inputProvider, systems, signals, MyGameSchema);
  }
}

// Usage
await MathOps.init(); // MUST call before ECS
const runner = new MyGameRunner();
runner.start();

// Game loop
requestAnimationFrame(function loop() {
  const dt = getDeltaTime();
  runner.update(dt);
  requestAnimationFrame(loop);
});
```

### Writing a System

```typescript
import { ECSSystem } from '@lagless/core';

@ECSSystem() // Decorator enables DI
export class MovementSystem {
  constructor(
    private transform2d: Transform2d,     // Component
    private velocity2d: Velocity2d,       // Component
    private filter: MovingEntitiesFilter  // Filter
  ) {}

  run(dt: number): void {
    for (const entityId of this.filter) {
      const vx = this.velocity2d.unsafe.velocityX[entityId];
      const vy = this.velocity2d.unsafe.velocityY[entityId];

      this.transform2d.unsafe.positionX[entityId] += vx * dt;
      this.transform2d.unsafe.positionY[entityId] += vy * dt;
    }
  }
}
```

### Using Signals

```typescript
import { Signal, ECSSignal } from '@lagless/core';

interface GameOverData {
  winnerId: number;
}

@ECSSignal()
export class GameOverSignal extends Signal<GameOverData> {}

// In a system: emit signal
class GameLogicSystem {
  constructor(
    private gameOver: GameOverSignal,
    private gameState: GameState
  ) {}

  run(): void {
    if (this.gameState.unsafe.playersLeft[0] === 1) {
      const tick = this.gameState.unsafe.currentTick[0];
      const winnerId = this.findLastPlayer();
      this.gameOver.emit(tick, { winnerId });
    }
  }
}

// In UI: subscribe to signal
gameOver.Predicted.on((event) => {
  console.log(`Game over! Winner: ${event.data.winnerId} (predicted)`);
  showGameOverScreen(event.data.winnerId);
});

gameOver.Verified.on((event) => {
  console.log(`Game over! Winner: ${event.data.winnerId} (verified)`);
});

gameOver.Cancelled.on((event) => {
  console.log(`Game over was mispredicted, hiding screen`);
  hideGameOverScreen();
});
```

### Creating Entities

```typescript
import { Prefab, EntitiesManager } from '@lagless/core';

class SpawnSystem {
  constructor(
    private entities: EntitiesManager,
    private transform2d: Transform2d,
    private circleBody: CircleBody
  ) {}

  spawnPlayer(x: number, y: number): number {
    const prefab = Prefab.create()
      .with(Transform2d, { positionX: x, positionY: y, rotation: 0 })
      .with(CircleBody, { radius: 10 });

    return this.entities.createEntity(prefab);
  }
}
```

### Snapshot and Rollback

```typescript
// ECSSimulation handles this automatically, but you can trigger manually:

// Save snapshot
const snapshot = simulation.mem.exportSnapshot();
snapshotHistory.set(currentTick, snapshot);

// Rollback to tick
const rollbackTick = 100;
const snapshot = snapshotHistory.getNearest(rollbackTick);
simulation.mem.applySnapshot(snapshot);
snapshotHistory.rollback(rollbackTick); // Clear snapshots >= tick

// Replay from rollbackTick to currentTick
while (sim.tick < currentTick) {
  sim.simulateTick();
}
```

## 9. Testing Guidance

**Framework:** Vitest (see `libs/core/src/lib/di/di.test.ts` for existing tests)

**Running tests:**
```bash
# From monorepo root
nx test core

# Or with direct runner
npm test -- libs/core
```

**Existing test patterns:**
- `di.test.ts` — DI Container dependency resolution, decorator tests

**When adding tests:**
- **Use deterministic seeds:** Pass explicit seed to `ECSConfig` for reproducible tests
- **Test system execution order:** Verify output doesn't change if systems run in wrong order (should catch non-determinism)
- **Test rollback:** Save snapshot, mutate state, restore snapshot, verify state is identical
- **Test signals:** Emit Predicted, rollback, verify Cancelled fires
- **Use `mem.getHash()` for desync detection:** Compare hashes between two simulations with same inputs

**Example test pattern:**
```typescript
import { describe, it, expect } from 'vitest';
import { ECSSimulation, ECSConfig, Mem } from '@lagless/core';

describe('ECSSimulation rollback', () => {
  it('should restore state after rollback', () => {
    const config = new ECSConfig({ seed: [1, 2, 3, ...] });
    const sim = new ECSSimulation(config, deps, inputProvider);

    // Save snapshot at tick 10
    sim.update(16.666 * 10);
    const snapshot = sim.mem.exportSnapshot();
    const hash1 = sim.mem.getHash();

    // Mutate state
    sim.update(16.666 * 5);
    expect(sim.mem.getHash()).not.toBe(hash1);

    // Rollback
    sim.mem.applySnapshot(snapshot);
    expect(sim.mem.getHash()).toBe(hash1);
  });
});
```

## 10. Change Checklist

When modifying this module:

1. **Verify determinism:** Test on multiple platforms (Windows/Mac/Linux, different browsers)
2. **Maintain system order:** Document any system ordering requirements
3. **Update schema generation:** If changing component/singleton/filter types, update codegen templates
4. **Test rollback:** Add tests for snapshot/rollback if changing Mem layout
5. **Check allocation:** Profile to ensure systems don't allocate JS objects
6. **Update this README:** Document new APIs in Public API section
7. **Preserve SoA layout:** Components MUST remain Struct of Arrays for snapshot/rollback to work
8. **DO NOT break DI:** Decorator changes must preserve backward compatibility with existing systems

## 11. Integration Notes

### Used By

- **`circle-sumo-simulation`:**
  - Extends `ECSRunner` to create `CircleSumoRunner`
  - Uses codegen to generate components (Transform2d, Velocity2d, CircleBody, etc.)
  - Systems implement game logic (movement, collision, scoring)
  - Signals for game events (GameOver, HighImpact, PlayerFinishedGame)

### Common Integration Patterns

**ECS Runner Setup:**
```typescript
import { ECSRunner, ECSConfig } from '@lagless/core';

export class MyGameRunner extends ECSRunner {
  constructor() {
    // 1. Configure simulation
    const config = new ECSConfig({ fps: 60, maxEntities: 1000 });

    // 2. Choose input provider
    const inputProvider = isReplay ? new ReplayInputProvider(replayData) : new LocalInputProvider();

    // 3. Define system execution order (CRITICAL for determinism)
    const systems = [
      InputProcessingSystem,    // Read player inputs
      MovementSystem,           // Update positions
      PhysicsSystem,            // Apply physics
      CollisionSystem,          // Detect collisions
      GameLogicSystem,          // Handle game rules
      DestructionSystem,        // Clean up destroyed entities
    ];

    // 4. Define signals
    const signals = [GameOverSignal, ScoreChangedSignal];

    // 5. Pass generated schema from codegen
    super(config, inputProvider, systems, signals, GeneratedSchema);
  }
}
```

**Rendering with Interpolation:**
```typescript
// In your render loop (runs at display refresh rate, e.g., 144 Hz)
function render() {
  const factor = runner.Simulation.interpolationFactor; // [0, 1]

  for (const entityId of visibleEntities) {
    const transform = getTransform2dComponent(entityId);

    // Interpolate between prev and current transform
    const result = interpolateTransform2dCursor(transform, factor);

    sprite.x = result.x;
    sprite.y = result.y;
    sprite.rotation = result.rotation;
  }

  requestAnimationFrame(render);
}
```

**Network Integration (with `@lagless/net-wire`):**
```typescript
import { ClockSync, InputDelayController } from '@lagless/net-wire';

// Setup
const clockSync = new ClockSync(...);
const runner = new MyGameRunner();

// When clock sync is ready
clockSync.on('ready', () => {
  runner.Simulation.clock.phaseNudger.activate();
});

// On tick input from server
connection.on('tickInput', (msg) => {
  const serverTick = msg.tick;
  const localTick = runner.Simulation.tick;

  // Nudge local clock to sync with server
  runner.Simulation.clock.phaseNudger.onServerTickHint(serverTick, localTick);

  // Add server input to input provider
  runner.InputProviderInstance.addServerInput(msg);
});
```

## 12. Appendix

### Memory Layout (Single ArrayBuffer)

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Single ArrayBuffer                          │
├─────────────────────────────────────────────────────────────────────┤
│ TickManager           │ 8 bytes: Uint32Array[1] for current tick   │
├─────────────────────────────────────────────────────────────────────┤
│ PRNGManager           │ 64 bytes: PRNG state (xoshiro256++)        │
├─────────────────────────────────────────────────────────────────────┤
│ ComponentsManager     │ N components × maxEntities × field sizes    │
│   - Component 1       │   - Field 1: TypedArray[maxEntities]       │
│   - Component 2       │   - Field 2: TypedArray[maxEntities]       │
│   - ...               │   - ...                                     │
├─────────────────────────────────────────────────────────────────────┤
│ SingletonsManager     │ M singletons × field sizes (1 instance)     │
│   - Singleton 1       │   - Field 1: TypedArray[1]                  │
│   - ...               │   - ...                                     │
├─────────────────────────────────────────────────────────────────────┤
│ FiltersManager        │ F filters × bitmask arrays                  │
│   - Filter 1          │   - Bitmask: Uint32Array[ceil(maxEntities/32)] │
│   - ...               │   - ...                                     │
├─────────────────────────────────────────────────────────────────────┤
│ EntitiesManager       │ Entity lifecycle tracking                   │
│   - Free list         │   - Uint32Array for free entity IDs         │
│   - Component masks   │   - Bitmask per entity                      │
├─────────────────────────────────────────────────────────────────────┤
│ PlayerResourcesManager│ Player resources × maxPlayers               │
│   - Resource Field 1  │   - TypedArray[maxPlayers]                  │
│   - ...               │   - ...                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Key points:**
- All managers write to the same ArrayBuffer sequentially
- Each manager calculates its size first, then writes at the correct offset
- `MemoryTracker` tracks current write position (ptr)
- Snapshot = `arrayBuffer.slice(0)` (clones entire buffer)
- Rollback = `new Uint8Array(dest).set(new Uint8Array(src))` (overwrites bytes)

### Component SoA Layout Example

**Component definition (from codegen):**
```typescript
class Transform2d {
  static ID = 1; // Power of 2
  static schema = {
    positionX: Float32Array,
    positionY: Float32Array,
    rotation: Float32Array,
    prevPositionX: Float32Array,
    prevPositionY: Float32Array,
    prevRotation: Float32Array,
  };

  constructor(maxEntities: number, buffer: ArrayBuffer, tracker: MemoryTracker) {
    const byteOffset = tracker.ptr;
    this.unsafe = {
      positionX: new Float32Array(buffer, byteOffset, maxEntities),
      positionY: new Float32Array(buffer, byteOffset + maxEntities * 4, maxEntities),
      rotation: new Float32Array(buffer, byteOffset + maxEntities * 8, maxEntities),
      // ... other fields
    };
    tracker.advance(maxEntities * 6 * 4); // 6 fields × 4 bytes
  }
}
```

**Memory layout (maxEntities = 1000):**
```
positionX:     [float, float, float, ...] (1000 floats = 4000 bytes)
positionY:     [float, float, float, ...] (1000 floats = 4000 bytes)
rotation:      [float, float, float, ...] (1000 floats = 4000 bytes)
prevPositionX: [float, float, float, ...] (1000 floats = 4000 bytes)
prevPositionY: [float, float, float, ...] (1000 floats = 4000 bytes)
prevRotation:  [float, float, float, ...] (1000 floats = 4000 bytes)
                                           ──────────────────────────
                                           Total: 24000 bytes
```

**Access pattern:**
```typescript
// Get entity 42's position
const x = transform2d.unsafe.positionX[42];
const y = transform2d.unsafe.positionY[42];

// Set entity 42's rotation
transform2d.unsafe.rotation[42] = MathOps.PI_HALF;
```

### Filter Bitmask System

Filters use bitmasks to efficiently iterate entities with specific components.

**Example:**
```typescript
// Filter definition (from codegen)
class MovingEntitiesFilter extends AbstractFilter {
  static requiredComponents = [Transform2d.ID, Velocity2d.ID];
  // requiredComponents = [1, 2] (powers of 2)
  // Bitmask = 1 | 2 = 3 (binary: 11)
}

// Entity component masks
entity[0] mask: 0000 (no components)
entity[1] mask: 0001 (Transform2d only)
entity[2] mask: 0011 (Transform2d + Velocity2d) ← matches filter
entity[3] mask: 0111 (Transform2d + Velocity2d + CircleBody) ← matches filter

// Iteration
for (const entityId of movingEntitiesFilter) {
  // Only entities 2 and 3 are visited
}
```

**Why powers of 2?**
- Component IDs are powers of 2: 1, 2, 4, 8, 16, 32, ...
- Bitmask operations: `mask & requiredMask === requiredMask` checks if entity has all required components
- Efficient: Single bitwise AND operation, no array lookups

### Signal Lifecycle Example

```
Tick 10: System emits GameOver signal
         → Predicted fires → UI shows "Game Over" screen
         → Signal added to _awaitingVerification[10]

Tick 11-17: Simulation continues...

Tick 18 (= 10 + maxInputDelayTick=8):
         → Check _pending[10] (signals still present after all inputs confirmed)
         → Signal exists in both pending and awaiting
         → Verified fires → "Game Over" is confirmed

Alternative scenario (rollback):
Tick 15: Late input arrives for tick 9 → Rollback to tick 9
Tick 9-17: Replay simulation with new inputs
Tick 10: GameOver signal NOT emitted this time (different outcome)
Tick 18: Check _pending[10]
         → Signal NOT in pending (was cancelled by rollback)
         → Cancelled fires → UI hides "Game Over" screen
```

### System Execution Order Example

**Correct order (deterministic):**
```
1. InputProcessingSystem   — Reads RPC inputs, updates player commands
2. MovementSystem          — Applies velocity to position
3. PhysicsSystem           — Applies gravity, friction
4. CollisionSystem         — Detects collisions, applies impulses
5. GameLogicSystem         — Checks win conditions, emits signals
6. DestructionSystem       — Destroys marked entities
```

**Why this order matters:**
- Movement must happen before collision detection (or collisions use stale positions)
- Physics must happen before collision (or impulses are applied twice)
- Destruction must be last (so systems don't access destroyed entities)

**Wrong order causes desyncs:**
```
Client A: [Movement, Collision, Physics] → Entity 5 at (10.5, 20.3)
Client B: [Movement, Physics, Collision] → Entity 5 at (10.7, 20.1) ← DESYNC
```

Even tiny differences (0.2 pixels) accumulate over time and cause divergence.
