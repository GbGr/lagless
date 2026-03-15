# Recipes — Step-by-Step Cookbook

## Add a New Component

1. Edit `ecs.yaml`:
   ```yaml
   components:
     Health:
       current: uint16
       max: uint16
   ```
2. Run `pnpm codegen`
3. Import in systems: `import { Health } from '../code-gen/core.js';`
4. Add to constructor DI: `private readonly _health: Health`
5. Access data: `this._health.unsafe.current[entity]`

## Add a Tag Component

Tags have no fields — they only occupy a bitmask bit (zero memory per entity).

1. Edit `ecs.yaml`:
   ```yaml
   components:
     Frozen: {}
     Dead: {}
   ```
2. Run `pnpm codegen`
3. Use in systems:
   ```typescript
   // Add tag
   this._entities.addComponent(entity, Frozen);
   // Remove tag
   this._entities.removeComponent(entity, Frozen);
   // Check tag
   if (this._entities.hasComponent(entity, Frozen)) { ... }
   ```
4. Use in filters:
   ```yaml
   filters:
     ActivePlayerFilter:
       include: [Transform2d, PlayerBody]
       exclude: [Frozen, Dead]
   ```

## Add a New System

1. Create `systems/my-feature.system.ts`:
   ```typescript
   import { ECSSystem, IECSSystem } from '@lagless/core';
   import { Transform2d, PlayerFilter } from '../code-gen/core.js';

   @ECSSystem()
   export class MyFeatureSystem implements IECSSystem {
     constructor(
       private readonly _transform: Transform2d,
       private readonly _filter: PlayerFilter,
     ) {}

     update(tick: number): void {
       for (const entity of this._filter) {
         // your logic here
       }
     }
   }
   ```
2. Add to `systems/index.ts`:
   ```typescript
   import { MyFeatureSystem } from './my-feature.system.js';

   export const systems = [
     // ... existing systems
     MyFeatureSystem,  // add in correct execution order
     // ... hash verification last
   ];
   ```

## Add a New Input Type

1. Edit `ecs.yaml`:
   ```yaml
   inputs:
     ShootInput:
       targetX: float32
       targetY: float32
   ```
2. Run `pnpm codegen`
3. Send from client (in `runner-provider.tsx` drainInputs):
   ```typescript
   if (mouseClicked) {
     addRPC(ShootInput, { targetX: mouseWorldX, targetY: mouseWorldY });
   }
   ```
4. Read in system:
   ```typescript
   const rpcs = this._input.collectTickRPCs(tick, ShootInput);
   for (const rpc of rpcs) {
     const targetX = MathOps.clamp(finite(rpc.data.targetX), -1000, 1000);
     const targetY = MathOps.clamp(finite(rpc.data.targetY), -1000, 1000);
     // spawn projectile, etc.
   }
   ```

## Send String Data in RPCs (e.g. Username)

RPCs only support numeric fields. To send strings, use `uint8[N]` array fields with `encodeStringToUint8` / `decodeStringFromUint8`.

1. Edit `ecs.yaml`:
   ```yaml
   inputs:
     PlayerJoined:
       slot: uint8
       username: uint8[64]   # 64 bytes = 32 characters max
   ```
2. Run `pnpm codegen`
3. Encode on send (server hook):
   ```typescript
   import { encodeStringToUint8 } from '@lagless/binary';

   onPlayerJoin(ctx, player) {
     const { buffer } = encodeStringToUint8(player.username, 64);
     ctx.emitServerEvent(PlayerJoined, { slot: player.slot, username: buffer });
   }
   ```
4. Decode in system:
   ```typescript
   import { decodeStringFromUint8 } from '@lagless/binary';

   const rpcs = this._input.collectTickRPCs(tick, PlayerJoined);
   for (const rpc of rpcs) {
     const username = decodeStringFromUint8(rpc.data.username as Uint8Array);
   }
   ```

**Supports:** Latin, Cyrillic, CJK, Arabic, Greek. **No emoji** — replaced with `?`.

## Add a New Entity Type

1. Define components and filter in `ecs.yaml`:
   ```yaml
   components:
     Projectile:
       ownerSlot: uint8
       damage: uint16
       spawnTick: uint32
       lifetimeTicks: uint16
     Velocity2d:
       velocityX: float32
       velocityY: float32

   filters:
     ProjectileFilter:
       include: [Transform2d, Projectile, Velocity2d]
   ```
2. Run `pnpm codegen`
3. Create spawn logic in a system:
   ```typescript
   const entity = this._entities.createEntity();
   this._entities.addComponent(entity, Transform2d);
   this._entities.addComponent(entity, Projectile);
   this._entities.addComponent(entity, Velocity2d);

   this._transform.set(entity, {
     positionX: startX, positionY: startY,
     prevPositionX: startX, prevPositionY: startY,
   });
   this._projectile.set(entity, {
     ownerSlot: slot, damage: 10, spawnTick: tick, lifetimeTicks: 60,
   });
   ```
4. Create view component (see [06-rendering.md](06-rendering.md))
5. Add `<FilterViews filter={runner.Core.ProjectileFilter} View={ProjectileView} />`

## Add a Signal

1. Define in `signals/index.ts`:
   ```typescript
   @ECSSignal()
   export class ExplosionSignal extends Signal<{ x: number; y: number }> {}
   ```
2. Register in `arena.ts` signals array
3. Emit in system:
   ```typescript
   this._explosionSignal.emit(tick, { x: posX, y: posY });
   ```
4. Subscribe in view:
   ```typescript
   explosionSignal.Predicted.subscribe(e => spawnExplosionParticles(e.data.x, e.data.y));
   explosionSignal.Cancelled.subscribe(e => removeExplosionParticles());
   ```

## Add a New Screen

1. Create `screens/lobby.screen.tsx`:
   ```tsx
   export function LobbyScreen() {
     const navigate = useNavigate();
     return (
       <div>
         <h1>Lobby</h1>
         <button onClick={() => navigate('/game')}>Start</button>
       </div>
     );
   }
   ```
2. Add route in `router.tsx`:
   ```tsx
   <Route path="/lobby" element={<LobbyScreen />} />
   ```

## Add Bot AI

Bots are simulated as if they were players sending RPCs via server events.

1. Add bot management to server hooks:
   ```typescript
   // In game-hooks.ts:
   onRoomCreated: (ctx) => {
     // Schedule bot input every tick
     setInterval(() => {
       const botSlot = 1; // reserved for bot
       ctx.emitServerEvent(MoveInput, {
         directionX: calculateBotDirX(),
         directionY: calculateBotDirY(),
       }, botSlot);
     }, 50); // 20 ticks/sec
   },
   ```
2. Bot inputs flow through the same RPC system — no special handling in simulation

## Add Game Phases (Lobby → Playing → GameOver)

1. Add singleton in `ecs.yaml`:
   ```yaml
   singletons:
     GameState:
       gamePhase: uint8        # 0=lobby, 1=countdown, 2=playing, 3=gameover
       phaseStartTick: uint32
   ```
2. Create `game-phase.system.ts`:
   ```typescript
   @ECSSystem()
   export class GamePhaseSystem implements IECSSystem {
     constructor(
       private readonly _gameState: GameState,
       private readonly _config: ECSConfig,
     ) {}

     update(tick: number): void {
       const phase = this._gameState.gamePhase;
       const elapsed = tick - this._gameState.phaseStartTick;

       if (phase === 1 && elapsed > 60) { // 3 seconds at 20 tps
         this._gameState.gamePhase = 2;
         this._gameState.phaseStartTick = tick;
       }
       // ... more phase transitions
     }
   }
   ```

## Add Timer / Countdown

```typescript
@ECSSystem()
export class TimerSystem implements IECSSystem {
  constructor(
    private readonly _gameState: GameState,
    private readonly _config: ECSConfig,
  ) {}

  update(tick: number): void {
    const elapsed = tick - this._gameState.phaseStartTick;
    const elapsedSeconds = elapsed * this._config.frameLength;
    const remainingSeconds = Math.max(0, 120 - elapsedSeconds); // 2 minute timer

    if (remainingSeconds <= 0) {
      this._gameState.gamePhase = 3; // gameover
    }
  }
}
```

Display in React:
```tsx
const elapsed = runner.Simulation.tick - gameState.phaseStartTick;
const remaining = Math.max(0, 120 - elapsed / runner.Config.tickRate);
return <div>{Math.ceil(remaining)}s</div>;
```

## Add Score Tracking

1. Add to playerResources in `ecs.yaml`:
   ```yaml
   playerResources:
     PlayerResource:
       score: uint32
       kills: uint16
       deaths: uint16
   ```
2. Update in system:
   ```typescript
   this._playerResource.score[killerSlot] += 100;
   this._playerResource.kills[killerSlot] += 1;
   this._playerResource.deaths[victimSlot] += 1;
   ```
3. Read in view:
   ```tsx
   const score = runner.Core.PlayerResource.score[localSlot];
   ```

## Add Death / Respawn

```typescript
@ECSSystem()
export class DeathRespawnSystem implements IECSSystem {
  constructor(
    private readonly _entities: EntitiesManager,
    private readonly _transform: Transform2d,
    private readonly _playerBody: PlayerBody,
    private readonly _filter: PlayerFilter,
    private readonly _prng: PRNG,
  ) {}

  update(tick: number): void {
    for (const entity of this._filter) {
      if (this._playerBody.unsafe.health[entity] <= 0) {
        // Death: add Dead tag
        this._entities.addComponent(entity, Dead);

        // Schedule respawn: store death tick
        this._playerBody.unsafe.deathTick[entity] = tick;
      }
    }

    // Check for respawn
    for (const entity of this._deadFilter) {
      const deathTick = this._playerBody.unsafe.deathTick[entity];
      if (tick - deathTick >= 60) { // 3 seconds at 20 tps
        this._entities.removeComponent(entity, Dead);
        // Respawn at random position
        const x = this._prng.getRandomInt(-400, 400);
        const y = this._prng.getRandomInt(-300, 300);
        this._transform.set(entity, {
          positionX: x, positionY: y,
          prevPositionX: x, prevPositionY: y,
        });
        this._playerBody.unsafe.health[entity] = this._playerBody.unsafe.maxHealth[entity];
      }
    }
  }
}
```

## Add Projectile with Lifetime

```typescript
@ECSSystem()
export class ProjectileLifetimeSystem implements IECSSystem {
  constructor(
    private readonly _entities: EntitiesManager,
    private readonly _projectile: Projectile,
    private readonly _filter: ProjectileFilter,
  ) {}

  update(tick: number): void {
    for (const entity of this._filter) {
      const spawnTick = this._projectile.unsafe.spawnTick[entity];
      const lifetime = this._projectile.unsafe.lifetimeTicks[entity];

      if (tick - spawnTick >= lifetime) {
        this._entities.removeEntity(entity);
      }
    }
  }
}
```

## Add a Singleton

1. Edit `ecs.yaml`:
   ```yaml
   singletons:
     ArenaConfig:
       radius: float32
       shrinkRate: float32
   ```
2. Run `pnpm codegen`
3. Access in systems:
   ```typescript
   constructor(private readonly _arenaConfig: ArenaConfig) {}
   update(tick: number): void {
     const r = this._arenaConfig.radius;
     this._arenaConfig.radius -= this._arenaConfig.shrinkRate;
   }
   ```
<% if (simulationType === 'physics2d') { -%>

## Add Procedural 2D Map

1. **Install packages:**
   ```bash
   pnpm add @lagless/2d-map-generator @lagless/2d-map-renderer
   ```

2. **Define object types** in `simulation/src/lib/map-config/objects.ts`:
   ```typescript
   import type { MapObjectDef, MapObjectRegistry } from '@lagless/2d-map-generator';
   import { RenderLayer, ShapeType, CANOPY_SENSOR_TAG } from '@lagless/2d-map-generator';

   export enum ObjectType { Tree = 0 }

   const TREE: MapObjectDef = {
     typeId: ObjectType.Tree,
     colliders: [
       { shape: { type: ShapeType.Circle, radius: 30 } },
       { shape: { type: ShapeType.Circle, radius: 128 }, isSensor: true, tag: CANOPY_SENSOR_TAG },
     ],
     visuals: [
       { texture: 'tree-trunk', layer: RenderLayer.Ground },
       { texture: 'tree-foliage', layer: RenderLayer.Canopy },
     ],
     scaleRange: [0.1, 0.2],
     includeSensorsInBounds: true,
   };

   export const OBJECT_REGISTRY: MapObjectRegistry = new Map([[0, TREE]]);
   ```

3. **Create generator factory** in `simulation/src/lib/map-config/create-map-generator.ts`:
   ```typescript
   import { MapGenerator, BiomeFeature, ShoreFeature, GrassFeature,
     ObjectPlacementFeature, PlacementKind, TerrainZone, STANDARD_BIOME,
   } from '@lagless/2d-map-generator';
   import { OBJECT_REGISTRY, ObjectType } from './objects.js';

   export function createMapGenerator(): MapGenerator {
     return new MapGenerator({ baseWidth: 720, baseHeight: 720, scale: 1, extension: 80, gridSize: 16 })
       .addFeature(new BiomeFeature(), STANDARD_BIOME)
       .addFeature(new ShoreFeature(), { inset: 48, divisions: 12, variation: 4 })
       .addFeature(new GrassFeature(), { inset: 18, variation: 3 })
       .addFeature(new ObjectPlacementFeature(), {
         registry: OBJECT_REGISTRY,
         stages: [{ kind: PlacementKind.Density, typeId: ObjectType.Tree, density: 100, terrainZone: TerrainZone.Grass }],
       });
   }
   ```

4. **Extend runner** — generate map + create physics colliders in constructor, call `capturePreStartState()` after.

5. **Render** — use `MapTerrainRenderer` and `MapObjectRenderer` from `@lagless/2d-map-renderer`.

6. **Canopy transparency** — use `extractCanopyZones()` + `isInsideCanopyZone()` per frame.

> Full details: [docs/11-2d-map-generation.md](11-2d-map-generation.md)
<% } -%>
