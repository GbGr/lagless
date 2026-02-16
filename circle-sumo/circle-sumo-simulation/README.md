# @lagless/circle-sumo-simulation

## 1. Responsibility & Context

Implements the Circle Sumo game simulation logic as a deterministic ECS (Entity Component System). Circle Sumo is a multiplayer last-one-standing arena game where players push each other out of a shrinking circular arena using physics-based collisions. This module contains all game rules, physics systems, bot AI, player scoring, and signal emissions for game events. Designed for deterministic client-side prediction with rollback netcode.

## 2. Architecture Role

**Upstream dependencies:** `@lagless/core`, `@lagless/math`, `@lagless/binary`, `@lagless/misc`
**Downstream consumers:** `circle-sumo-game` (React frontend that renders this simulation)

This simulation library is pure game logic with no rendering or UI concerns. It runs identically on all clients given the same inputs and PRNG seed. The frontend consumes this module to instantiate the ECS runner, subscribe to signals, and read entity state for rendering. Generated code lives in `src/lib/schema/code-gen/` (created by `@lagless/codegen` from `ecs.yaml`).

## 3. Public API

### Generated ECS Schema (from code-gen/)

**Components** (8 total):
- `Skin` — Visual skin ID for player character rendering
- `Transform2d` — Position (x, y) and rotation with previous frame state for interpolation
- `Velocity2d` — Linear velocity (x, y) and angular velocity for physics
- `CircleBody` — Physics properties: radius, mass, restitution, damping, player slot assignment
- `PendingImpulse` — Impulse to apply on next physics tick (from collisions or player input)
- `LastHit` — Tracking for kill credit: attacker entity, tick, impulse magnitude
- `LastAssist` — Tracking for assist credit: assister entity, tick
- `Bot` — AI state: last panic tick, next decision tick, aggressiveness parameter

**Singleton** (1 total):
- `GameState` — Global game state: player finished count, started tick, finished tick

**Player Resource** (1 total):
- `PlayerResource` — Per-player state: 16-byte UUID, MMR, entity ID, connection status, initial rotation, finish time, top position, kills, assists, MMR change, danger zone metrics

**Inputs** (4 total):
- `PlayerJoined` — New player connects: player ID (16-byte UUID), skin ID, MMR
- `PlayerLeft` — Player disconnects: reason code
- `Move` — Player movement: direction (radians), speed [0, 1]
- `LookAt` — Player look direction: direction (radians)

**Filters** (6 total):
- `Transform2dFilter` — Entities with Transform2d (all active entities)
- `PendingImpulseFilter` — Entities with pending impulse + velocity + physics body
- `Velocity2dFilter` — Entities with velocity + transform (moving entities)
- `DampingFilter` — Entities with velocity + circle body (physics damping)
- `SumoCharacterFilter` — Player characters: transform + velocity + circle body
- `BotFilter` — Bot-controlled players: bot AI + transform + circle body

**Runner**:
- `CircleSumoRunner` — ECS runner class extending `ECSRunner` with Circle Sumo schema and systems

**Input Registry**:
- `CircleSumoInputRegistry` — Maps input IDs (1-4) to input classes for deserialization

**Core Module**:
- `getECSSchema()` — Returns full ECS schema definition for this simulation

### Systems (13 total, strict execution order)

**CRITICAL:** Systems execute in this EXACT order every tick. Reordering breaks determinism.

1. **Transform2dSystem** — Copy current transform to previous (for interpolation), zero out pending impulses
2. **ApplyLookAtInputSystem** — Apply player look direction from LookAt inputs
3. **ApplyMoveInputSystem** — Apply player movement impulse from Move inputs
4. **BotAISystem** — Bot decision making: chase nearest player, flee from danger zone
5. **ApplyImpulseSystem** — Convert pending impulses to velocity changes (impulse / mass)
6. **IntegrateSystem** — Integrate velocity into position (`position += velocity * dt`)
7. **DampingSystem** — Apply linear and angular damping to slow down movement
8. **CollisionSystem** — Detect and resolve circle-circle collisions, track LastHit for kill credit
9. **PlayerConnectionSystem** — Handle PlayerJoined inputs: spawn player entity with components
10. **PlayerLeaveSystem** — Handle PlayerLeft inputs: despawn player entity
11. **CheckPlayersInsideArenaSystem** — Mark players outside arena as finished, track danger zone time
12. **FinishGameSystem** — End game when only 1 or 0 players remain, calculate MMR changes, emit GameOverSignal
13. **GameEventsSystem** — Emit HighImpactSignal for large collisions

### Signals (3 total)

- **`GameOverSignal`** — Emitted when game ends. Data: `{ data: number }` (placeholder field)
- **`HighImpactSignal`** — Emitted on high-impact collisions. Data: `{ power: number, x: number, y: number }`
- **`PlayerFinishedGameSignal`** — Emitted when a player leaves the arena. Data structure defined in signal file.

### Game Configuration

- **`CircleSumoArena`** — Arena constants: `radius: 512`, `dangerStrokeWidth: 25`, `playerRadius: 40`

### Player Skins & Presets

- **`PLAYER_PRESETS`** — Record of all available player skins (1,431 presets): Solid (27), Static (702), Dynamic (702)
- **`PatterType`** — Enum: `Solid`, `Static`, `Dynamic`
- **`PlayerPreset`** — Union type for skin patterns with color configurations
- **`SKINS_COUNT`** — Total number of skins available
- **`getRandomSkinId()`** — Get random skin ID from all presets
- **`spinRandomSkinId(ownedSkins: number[])`** — Gacha spin for new skin (10% chance for Dynamic, 90% for Solid/Static, excludes owned)
- **`isSolid(id)`, `isStatic(id)`, `isDynamic(id)`** — Type guard functions

### Gameplay & Scoring

- **`calculateScore(kills, assists, topPosition): number`** — Calculate score from game performance
  - Base participation: 10 points
  - Kills: 15 points each
  - Assists: 8 points each
  - Top 3 bonuses: 1st = +40, 2nd = +25, 3rd = +15
- **`getSpinCost(ownedSkinsCount): number`** — Calculate cost for skin gacha spin (increases with collection size)

### Types

- **`SumoPlayerData`** — Player metadata: `selectedSkinId?: number`

## 4. Preconditions

- **ECS runner initialized** with `CircleSumoRunner` and appropriate `ECSConfig` (tick rate, max entities, PRNG seed)
- **Player joins first** — At least one `PlayerJoined` input before game starts
- **Deterministic math initialized** — `MathOps.init()` called before simulation (from `@lagless/math`)
- **Input delay configured** — Input delay must account for network RTT + jitter (see `@lagless/net-wire`)
- **Arena configuration loaded** — Frontend must use `CircleSumoArena` constants for rendering to match simulation

## 5. Postconditions

- **Deterministic gameplay** — Same inputs + seed → identical simulation on all clients
- **Game ends when 1 or 0 players remain** — `GameState.finishedAtTick` set, `GameOverSignal` emitted
- **Player scores calculated** — Kills, assists, top position tracked in `PlayerResource`, final score computed
- **Signals emitted for all events** — Frontend can subscribe to `GameOverSignal`, `HighImpactSignal`, `PlayerFinishedGameSignal` for UI updates
- **Snapshots capturable** — Entire game state in single ArrayBuffer, supports rollback to any tick

## 6. Invariants & Constraints

- **System execution order MUST NOT change** — Order listed in Section 3 is critical for deterministic physics
- **All physics uses deterministic math** — `MathOps.sin`, `MathOps.cos`, `MathOps.sqrt`, `MathOps.atan2` from `@lagless/math` (WASM-based)
- **No JavaScript `Math.*` in systems** — Causes cross-platform desyncs (different CPUs produce different float results)
- **No `Date.now()` or `performance.now()` in systems** — Use `tick` and `SimulationClock` instead
- **No heap allocations in systems** — Systems operate on SoA arrays in the shared ArrayBuffer, not JS objects
- **Component bitmasks are immutable per entity** — Adding/removing components after spawn requires entity destruction and respawn
- **Player slot assignment is permanent** — Once assigned, a player's slot doesn't change until they disconnect
- **Kill credit window** — `LastHit` tracks attacker for a limited time; if player leaves arena within window, attacker gets kill credit
- **Arena boundary is circular** — Players outside `CircleSumoArena.radius` are marked finished
- **Collision resolution is deterministic** — Collision order determined by entity ID (lowest ID processed first)

## 7. Safety Notes (AI Agent)

### DO NOT

- **DO NOT** reorder systems in `CircleSumoSystems` array — breaks determinism and gameplay logic
- **DO NOT** use JavaScript `Math.random()`, `Math.sin()`, `Math.cos()`, etc. in systems — use `mem.prng.random()` and `MathOps.*` instead
- **DO NOT** use `Date.now()`, `performance.now()`, or async I/O in systems — causes desyncs
- **DO NOT** allocate JavaScript objects or arrays in systems — breaks snapshot/rollback (use TypedArray views from components)
- **DO NOT** modify `CircleSumoArena` constants without updating frontend rendering — causes visual/simulation mismatch
- **DO NOT** change component IDs in `ecs.yaml` — breaks save files and replays (component IDs are powers of 2 based on order)
- **DO NOT** remove or rename existing components/singletons/inputs — breaking change for clients
- **DO NOT** change PlayerResource field order or types — breaks network protocol

### Common Mistakes

- **Using `Math.random()` for bot AI** — Causes desyncs. Use `mem.prng.random()` instead, which is seeded and deterministic.
- **Adding debug logging with `console.log()` in hot loops** — Massive performance penalty. Use conditional logging or remove for production.
- **Forgetting to update `prevPositionX/Y/Rotation`** — Breaks interpolation in frontend. `Transform2dSystem` handles this automatically.
- **Assuming collision order** — Collisions process in entity ID order. Don't rely on spatial ordering.
- **Modifying components outside systems** — Always use systems for state changes to maintain rollback compatibility.
- **Not handling edge cases in bot AI** — Bots must check arena boundaries and other players' positions using deterministic math.

## 8. Usage Examples

### Basic Simulation Setup

```typescript
import { CircleSumoRunner, CircleSumoSystems, CircleSumoSignals } from '@lagless/circle-sumo-simulation';
import { ECSConfig } from '@lagless/core';
import { MathOps } from '@lagless/math';

// Initialize deterministic math FIRST
await MathOps.init();

// Configure simulation
const config: ECSConfig = {
  fps: 60,
  maxEntities: 512,
  snapshotStorageSize: 256,
  maxInputDelayTick: 3,
  seed: 123456789,
};

// Create runner
const runner = new CircleSumoRunner(config);

// Register systems (already included in runner)
runner.start();

// Tick simulation
runner.tick();
```

### Subscribing to Signals

```typescript
import { GameOverSignal, HighImpactSignal } from '@lagless/circle-sumo-simulation';

// Subscribe to game over
const gameOverSignal = runner.DIContainer.resolve(GameOverSignal);
gameOverSignal.Verified.subscribe((e) => {
  console.log('Game over!', e.data);
  // Show game over UI, display leaderboard
});

// Subscribe to high impacts for VFX
const highImpactSignal = runner.DIContainer.resolve(HighImpactSignal);
highImpactSignal.Predicted.subscribe((e) => {
  console.log(`High impact at (${e.data.x}, ${e.data.y}) with power ${e.data.power}`);
  // Spawn particle effect at collision point
});
```

### Adding Player Input

```typescript
import { Move, LookAt, PlayerJoined } from '@lagless/circle-sumo-simulation';

// Player joins
const joinInput = new PlayerJoined(runner.core.mem);
joinInput.safe.playerId.set([/* 16-byte UUID */]);
joinInput.safe.skinId = 42;
joinInput.safe.mmr = 1500;
runner.addInput(joinInput, 0); // player slot 0

// Player moves
const moveInput = new Move(runner.core.mem);
moveInput.safe.direction = 1.57; // 90 degrees (up)
moveInput.safe.speed = 1.0; // full speed
runner.addInput(moveInput, 0);

// Player looks
const lookInput = new LookAt(runner.core.mem);
lookInput.safe.direction = 0.0; // 0 degrees (right)
runner.addInput(lookInput, 0);
```

### Accessing Game State

```typescript
import { GameState, Transform2d, CircleBody } from '@lagless/circle-sumo-simulation';

// Read singleton state
const gameState = runner.core.mem.singletons.get(GameState);
const playersFinished = gameState.safe.playerFinishedCount;
const gameStartTick = gameState.safe.startedAtTick;

// Iterate over all players with transform
const transform2dFilter = runner.core.mem.filters.get(Transform2dFilter);
for (const entityId of transform2dFilter.entities) {
  const transform = runner.core.mem.components.get(Transform2d);
  const x = transform.unsafe.positionX[entityId];
  const y = transform.unsafe.positionY[entityId];
  const rotation = transform.unsafe.rotation[entityId];

  console.log(`Entity ${entityId} at (${x}, ${y}) rotation ${rotation}`);
}
```

### Bot AI Integration

```typescript
import { Bot } from '@lagless/circle-sumo-simulation';

// Check if entity is a bot
const botFilter = runner.core.mem.filters.get(BotFilter);
for (const entityId of botFilter.entities) {
  const bot = runner.core.mem.components.get(Bot);
  const aggressiveness = bot.unsafe.aggressiveness[entityId];

  // Bot AI runs in BotAISystem - no manual control needed
}
```

### Scoring After Game Ends

```typescript
import { calculateScore, PlayerResource } from '@lagless/circle-sumo-simulation';

// After GameOverSignal emitted
const playerResource = runner.core.mem.playerResources.get(PlayerResource);
for (let slot = 0; slot < runner.core.mem.maxPlayers; slot++) {
  const kills = playerResource.unsafe.kills[slot];
  const assists = playerResource.unsafe.assists[slot];
  const topPosition = playerResource.unsafe.positionInTop[slot];

  const score = calculateScore(kills, assists, topPosition);
  console.log(`Player ${slot}: ${score} points (${kills}K/${assists}A, #${topPosition})`);
}
```

## 9. Testing Guidance

No test suite currently exists for this module. When adding tests, consider:

- **Determinism tests:** Same inputs + seed → identical output across multiple runs
- **System order tests:** Verify changing system order produces different (incorrect) results
- **Collision tests:** Verify impulse transfer, LastHit tracking, kill credit assignment
- **Bot AI tests:** Verify bots make valid decisions (don't walk out of arena immediately)
- **Scoring tests:** Verify `calculateScore()` with various kill/assist/position combinations
- **Signal emission tests:** Verify GameOverSignal fires when last player finishes, HighImpactSignal on large collisions
- **Boundary tests:** Verify players outside arena radius are marked finished
- **Rollback tests:** Snapshot at tick N, advance to tick N+10, rollback to tick N, verify state matches snapshot
- **Integration tests:** Run full game simulation with multiple players, verify deterministic outcome

## 10. Change Checklist

When modifying this module:

1. **Changing system order:** Test extensively with real gameplay, verify all clients stay in sync
2. **Adding/removing components:** Regenerate code with `nx g @lagless/codegen:ecs --configPath ...`, update systems that depend on changed components
3. **Modifying `ecs.yaml`:** Regenerate code, test with existing save files/replays to ensure compatibility (or bump schema version)
4. **Adding new systems:** Insert in correct order (physics before collision, collision before player management, etc.), test determinism
5. **Changing arena constants:** Update `CircleSumoArena`, verify frontend rendering matches, test boundary conditions
6. **Modifying scoring formula:** Update `calculateScore()`, communicate changes to players (affects MMR/rewards)
7. **Adding new signals:** Define signal data interface, emit from appropriate system, subscribe in frontend
8. **Changing collision logic:** Test with slow-motion replays, verify impulse conservation, check kill credit assignment
9. **Updating bot AI:** Test against human players, verify bots don't trivially win or lose
10. **Breaking schema changes:** Bump version, provide migration path, invalidate old replays

## 11. Integration Notes

### With Frontend (circle-sumo-game)

1. Frontend imports `CircleSumoRunner` and instantiates with network-synced config (seed from server)
2. Frontend subscribes to signals for UI updates (game over screen, VFX, player finished notifications)
3. Frontend reads entity state every frame for rendering (Transform2d for positions, Skin for visuals)
4. Frontend sends player inputs via `runner.addInput()` with local player slot
5. Frontend receives remote inputs via network and adds them via `runner.addInput()`
6. Frontend uses `CircleSumoArena` constants to render arena boundaries matching simulation

### With Networking (net-wire)

1. Server broadcasts `PlayerJoined` inputs when players connect
2. Server broadcasts `Move` and `LookAt` inputs from all players every tick
3. Client applies input delay (from `InputDelayController`) before processing inputs
4. Client performs rollback when late inputs arrive
5. Client snapshots state at regular intervals (every N ticks) for efficient rollback
6. Server never runs simulation — clients simulate independently and stay in sync via determinism

### With Codegen

1. Edit `src/lib/schema/ecs.yaml` to define components/singletons/inputs/filters
2. Run `nx g @lagless/codegen:ecs --configPath circle-sumo/circle-sumo-simulation/src/lib/schema/ecs.yaml`
3. Generated code appears in `src/lib/schema/code-gen/`
4. Import generated classes in systems and main exports

## 12. Appendix

### System Execution Order (Verified against src/lib/systems/index.ts)

```typescript
export const CircleSumoSystems: IECSSystemConstructor[] = [
  Transform2dSystem,              // 1. Save previous transform state

  ApplyLookAtInputSystem,         // 2. Apply look direction
  ApplyMoveInputSystem,           // 3. Apply movement impulse
  BotAISystem,                    // 4. Bot decisions
  ApplyImpulseSystem,             // 5. Impulse → velocity
  IntegrateSystem,                // 6. Velocity → position
  DampingSystem,                  // 7. Apply damping
  CollisionSystem,                // 8. Detect/resolve collisions

  PlayerConnectionSystem,         // 9. Handle joins
  PlayerLeaveSystem,              // 10. Handle leaves
  CheckPlayersInsideArenaSystem,  // 11. Mark players outside arena
  FinishGameSystem,               // 12. End game, calculate scores
  GameEventsSystem,               // 13. Emit event signals
];
```

### ECS Schema Summary (from ecs.yaml)

| Category | Count | Examples |
|----------|-------|----------|
| Components | 8 | Skin, Transform2d, Velocity2d, CircleBody, PendingImpulse, LastHit, LastAssist, Bot |
| Singletons | 1 | GameState |
| PlayerResources | 1 | PlayerResource (with 16-byte UUID id) |
| Inputs | 4 | PlayerJoined, PlayerLeft, Move, LookAt |
| Filters | 6 | Transform2dFilter, PendingImpulseFilter, Velocity2dFilter, DampingFilter, SumoCharacterFilter, BotFilter |
| Signals | 3 | GameOverSignal, HighImpactSignal, PlayerFinishedGameSignal |

### Game Flow Diagram

```
1. Players connect → PlayerJoined inputs → PlayerConnectionSystem spawns entities
2. Game starts → startedAtTick set in GameState
3. Players send Move/LookAt inputs each tick
4. Systems process inputs → update velocities → integrate positions
5. CollisionSystem detects overlaps → applies impulses → tracks LastHit
6. CheckPlayersInsideArenaSystem marks players outside arena as finished
7. When 1 or 0 players remain → FinishGameSystem:
   - Sets finishedAtTick in GameState
   - Calculates final scores (kills × 15 + assists × 8 + position bonus)
   - Emits GameOverSignal
8. Frontend displays game over UI with leaderboard
```

### Arena Configuration

```typescript
export const CircleSumoArena = {
  radius: 512,              // Arena outer radius (pixels)
  dangerStrokeWidth: 25,    // Width of danger zone border
  playerRadius: 40,         // Player circle collision radius
};
```

**Danger zone:** Area between `radius - dangerStrokeWidth` and `radius`. Players in this zone have `isInDangerZone` flag set and `wasInDangerZoneTimes` incremented.

### Scoring Formula

```typescript
score = BASE_PARTICIPATION  // 10 points
      + kills × KILL_VALUE  // 15 points per kill
      + assists × ASSIST_VALUE  // 8 points per assist
      + positionBonus;  // 1st: +40, 2nd: +25, 3rd: +15
```

### Player Skin Distribution

| Type | Count | Description |
|------|-------|-------------|
| Solid | 27 | Single solid color (one per base color) |
| Static | 702 | Two-color static pattern (ordered pairs, colors ≠) |
| Dynamic | 702 | Two-color animated pattern (ordered pairs, colors ≠) |
| **Total** | **1,431** | All available skins |

Gacha spin odds:
- 90% chance: Solid or Static (excludes owned)
- 10% chance: Dynamic (excludes owned)

Cost increases with collection: `50 + floor((ownedCount / totalCount × 100)²)` points.
