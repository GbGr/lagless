# Input System

## Architecture Overview

```
Client UI → drainInputs() → addRPC() → RPCHistory → WebSocket → Server
Server → relay to all clients → TickInputFanout → RPCHistory
System → collectTickRPCs(tick, InputClass) → process RPCs
```

1. **Client sends inputs** via `drainInputs` callback (called every frame)
2. **RPCs are scheduled** at `currentTick + inputDelay` ticks ahead
3. **Server relays** inputs to all connected clients
4. **Systems read RPCs** via `collectTickRPCs(tick, InputClass)` during simulation
5. **Rollback** occurs when remote inputs arrive for already-simulated ticks

## Client Side: drainInputs

The `drainInputs` callback is passed to the ECSRunner and called every frame. It receives the current tick and an `addRPC` function.

```typescript
// In runner-provider.tsx:
<RunnerProvider
  drainInputs={(tick, addRPC) => {
    // Read keyboard/joystick state
    const keys = getActiveKeys();
    let dirX = 0, dirY = 0;
    if (keys.has('ArrowLeft') || keys.has('a')) dirX -= 1;
    if (keys.has('ArrowRight') || keys.has('d')) dirX += 1;
    if (keys.has('ArrowUp') || keys.has('w')) dirY -= 1;
    if (keys.has('ArrowDown') || keys.has('s')) dirY += 1;

    // Send input RPC
    addRPC(MoveInput, { directionX: dirX, directionY: dirY });
  }}
/>
```

### When to Send RPCs

- **Every frame** for continuous inputs (movement) — even if direction is (0,0)
- **On action** for discrete inputs (shoot, use ability) — only when triggered
- **Batch** if multiple inputs happen same frame — each `addRPC()` creates a separate RPC

### Virtual Joystick

```typescript
import { VirtualJoystickProvider, useVirtualJoystick } from '@lagless/pixi-react';

// Wrap game view:
<VirtualJoystickProvider>
  <GameScene />
</VirtualJoystickProvider>

// In drainInputs:
const joystick = useVirtualJoystick();
drainInputs={(tick, addRPC) => {
  addRPC(MoveInput, {
    directionX: joystick.current.x,
    directionY: joystick.current.y,
  });
}}
```

## System Side: Reading RPCs

Systems read inputs via `AbstractInputProvider.collectTickRPCs()`:

```typescript
@ECSSystem()
export class ApplyMoveInputSystem implements IECSSystem {
  constructor(
    private readonly _input: AbstractInputProvider,
    private readonly _playerBody: PlayerBody,
    private readonly _velocity: Velocity2d,
    private readonly _filter: PlayerFilter,
  ) {}

  update(tick: number): void {
    const rpcs = this._input.collectTickRPCs(tick, MoveInput);
    for (const rpc of rpcs) {
      // rpc.meta — metadata
      const slot = rpc.meta.playerSlot;    // which player sent this
      const seq = rpc.meta.seq;            // sequence number

      // rpc.data — the input fields defined in YAML
      const dirX = rpc.data.directionX;
      const dirY = rpc.data.directionY;

      // Find and update the player's entity
      for (const entity of this._filter) {
        if (this._playerBody.unsafe.playerSlot[entity] !== slot) continue;
        this._velocity.unsafe.velocityX[entity] = dirX * speed;
        this._velocity.unsafe.velocityY[entity] = dirY * speed;
        break;
      }
    }
  }
}
```

### RPC Ordering

RPCs are deterministically ordered by `(playerSlot, ordinal, seq)`. This means:
- Same RPCs produce the same order regardless of network arrival order
- Multiple RPCs per tick from the same player are ordered by sequence number
- Different input types from the same player use ordinal for stable ordering

## Input Sanitization

**All RPC data must be treated as potentially malicious.** The binary layer validates message structure but NOT field values — NaN, Infinity, and out-of-range numbers pass through.

```typescript
// Helper: returns 0 for NaN/Infinity, value otherwise
const finite = (v: number): number => Number.isFinite(v) ? v : 0;

// In system:
update(tick: number): void {
  const rpcs = this._input.collectTickRPCs(tick, MoveInput);
  for (const rpc of rpcs) {
    // Step 1: Reject non-finite values
    let dirX = finite(rpc.data.directionX);
    let dirY = finite(rpc.data.directionY);

    // Step 2: Clamp to valid range
    dirX = MathOps.clamp(dirX, -1, 1);
    dirY = MathOps.clamp(dirY, -1, 1);

    // Now safe to use dirX, dirY
  }
}
```

### Why This Order Matters

```typescript
// WRONG — NaN passes through clamp
MathOps.clamp(NaN, -1, 1)  // → NaN (NOT -1 or 0!)

// CORRECT — check finite first
finite(NaN)                  // → 0
MathOps.clamp(0, -1, 1)     // → 0 ✓
```

### What to Validate

| Field Type | Validation |
|-----------|-----------|
| Direction vector (float32) | `finite()` → `clamp(-1, 1)` per component |
| Angle (float32) | `finite()` — any finite value valid for trig |
| Speed/power (float32) | `finite()` → `clamp(0, maxSpeed)` |
| Boolean (uint8) | Treat as `!= 0` — auto-masked to 0-255 by framework |
| Entity ID (uint32) | Verify entity exists before using |

## Server Events

Server events are RPCs emitted by the server (not by players). They represent authoritative game events.

### Emitting from Server Hooks

```typescript
// In game-hooks.ts:
const hooks: RoomHooks = {
  onPlayerJoin: (ctx, player) => {
    ctx.emitServerEvent(PlayerJoined, {
      slot: player.slot,
      playerId: player.id,
    });
  },
  onPlayerLeave: (ctx, player, reason) => {
    ctx.emitServerEvent(PlayerLeft, {
      slot: player.slot,
      reason,
    });
  },
};
```

### Reading Server Events in Systems

Server events are read the same way as player RPCs:

```typescript
const rpcs = this._input.collectTickRPCs(tick, PlayerJoined);
for (const rpc of rpcs) {
  const slot = rpc.data.slot;
  // Create entity for new player...
}
```

The key difference: server events have `rpc.meta.playerSlot === SERVER_SLOT` (255).

## Adding a New Input Type

1. **Schema** — Add to `ecs.yaml`:
   ```yaml
   inputs:
     ShootInput:
       targetX: float32
       targetY: float32
       power: float32
   ```

2. **Codegen** — Run `pnpm codegen`

3. **Send from client** — In `drainInputs`:
   ```typescript
   if (shootButtonPressed) {
     addRPC(ShootInput, { targetX: mouseX, targetY: mouseY, power: 1.0 });
   }
   ```

4. **Read in system** — Create or update a system:
   ```typescript
   const rpcs = this._input.collectTickRPCs(tick, ShootInput);
   for (const rpc of rpcs) {
     let targetX = finite(rpc.data.targetX);
     let targetY = finite(rpc.data.targetY);
     let power = MathOps.clamp(finite(rpc.data.power), 0, 1);
     // Create projectile entity...
   }
   ```

## Input Delay

Local inputs are scheduled at `currentTick + inputDelay` ticks ahead. This gives RPCs time to reach the server and be relayed to other clients before that tick is simulated.

- **Higher input delay** → fewer rollbacks, more latency feel
- **Lower input delay** → more responsive, more rollbacks on high latency
- **Default:** adaptive, managed by `InputDelayController`

The input delay is automatically adjusted based on network conditions. You generally don't need to configure it.

## Hash Reporting

Hash reporting sends periodic state hashes to the server for divergence detection.

```typescript
// In runner-provider.tsx:
import { createHashReporter } from '@lagless/core';

// After runner creation:
const hashReporter = createHashReporter(runner, {
  inputProvider: runner.InputProviderInstance,
  ReportHashInput: ReportHash,
});

// In drainInputs:
drainInputs={(tick, addRPC) => {
  hashReporter.drain(tick, addRPC);  // Report hashes for verified ticks
  // ... other inputs
}}
```

The `HashVerificationSystem` on the simulation side compares reported hashes and emits `DivergenceSignal` on mismatch.
