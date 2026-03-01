# Character Controller 3D — Architecture & Best Practices

## Overview

The 3D character controller system consists of three layers:
1. **Simulation** (deterministic) — `@lagless/character-controller-3d`, `@lagless/animation-controller`
2. **View** (non-deterministic) — `VisualSmoother3d`, `AnimationViewAdapter`
3. **Test project** — `roblox-like/` (simulation + server + BabylonJS client)

## Libraries

### @lagless/character-controller-3d (`libs/character-controller-3d/`)

Deterministic character movement using Rapier KCC (Kinematic Character Controller).

**Key classes:**
- `CharacterControllerConfig` — All tunable parameters (walk/run speed, gravity, jump force, capsule size, KCC settings)
- `CharacterControllerManager` — Creates/manages per-entity Rapier KCC instances. Must call `recreateAll()` after rollback (Rapier world is freed)
- `AbstractCharacterControllerSystem` — Reference implementation with acceleration/deceleration, gravity, KCC collision, rotation from yaw, locomotion angle calculation
- `ICharacterStateComponent` — Interface for the ECS component (verticalVelocity, grounded, currentSpeed, jumpCount, moveInputX/Z, isSprinting, facingYaw, locomotionAngle)

**Usage in ECS yaml:**
```yaml
components:
  CharacterState:
    verticalVelocity: float32
    grounded: uint8
    currentSpeed: float32
    jumpCount: uint8
    moveInputX: float32
    moveInputZ: float32
    isSprinting: uint8
    facingYaw: float32
    locomotionAngle: float32
```

### @lagless/animation-controller (`libs/animation-controller/`)

Deterministic animation state machine + non-deterministic view adapter.

**Key classes:**
- `AnimationId` — Constants: IDLE(0), LOCOMOTION(1), JUMP(2), FALL(3), LAND(4)
- `AnimationStateMachine` — Pure deterministic FSM. `play()` starts a crossfade transition, `tick()` advances time and transition progress
- `IAnimationStateComponent` — Interface for ECS component (animationId, animationTime, animationSpeed, prevAnimationId, transitionProgress, transitionDuration, locomotionAngle, locomotionSpeed)
- `LocomotionBlendCalculator` — Computes forward/backward/left/right blend weights from locomotion angle + speed
- `AnimationViewAdapter` — Non-deterministic view layer. Reads ECS state, outputs `AnimationViewState` with transition weight and locomotion blend

**Usage in ECS yaml:**
```yaml
components:
  AnimationState:
    animationId: uint8
    animationTime: float32
    animationSpeed: float32
    prevAnimationId: uint8
    transitionProgress: float32
    transitionDuration: float32
    locomotionAngle: float32
    locomotionSpeed: float32
```

### VisualSmoother3d (`libs/misc/`)

3D equivalent of `VisualSmoother2d`. Handles both sim↔render interpolation and rollback lag smoothing.

- Position: XYZ offset, exponential decay
- Rotation: quaternion offset, slerp toward identity
- After rollback: absorbs the position/rotation jump into offsets that decay smoothly

**API:** `update(prevPos, pos, prevRot, rot, interpolationFactor)` → reads smoothed result from `.x/.y/.z/.rotX/.rotY/.rotZ/.rotW`

## Best Practices

### Character Controller Setup

1. **Prefab must set prev values:** Always set `prevPositionX/Y/Z = positionX/Y/Z` and `prevRotationX/Y/Z/W = rotationX/Y/Z/W` on spawn
2. **Use kinematic position bodies:** Characters use `createKinematicPositionBody()` + capsule collider. KCC handles collision and grounding
3. **System execution order:**
   - SavePrevTransform → PlayerConnection → PlayerLeave → ApplyInput → CharacterMovement → PhysicsStep → Animation → HashVerification
4. **Input flow:** Client sends camera-relative direction in RPC → simulation transforms to world-space using cameraYaw
5. **Rollback:** After `PhysicsSimulationBase.rollback()`, call `CharacterControllerManager.recreateAll()` (old KCCs are invalid after Rapier world restore)

### Animation Controller Setup

1. **Determine animation state from CharacterState:** grounded + speed + verticalVelocity → idle/locomotion/jump/fall/land
2. **Call `AnimationStateMachine.play()` only on state change** — it's a no-op if animation is already active
3. **Call `AnimationStateMachine.tick()` every frame** — advances time and crossfade transition
4. **For codegen components:** Create an adapter wrapping `unsafe` typed arrays to `IAnimationStateComponent` interface (`.get()/.set()` pattern)

### 3D Assets

- **Simulation/collision:** Use simplified geometry (primitives: capsules, boxes, trimeshes from .obj)
- **Rendering:** Use .gltf/.glb for visual models with animations
- Keep simulation colliders simple for determinism; visual models can be complex

### Rollback-Aware Animation

The animation state is in the ECS ArrayBuffer and restores on rollback automatically. The view layer (`AnimationViewAdapter`) reads the restored state and adjusts transitions. No special handling needed beyond the standard ECS snapshot/rollback mechanism.

## Roblox-Like Test Project

Located at `roblox-like/`:
- `roblox-like-simulation/` — ECS schema, systems, config
- `roblox-like-server/` — RelayGameServer with hooks
- `roblox-like-game/` — BabylonJS + React client

### Running:
```bash
# Terminal 1 — server
pnpm exec nx serve @lagless/roblox-like-server
# Terminal 2 — client (port 4202)
pnpm exec nx serve @lagless/roblox-like-game
```

### Controls:
- WASD — Move
- Shift — Sprint
- Space — Jump
- Mouse — Camera orbit
- F3 — Debug panel
