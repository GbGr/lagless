# Lagless: Physics Integration Patterns

**Last Updated:** 2026-03-09

## Libraries

- `@lagless/physics2d` — Rapier 2D (`@lagless/rapier2d-deterministic-compat`), zero gravity default, warm-starting disabled
- `@lagless/physics3d` — Rapier 3D (`@lagless/rapier3d-deterministic-compat`), CharacterController3D
- `@lagless/physics-shared` — shared base: `PhysicsSimulationBase`, `ColliderEntityMap`, `CollisionEventsBase`

**Always use `@lagless/rapier*-deterministic-compat` packages, never `@dimforge`.** The `@lagless` packages include a BVH snapshot determinism fix (parry#403) — without it, rollback causes BVH optimization state divergence.

## Pre-Start Body Creation (CRITICAL for rollback)

**Static bodies (terrain, walls, trees) must be created BEFORE calling `capturePreStartState()`:**

```typescript
// In runner-provider, AFTER runner construction, BEFORE start():
const wm = _runner.PhysicsWorldManager;

// Create static bodies...
for (const obj of placement.objects) {
  const bodyDesc = rapier.RigidBodyDesc.fixed().setTranslation(obj.posX, obj.posY);
  const body = wm.createBodyFromDesc(bodyDesc);
  const colliderDesc = rapier.ColliderDesc.ball(radius);
  wm.createColliderFromDesc(colliderDesc, body);
}

// Re-capture initial snapshot AFTER all pre-start bodies are created:
_runner.Simulation.capturePreStartState();

// THEN start:
_runner.start();
```

**Why:** `PhysicsSimulationBase` captures initial Rapier snapshot in constructor — BEFORE static bodies exist. Without `capturePreStartState()`, rollback to tick 0/1 restores a world without static bodies.

## Dynamic Body Creation (in ECS systems)

```typescript
// In a system that runs at a specific tick:
update(tick: number): void {
  if (tick === spawnTick && !this._spawned) {
    this._spawned = true;
    const bodyDesc = rapier.RigidBodyDesc.dynamic().setTranslation(x, y);
    const body = this._physicsWorldManager.createBodyFromDesc(bodyDesc);
    // Store handle in ECS component (PhysicsRefs.bodyHandle):
    this._physicsRefs.bodyHandle[entityId] = body.handle;
  }
}
```

- Dynamic bodies created during simulation are recreated on rollback via the re-simulation
- DO NOT create dynamic bodies outside the simulation loop

## Snapshot / Restore

- `PhysicsSimulationBase.rollback(tick)` restores BOTH ECS ArrayBuffer AND Rapier world in sync
- Rapier `world.takeSnapshot()` / `World.restoreSnapshot(data)` are bit-deterministic
- Rapier preserves timestep, handle allocator state, and solver state in snapshots
- `ColliderEntityMap` is rebuilt automatically after rollback via `wireColliderEntityMapRebuild`
- Default `snapshotRate` is 5 (saves snapshot every 5 ticks). On rollback, worst case re-simulates 4 extra ticks.
- `PhysicsWorldManager2d.restoreSnapshot()` re-applies `warmstartCoefficient` after every restore (restored world resets `integrationParameters` to defaults)

## PhysicsConfig2d

```typescript
const physicsConfig = new PhysicsConfig2d({
  gravityX: 0,
  gravityY: 0,
  // substeps: 1 (default)
  // warmstartCoefficient: 0 (default — disables warm-starting for determinism)
});
```

- `warmstartCoefficient` controls Rapier's solver warm-starting. Default `0` disables it entirely — solver always starts from zero impulses, eliminating divergence between clients with different rollback frequencies.
- For 2D top-down games without gravity stacking, warm-starting provides negligible benefit. Set to `1` only if your game needs fast solver convergence (e.g., heavy stacking scenarios) and you accept the desync risk.

## ColliderEntityMap

Maps Rapier collider handles → ECS entity IDs. Used in collision event processing.

```typescript
// Automatic — wired in PhysicsSimulationBase constructor:
wireColliderEntityMapRebuild(simulation, colliderEntityMap, physicsRefs);

// In collision event system — look up entity from collider handle:
const entityId = this._colliderEntityMap.get(colliderHandle);
```

## Collision Events

```typescript
@ECSSystem()
class CollisionSystem implements IECSSystem {
  constructor(private readonly _collisionEvents: CollisionEvents2d) {}

  update(tick: number): void {
    this._collisionEvents.drain((entityA, entityB, started) => {
      if (started) { /* collision began */ }
      else { /* collision ended */ }
    });
  }
}
```

## Physics-to-ECS Sync

Always sync Rapier body positions back to ECS Transform2d AFTER physics step:

```typescript
// PhysicsStepSystem runs after physics step:
for (const entityId of this._physicsFilter.entities) {
  const handle = this._physicsRefs.bodyHandle[entityId];
  const body = this._world.getRigidBody(handle);
  const pos = body.translation();
  this._transform.prevPositionX[entityId] = this._transform.positionX[entityId];
  this._transform.prevPositionY[entityId] = this._transform.positionY[entityId];
  this._transform.positionX[entityId] = pos.x;
  this._transform.positionY[entityId] = pos.y;
}
```

## WASM Initialization

```typescript
const RAPIER = (await import('@lagless/rapier2d-deterministic-compat')).default as any;
await RAPIER.init();
const rapier = RAPIER as unknown as RapierModule2d;
```

Must await before creating `PhysicsConfig2d` or any Rapier objects.

## Determinism Notes (verified by test suite)

- Rapier snapshot/restore IS bit-deterministic — handles, timestep, solver state all preserved
- Two independent simulations with identical setup produce identical snapshots at every tick
- Rollback + re-simulation produces identical state to never-rolled-back simulation
