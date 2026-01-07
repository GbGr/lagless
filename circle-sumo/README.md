# Circle Sumo - Lagless Demo Game

A multiplayer sumo-style arena game demonstrating the Lagless framework's capabilities.

## Overview

Circle Sumo is a physics-based arena game where players push each other off a circular platform. It showcases:

- ECS architecture with code generation
- Physics simulation (collision, impulse, damping)
- Input handling (movement, look direction)
- Bot AI
- Signal system for game events
- React/Pixi.js rendering

## Project Structure

```
circle-sumo/
├── circle-sumo-simulation/    # Game logic (shared)
│   └── src/lib/
│       ├── schema/
│       │   ├── ecs.yaml       # ECS schema definition
│       │   └── code-gen/      # Generated TypeScript
│       ├── systems/           # ECS systems
│       ├── signals/           # Game event signals
│       ├── map.ts             # Arena configuration
│       └── gameplay.ts        # Game flow utilities
│
└── circle-sumo-game/          # React/Pixi.js client
    └── src/
        ├── main.tsx           # Entry point
        ├── app.tsx            # Root component
        ├── screens/           # Game screens
        │   ├── title.screen.tsx
        │   ├── locker.screen.tsx
        │   ├── roulette.screen.tsx
        │   └── game.screen.tsx
        └── game-view/         # Game rendering
            ├── game-view.tsx
            ├── components/    # Pixi.js components
            └── filters/       # Visual effects
```

## Running the Demo

```bash
# Install dependencies
pnpm install

# Build simulation
pnpm nx build circle-sumo-simulation

# Run game client
pnpm nx serve circle-sumo-game
```

## Schema

The game's ECS schema (`ecs.yaml`):

### Components

| Component | Purpose | Fields |
|-----------|---------|--------|
| `Skin` | Visual appearance | skinId |
| `Transform2d` | Position & rotation | positionX/Y, rotation, prev* |
| `Velocity2d` | Physics velocity | velocityX/Y, angularVelocity |
| `CircleBody` | Circle collider | playerSlot, radius, mass, damping |
| `PendingImpulse` | Queued force | impulseX/Y |
| `LastHit` | Kill attribution | attackerEntity, atTick, impulse |
| `LastAssist` | Assist tracking | assisterEntity, atTick |
| `Bot` | AI state | nextDecisionTick, aggressiveness |

### Singletons

| Singleton | Purpose |
|-----------|---------|
| `GameState` | playerFinishedCount, startedAtTick, finishedAtTick |

### Player Resources

| Resource | Purpose |
|----------|---------|
| `PlayerResource` | id, mmr, entity, connected, kills, assists, mmrChange |

### Inputs

| Input | Fields | Purpose |
|-------|--------|---------|
| `PlayerJoined` | playerId, skinId, mmr | Player enters game |
| `PlayerLeft` | reason | Player disconnects |
| `Move` | direction, speed | Movement input |
| `LookAt` | direction | Rotation input |

### Filters

| Filter | Components |
|--------|------------|
| `Transform2dFilter` | Transform2d |
| `Velocity2dFilter` | Velocity2d, Transform2d |
| `DampingFilter` | Velocity2d, CircleBody |
| `SumoCharacterFilter` | Transform2d, Velocity2d, CircleBody |
| `BotFilter` | Bot, Transform2d, CircleBody |
| `PendingImpulseFilter` | PendingImpulse, Velocity2d, CircleBody |

## Systems

Systems execute in this order:

1. **Transform2dSystem** - Store previous positions for interpolation
2. **ApplyLookAtInputSystem** - Process rotation inputs
3. **ApplyMoveInputSystem** - Process movement inputs
4. **BotAISystem** - AI decision making
5. **ApplyImpulseSystem** - Apply queued forces
6. **IntegrateSystem** - Update positions from velocity
7. **DampingSystem** - Apply friction
8. **CollisionSystem** - Circle-circle collision response
9. **PlayerConnectionSystem** - Handle player joins
10. **PlayerLeaveSystem** - Handle player disconnects
11. **CheckPlayersInsideArenaSystem** - Ring-out detection
12. **FinishGameSystem** - Determine winner
13. **GameEventsSystem** - Emit game events

## Signals

| Signal | Data | Purpose |
|--------|------|---------|
| `GameOverSignal` | winner info | Game finished |
| `HighImpactSignal` | x, y, power | Strong collision for VFX |
| `PlayerFinishedGameSignal` | player, position | Player eliminated/won |

## Arena Configuration

```typescript
const CircleSumoArena = {
  radius: 512,           // Arena radius
  dangerStrokeWidth: 25, // Edge warning zone
  playerRadius: 40,      // Player collider size
};
```

## Game Flow

1. **Lobby** - Players join, bots fill remaining slots
2. **Countdown** - 200 ticks (~3.3 seconds) warmup
3. **Playing** - Push opponents off the platform
4. **Finished** - Last player standing wins

## Key Patterns Demonstrated

### Input Processing

```typescript
// ApplyMoveInputSystem
const rpcs = this._InputProvider.getTickRPCs(tick, Move);
for (const rpc of rpcs) {
  const entity = this.getPlayerEntity(rpc.meta.playerSlot);
  Vector2.fromAngleToRef(rpc.data.direction, VECTOR2_BUFFER_1, rpc.data.speed);
  this._Velocity.unsafe.velocityX[entity] = VECTOR2_BUFFER_1.x;
}
```

### Collision Detection

```typescript
// CollisionSystem - O(n²) circle-circle
for (let i = 0; i < count; i++) {
  for (let j = i + 1; j < count; j++) {
    const dx = posX[b] - posX[a];
    const dy = posY[b] - posY[a];
    const dist = Math.hypot(dx, dy);

    if (dist < radiusA + radiusB) {
      // Collision response...
    }
  }
}
```

### Prefab Usage

```typescript
// PlayerConnectionSystem
const playerPrefab = Prefab.create()
  .with(Transform2d)
  .with(Velocity2d)
  .with(Skin)
  .with(CircleBody, { radius: 40, mass: 1 });

const entity = this._EntitiesManager.createEntity(playerPrefab);
```

### Signal Emission

```typescript
// CollisionSystem
this._HighImpactSignal.emit(tick, {
  power: impulseMagnitude,
  x: collisionX,
  y: collisionY,
});
```

### Bot AI

```typescript
// BotAISystem - Simple decision making
if (tick >= bot.nextDecisionTick) {
  const target = findNearestOpponent();
  const direction = Math.atan2(target.y - my.y, target.x - my.x);
  // Queue move RPC...
}
```

## Client Architecture

### React Component Tree

```
App
├── ReactQueryProvider
├── InstanceAuthProvider
├── FtueProvider
├── AssetsLoader
└── RouterProvider
    ├── TitleScreen
    ├── LockerScreen
    ├── RouletteScreen
    └── GameScreen
        └── GameView
            ├── VirtualJoystickProvider
            ├── Viewport
            │   ├── Arena
            │   ├── PlayerViews
            │   └── ImpactVFX
            └── HUD
```

### Rendering with Pixi.js

```tsx
// PlayerView.tsx
function PlayerView({ entity, runner }) {
  const t = runner.Simulation.interpolationFactor;

  const x = MathOps.lerp(prevX, currX, t);
  const y = MathOps.lerp(prevY, currY, t);

  return (
    <Container x={x} y={y}>
      <PlayerSprite skinId={skinId} />
    </Container>
  );
}
```

### Input with Virtual Joystick

```tsx
function useJoystickInput() {
  const joystick = useVirtualJoystick();
  const inputProvider = useInputProvider();

  useEffect(() => {
    return joystick.onChange((state) => {
      if (state.power > 0.1) {
        inputProvider.drainInputs((add) => {
          add(Move, { direction: state.direction, speed: state.power });
        });
      }
    });
  }, []);
}
```

## Development

### Regenerate Code

After schema changes:

```bash
nx g @lagless/codegen:ecs --configPath circle-sumo/circle-sumo-simulation/src/lib/schema/ecs.yaml
```

### Add New System

1. Create `new.system.ts` in `systems/`
2. Implement `IECSSystem` with `@ECSSystem()` decorator
3. Add to `CircleSumoSystems` array in `systems/index.ts`

### Add New Component

1. Add to `ecs.yaml`
2. Run codegen
3. Update systems and filters as needed
