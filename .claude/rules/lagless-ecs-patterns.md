# Lagless: ECS Patterns

**Last Updated:** 2026-03-07

## Codegen Workflow

1. Edit `ecs.yaml` in `<game>/<game>-simulation/src/lib/schema/`
2. Run: `pnpm exec nx g @lagless/codegen:ecs --configPath <path>/ecs.yaml`
3. Generated files in `code-gen/` — **never edit manually**

## YAML Schema Key Patterns

```yaml
simulationType: 'physics2d'  # Auto-prepends Transform2d (6 fields) + PhysicsRefs

components:
  MyComponent:
    field: float32

# Tag component (no fields — zero memory per entity, only a bitmask bit):
Frozen:

playerResources:
  PlayerResource:
    lastReportedHash: uint32
    lastReportedHashTick: uint32

inputs:
  MoveInput:
    directionX: float32
    directionY: float32
```

## System Pattern

```typescript
@ECSSystem()
export class MySystem implements IECSSystem {
  constructor(
    private readonly _transform: Transform2d,     // component accessor
    private readonly _myFilter: MyFilter,          // filter (entity list)
    private readonly _entities: EntitiesManager,   // create/remove entities
    private readonly _prng: PRNG,                  // deterministic RNG
    private readonly _singletons: MySingleton,     // global state
  ) {}

  update(tick: number): void {
    for (const entityId of this._myFilter.entities) {
      // read/write via component accessor
      this._transform.positionX[entityId] += 1;
    }
  }
}
```

- `@abraham/reflection` must be imported before any decorated class (app entry point)
- SWC required for decorator metadata — simulation libs use `bundler: swc`
- Systems receive DI-resolved dependencies — no manual instantiation

## Spawning Entities

```typescript
const entityId = this._entities.create([MyComponent.id, Transform2d.id]);
// ALWAYS set prev position equal to current to avoid one-frame interpolation jump:
this._transform.prevPositionX[entityId] = this._transform.positionX[entityId];
this._transform.prevPositionY[entityId] = this._transform.positionY[entityId];
this._transform.prevRotation[entityId] = this._transform.rotation[entityId];
```

## Filters

- Filters maintain live entity lists matching include/exclude component masks
- Defined in YAML: `filters: MyFilter: include: [MyComponent, Transform2d]`
- Filter data is in shared ArrayBuffer — restored automatically on rollback
- Access via `filter.entities` (array of entity IDs)

## Signal Pattern

```typescript
@ECSSignal()
export class MySignal extends AbstractSignal<MyData> {}

// In a system — emit predicted event:
this._mySignal.emit(tick, { ...data });

// In React component — subscribe:
const signal = runner.DIContainer.resolve(MySignal);
signal.Predicted.subscribe((e: SignalEvent<MyData>) => { ... });
signal.Verified.subscribe((e: SignalEvent<MyData>) => { ... });
signal.Cancelled.subscribe((e: SignalEvent<MyData>) => { ... });
```

## Vector2 Usage (avoid allocations in hot paths)

```typescript
import { VECTOR2_BUFFER_1, VECTOR2_BUFFER_2 } from '@lagless/math';

// Prefer ToRef/InPlace over ToNew in systems:
vec.addToRef(other, VECTOR2_BUFFER_1);   // result into pre-allocated buffer
vec.addInPlace(other);                    // mutate in place
```

## DI Container (extra registrations)

```typescript
// Inject custom data into runner:
new MapTestRunner(
  ecsConfig, inputProvider, Systems, Signals,
  rapier, physicsConfig, undefined,
  [[MapData, mapData]],  // extraRegistrations: [token, instance][]
);
```
