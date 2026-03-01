# API Quick Reference

## Entity Management

```typescript
// Create entity
const entity = entities.createEntity();

// Remove entity (recycled to LIFO stack)
entities.removeEntity(entity);

// Add component to entity
entities.addComponent(entity, MyComponent);

// Remove component from entity
entities.removeComponent(entity, MyComponent);

// Check if entity has component
entities.hasComponent(entity, MyComponent); // boolean
```

## Component Access

```typescript
// Hot path — typed array access (fastest, use in system loops)
component.unsafe.fieldName[entity]          // read
component.unsafe.fieldName[entity] = value; // write

// Convenient — cursor (single entity, creates object)
const cursor = component.getCursor(entity);
cursor.fieldName;          // read
cursor.fieldName = value;  // write

// Bulk set — multiple fields at once
component.set(entity, { fieldA: 1, fieldB: 2 });
```

## Singletons

```typescript
// Direct property access
singleton.fieldName          // read
singleton.fieldName = value  // write
```

## Player Resources

```typescript
// Indexed by player slot (0 to maxPlayers-1)
playerResource.fieldName[slot]          // read
playerResource.fieldName[slot] = value  // write
```

## Filters

```typescript
// Iterate matching entities
for (const entity of filter) { ... }

// Entity count
filter.length

// Raw entity array
filter.entities  // number[]
```

## Input (RPCs)

```typescript
// Client side — send input (in drainInputs callback)
addRPC(InputClass, { field1: value1, field2: value2 });

// System side — read inputs for current tick
const rpcs = inputProvider.collectTickRPCs(tick, InputClass);
for (const rpc of rpcs) {
  rpc.meta.playerSlot  // which player (255 = server)
  rpc.meta.seq         // sequence number
  rpc.data.field1      // input data fields
}

// Get all RPCs at a tick (regardless of type)
const buffer = inputProvider.getFrameRPCBuffer(tick);
```

## Signals

```typescript
// Define
@ECSSignal()
class MySignal extends Signal<{ value: number }> {}

// Emit (in system)
signal.emit(tick, { value: 42 });

// Subscribe (in view)
signal.Predicted.subscribe(event => { ... });  // instant
signal.Verified.subscribe(event => { ... });   // permanent
signal.Cancelled.subscribe(event => { ... });  // rolled back

// Unsubscribe
const sub = signal.Predicted.subscribe(handler);
sub.unsubscribe();
```

## PRNG (Deterministic Random)

```typescript
prng.getFloat()                    // [0, 1)
prng.getRandomInt(from, to)        // [from, to) exclusive upper
prng.getRandomIntInclusive(from, to) // [from, to] inclusive upper
```

## MathOps (Deterministic Math)

```typescript
import { MathOps } from '@lagless/math';

await MathOps.init();              // must call before use

MathOps.sin(x)
MathOps.cos(x)
MathOps.tan(x)
MathOps.atan2(y, x)
MathOps.sqrt(x)
MathOps.pow(base, exp)
MathOps.log(x)
MathOps.exp(x)
MathOps.clamp(value, min, max)

// Safe JS Math (no MathOps needed):
Math.abs(x), Math.min(a,b), Math.max(a,b)
Math.floor(x), Math.ceil(x), Math.round(x), Math.trunc(x)
Math.sign(x), Math.fround(x)
```

## ECSConfig

```typescript
config.maxEntities    // default 1024
config.maxPlayers     // default 4
config.tickRate       // ticks per second (e.g., 20)
config.frameLength    // seconds per tick (e.g., 0.05)
config.snapshotRate   // ticks between snapshots
config.inputDelay     // default input delay ticks
```

## ECSSimulation

```typescript
simulation.tick                 // current tick number
simulation.interpolationFactor  // 0-1, for visual interpolation
simulation.clock.deltaTime      // render frame delta time
simulation.mem.buffer           // raw ArrayBuffer

// Hash tracking
simulation.enableHashTracking(interval);

// State transfer
simulation.applyExternalState(buffer, tick);

// Callbacks
simulation.onTick(callback);
simulation.onRollback(callback);
```

## ECSRunner

```typescript
runner.start()                  // begin simulation
runner.update(deltaTime)        // advance one frame
runner.dispose()                // cleanup

runner.Simulation               // ECSSimulation instance
runner.InputProviderInstance     // input provider
runner.DIContainer              // DI container
runner.Core                     // typed access to all ECS objects
```

## Prefabs

```typescript
import { Prefab } from '@lagless/core';

const entity = Prefab.create(entities)
  .with(ComponentA, { field: value })
  .with(ComponentB, { field: value })
  .build();
```

## VisualSmoother2d

```typescript
import { VisualSmoother2d } from '@lagless/misc';

const smoother = new VisualSmoother2d();

const pos = smoother.update(
  prevX, prevY,     // previous tick position
  currX, currY,     // current tick position
  interpFactor,     // 0-1 interpolation factor
  deltaTime,        // render frame dt
);
// pos.x, pos.y — smoothed position
```

## FilterViews (Pixi.js)

```tsx
import { FilterViews, filterView } from '@lagless/pixi-react';
import { RunnerTicker } from '@lagless/pixi-react';

// Auto-manage entity views
<FilterViews filter={runner.Core.MyFilter} View={MyView} />

// Define view
const MyView = filterView(
  ({ entity, runner }, ref) => <pixiContainer ref={ref} />,
  {
    onUpdate: ({ entity, runner }, container) => { ... },
    onDestroy: ({ entity, runner }, container) => { ... },
  },
);

// Connect simulation to Pixi render loop
<RunnerTicker runner={runner} />
```

## Relay (Multiplayer)

```typescript
// Client
import { RelayConnection } from '@lagless/relay-client';
const conn = new RelayConnection({ serverUrl, scope });
await conn.connect();

// Server
import { RelayGameServer } from '@lagless/relay-game-server';
const server = new RelayGameServer({ port, roomType, matchmaking });
server.start();

// Server hooks — ctx methods
ctx.emitServerEvent(InputClass, data);
ctx.getPlayers();
ctx.endMatch(results);
```

## Debug

```tsx
import { DebugPanel } from '@lagless/react';

<DebugPanel runner={runner} hashVerification={true} />
// Toggle with F3
```
