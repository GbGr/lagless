# AGENTS.md - Circle Sumo Demo

AI coding guide for the Circle Sumo demo game.

## Project Purpose

Reference implementation demonstrating Lagless framework patterns:
- Complete ECS game with physics
- Code generation workflow
- Input handling
- Signal system
- React/Pixi.js rendering

## Two Packages

```
circle-sumo-simulation  # @lagless/circle-sumo-simulation
  - Game logic
  - Systems
  - Schema
  - Shared code

circle-sumo-game       # @lagless/circle-sumo-game
  - React client
  - Pixi.js rendering
  - UI screens
```

## Schema Reference

### ecs.yaml Location

```
circle-sumo/circle-sumo-simulation/src/lib/schema/ecs.yaml
```

### Regenerate Command

```bash
nx g @lagless/codegen:ecs --configPath circle-sumo/circle-sumo-simulation/src/lib/schema/ecs.yaml
```

## System Execution Order

```typescript
const CircleSumoSystems = [
  // Phase 1: Interpolation prep
  Transform2dSystem,

  // Phase 2: Input processing
  ApplyLookAtInputSystem,
  ApplyMoveInputSystem,
  BotAISystem,

  // Phase 3: Physics
  ApplyImpulseSystem,
  IntegrateSystem,
  DampingSystem,
  CollisionSystem,

  // Phase 4: Game logic
  PlayerConnectionSystem,
  PlayerLeaveSystem,
  CheckPlayersInsideArenaSystem,
  FinishGameSystem,

  // Phase 5: Events
  GameEventsSystem,
];
```

## Key File Locations

### Simulation

```
circle-sumo-simulation/src/lib/
├── schema/
│   ├── ecs.yaml                    # Schema definition
│   └── code-gen/                   # Generated code
│       ├── index.ts
│       ├── Transform2d.ts
│       ├── Move.ts
│       ├── CircleSumo.runner.ts
│       └── ...
├── systems/
│   ├── index.ts                    # System list
│   ├── apply-move-input.system.ts
│   ├── collision.system.ts
│   └── ...
├── signals/
│   ├── index.ts
│   ├── game-over.signal.ts
│   └── high-impact.signal.ts
├── map.ts                          # Arena config
└── players.ts                      # Skin presets
```

### Game Client

```
circle-sumo-game/src/
├── main.tsx                        # Entry
├── app.tsx                         # Root component
├── screens/
│   ├── game.screen.tsx
│   └── ...
└── game-view/
    ├── game-view.tsx               # Main render
    ├── runner-provider.tsx         # ECS context
    ├── viewport-provider.tsx       # Camera
    └── components/
        ├── player-view.tsx
        ├── arena.tsx
        └── ...
```

## Common Patterns

### Creating the Runner

```typescript
// In game.screen.tsx
const runner = useMemo(() => {
  const config = new ECSConfig({
    maxEntities: 100,
    maxPlayers: 6,
    fps: 60,
    seed: generateSeed(),
  });

  const inputRegistry = new CircleSumoInputRegistry();
  const inputProvider = new LocalInputProvider(config, inputRegistry);
  inputProvider.playerSlot = 0;

  return new CircleSumoRunner(
    config,
    inputProvider,
    CircleSumoSystems,
    CircleSumoSignals,
  );
}, []);
```

### Game Loop

```typescript
useEffect(() => {
  runner.start();

  let lastTime = performance.now();
  let running = true;

  function loop() {
    if (!running) return;

    const now = performance.now();
    const dt = now - lastTime;
    lastTime = now;

    runner.update(dt);
    requestAnimationFrame(loop);
  }

  loop();

  return () => {
    running = false;
    runner.dispose();
  };
}, [runner]);
```

### Processing Inputs in System

```typescript
@ECSSystem()
export class ApplyMoveInputSystem implements IECSSystem {
  constructor(
    private readonly _InputProvider: InputProvider,
    private readonly _Velocity: Velocity2d,
    private readonly _PlayerResources: PlayerResources,
    private readonly _GameState: GameState,
  ) {}

  public update(tick: number): void {
    // Guard: Don't process before game starts
    if (tick < this._GameState.safe.startedAtTick) return;

    const rpcs = this._InputProvider.getTickRPCs(tick, Move);

    for (const rpc of rpcs) {
      const playerResource = this._PlayerResources.get(
        PlayerResource,
        rpc.meta.playerSlot
      );
      const entity = playerResource.safe.entity;

      // Apply movement
      Vector2.fromAngleToRef(rpc.data.direction, VECTOR2_BUFFER_1, rpc.data.speed);
      this._Velocity.unsafe.velocityX[entity] = VECTOR2_BUFFER_1.x;
      this._Velocity.unsafe.velocityY[entity] = VECTOR2_BUFFER_1.y;
    }
  }
}
```

### Collision Detection

```typescript
@ECSSystem()
export class CollisionSystem implements IECSSystem {
  constructor(
    private readonly _Filter: SumoCharacterFilter,
    private readonly _Transform: Transform2d,
    private readonly _Velocity: Velocity2d,
    private readonly _CircleBody: CircleBody,
    private readonly _HighImpactSignal: HighImpactSignal,
  ) {}

  public update(tick: number): void {
    const entities: number[] = [];
    for (const e of this._Filter) entities.push(e);

    const posX = this._Transform.unsafe.positionX;
    const posY = this._Transform.unsafe.positionY;
    const radius = this._CircleBody.unsafe.radius;

    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const a = entities[i], b = entities[j];

        const dx = posX[b] - posX[a];
        const dy = posY[b] - posY[a];
        const dist = Math.hypot(dx, dy);
        const sumR = radius[a] + radius[b];

        if (dist < sumR) {
          // Collision response...
          this._HighImpactSignal.emit(tick, { x, y, power });
        }
      }
    }
  }
}
```

### Ring-Out Check

```typescript
@ECSSystem()
export class CheckPlayersInsideArenaSystem implements IECSSystem {
  public update(tick: number): void {
    for (const entity of this._Filter) {
      const x = this._Transform.unsafe.positionX[entity];
      const y = this._Transform.unsafe.positionY[entity];
      const dist = Math.hypot(x, y);

      if (dist > CircleSumoArena.radius) {
        // Player is out!
        this._PlayerFinishedSignal.emit(tick, { entity, position: ... });
      }
    }
  }
}
```

### Signal Subscription (React)

```tsx
function useHighImpactVFX() {
  const { runner } = useRunner();

  useEffect(() => {
    const signal = runner.DIContainer.resolve(HighImpactSignal);

    const unsub = signal.Predicted.on((event) => {
      spawnImpactParticle(event.data.x, event.data.y, event.data.power);
    });

    return unsub;
  }, [runner]);
}
```

### Interpolated Rendering

```tsx
function PlayerView({ entity }) {
  const { runner } = useRunner();
  const t = runner.Simulation.interpolationFactor;

  const transform = runner.DIContainer.resolve(Transform2d);

  const x = MathOps.lerp(
    transform.unsafe.prevPositionX[entity],
    transform.unsafe.positionX[entity],
    t
  );
  const y = MathOps.lerp(
    transform.unsafe.prevPositionY[entity],
    transform.unsafe.positionY[entity],
    t
  );

  return <Container x={x} y={y}>...</Container>;
}
```

## Adding Features

### New Component

1. Add to `ecs.yaml`:
   ```yaml
   components:
     Shield:
       active: uint8
       health: uint16
   ```
2. Regenerate
3. Add to filters if needed
4. Inject in systems

### New System

1. Create `shield.system.ts`
2. Implement `@ECSSystem()` class
3. Add to `CircleSumoSystems` array (order matters!)

### New Input

1. Add to `ecs.yaml`:
   ```yaml
   inputs:
     ActivateShield:
       # empty payload
   ```
2. Regenerate
3. Process in system

### New Signal

1. Create `shield-broken.signal.ts`
2. Add to `CircleSumoSignals` array
3. Inject and emit in system
4. Subscribe in UI

## Constants

```typescript
// map.ts
const CircleSumoArena = {
  radius: 512,           // World units
  dangerStrokeWidth: 25,
  playerRadius: 40,
};

// player-connection.system.ts
const START_GAME_DELAY_TICKS = 200;  // ~3.3 seconds
```

## DO's and DON'Ts

### DO

- Reference this demo when implementing new features
- Follow system ordering pattern
- Use filters for entity iteration
- Emit signals for UI events
- Store prev values for interpolation

### DON'T

- Put rendering logic in simulation package
- Skip the interpolation factor
- Forget to handle game phase guards
- Create entities in hot loops
