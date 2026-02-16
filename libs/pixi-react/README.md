# @lagless/pixi-react

## 1. Responsibility & Context

Provides React integration components for Pixi.js-based game UIs: `VirtualJoystick` for touch/mouse input and `useVFXContainer` hook for Neutrino particle effects. These are UI-layer components — not part of the deterministic ECS simulation — used for rendering game controls and visual effects in the Circle Sumo frontend. Depends on `@pixi/react` for React+Pixi integration and `neutrinoparticles.pixi` for particle effects.

## 2. Architecture Role

**UI layer** — sits on top of Pixi.js and React, provides game-specific UI components for frontend.

**Downstream consumers:**
- `circle-sumo-game` — Uses `VirtualJoystick` for player input and `useVFXContainer` for impact/collision effects

**Upstream dependencies:**
- `pixi.js` (peer dependency) — Rendering engine
- `@pixi/react` (peer dependency) — React integration for Pixi.js
- `neutrinoparticles.pixi` (peer dependency) — Particle effects library
- `@lagless/binary` — `toFloat32()` for deterministic float conversion in joystick
- `@lagless/core` — Type imports (not runtime dependency)

## 3. Public API

### VirtualJoystick

Touch/mouse joystick component for game input. Renders as a circular joystick UI with draggable handle.

#### VirtualJoystickProvider

React context provider that renders the joystick and manages its state.

```typescript
const VirtualJoystickProvider: FC<{ children: ReactNode }>;
```

**Usage:**
```tsx
import { VirtualJoystickProvider } from '@lagless/pixi-react';

function GameApp() {
  return (
    <VirtualJoystickProvider>
      {/* Your Pixi.js game components */}
    </VirtualJoystickProvider>
  );
}
```

**What it does:**
- Loads joystick textures (`joystick.png`, `joystick-handle.png`)
- Creates `VirtualJoystickCtx` instance
- Renders joystick UI at bottom-center of canvas
- Provides joystick context via React Context

#### useVirtualJoystick

Hook to access joystick state from any component within `VirtualJoystickProvider`.

```typescript
function useVirtualJoystick(): VirtualJoystickCtx;
```

**Returns:** `VirtualJoystickCtx` instance with joystick state.

#### VirtualJoystickCtx

Joystick state manager. Provides real-time input values and change listeners.

```typescript
class VirtualJoystickCtx {
  get direction(): number;  // Angle in radians (-π to π, 0 = right)
  get axisX(): number;      // Horizontal axis [-1, 1] (left to right)
  get axisY(): number;      // Vertical axis [-1, 1] (down to up)
  get power(): number;      // Distance from center [0, 1]

  addDirectionChangeListener(handler: (direction: number) => void): () => void;
}

type VJDirectionListener = (direction: number) => void;
type VJUnsubscribe = () => void;
```

**Key behavior:**
- `axisX`, `axisY`: Normalized to [-1, 1], clamped to joystick radius
- `power`: Distance from center [0, 1], 0 = center, 1 = edge
- `direction`: Angle in radians using `Math.atan2(axisY, axisX)`
- All values use `toFloat32()` for deterministic precision
- Direction listeners fire on every joystick update

#### loadVirtualJoystickAssets

Preloads joystick textures. Called automatically by `VirtualJoystickProvider`, but can be called manually for preloading.

```typescript
function loadVirtualJoystickAssets(): Promise<VirtualJoystickAssets>;

interface VirtualJoystickAssets {
  joystick: Texture;         // Base joystick texture
  joystickHandle: Texture;   // Draggable handle texture
}
```

### VFX (Visual Effects)

#### useVFXContainer

React hook for managing Neutrino particle effects. Handles effect spawning, lifetime management, and cleanup.

```typescript
function useVFXContainer(): {
  containerRef: React.RefObject<Container>;  // Pixi Container ref to attach to scene
  spawn: (
    effectAlias: string,
    position: [number, number, number],
    options?: SpawnOptions
  ) => Effect | null;
  clear: () => void;                        // Remove all active effects
  activeCount: number;                      // Current number of active effects
};

interface SpawnOptions {
  rotation?: number;                        // Rotation in radians (default: 0)
  scale?: number | [number, number, number]; // Uniform or per-axis scale (default: 1)
  duration?: number;                        // Lifetime in ms (default: auto-remove when particles = 0)
  onComplete?: () => void;                  // Called when effect is removed
}
```

**Effect lifecycle:**
1. Call `spawn()` → Effect is created and added to container
2. Effect updates every frame (via `useTick`)
3. Effect is removed when:
   - `duration` expires (if specified), OR
   - `getNumParticles() === 0` (if no duration specified)
4. `onComplete` callback fires (if provided)

**Effect alias:** Must be loaded into Pixi.js Assets cache before spawning. Use `Assets.load()` with effect JSON file.

## 4. Preconditions

- **`VirtualJoystickProvider` requires `@pixi/react` context** — Must be rendered inside `<Application>` or `<Stage>` from `@pixi/react`
- **Joystick textures must be bundled** — `virtual-joystick/textures/joystick.png` and `joystick-handle.png` must be available via module imports
- **`useVFXContainer` requires Neutrino effects to be preloaded** — Effect models must be loaded into `Assets` cache before calling `spawn()`
- **`spawn()` must be called after containerRef is attached** — Container must be added to Pixi scene before spawning effects

## 5. Postconditions

- After `VirtualJoystickProvider` mounts, joystick UI is visible at bottom-center of canvas
- After dragging joystick, `VirtualJoystickCtx` reflects current input state
- After `spawn()` completes, effect is visible in the container
- After `clear()` or component unmount, all effects are destroyed and removed from scene

## 6. Invariants & Constraints

- **Joystick axis clamping:** `axisX` and `axisY` are always in [-1, 1]
- **Joystick power range:** `power` is always in [0, 1]
- **Joystick direction range:** `direction` is in (-π, π], 0 = pointing right
- **Float32 precision:** All joystick values use `toFloat32()` for deterministic rounding
- **Effect auto-removal:** Effects with no `duration` are removed when `getNumParticles() === 0`
- **Effect memory management:** All effects are destroyed on unmount to prevent memory leaks

## 7. Safety Notes (AI Agent)

### DO NOT

- **DO NOT use `VirtualJoystick` inside ECS systems** — This is a UI component for rendering, not game logic. Read joystick state via `useVirtualJoystick()` in React components, then send inputs to ECS via input provider.
- **DO NOT spawn effects without preloading** — `Assets.load()` must complete before calling `spawn()`, or it returns null and logs an error
- **DO NOT forget to attach containerRef** — `useVFXContainer().containerRef` must be attached to a Pixi Container in the scene, or effects won't render
- **DO NOT call `spawn()` after component unmounts** — The hook checks `isUnmountedRef` and returns null, but avoid calling spawn in async callbacks after unmount
- **DO NOT mutate `VirtualJoystickCtx` state directly** — Use `setAxis`, `setPower`, `setDirection` methods (but these are internal — typically only the joystick component calls them)

### Common Mistakes

- Forgetting to wrap app in `VirtualJoystickProvider` → `useVirtualJoystick()` throws error
- Not attaching `containerRef` to scene → effects are created but not visible
- Spawning effects before assets load → `spawn()` returns null, no effect appears
- Not cleaning up direction listeners → memory leak if listeners are added in render loop

## 8. Usage Examples

### Basic VirtualJoystick Setup

```tsx
import { Application } from '@pixi/react';
import { VirtualJoystickProvider, useVirtualJoystick } from '@lagless/pixi-react';

function Game() {
  return (
    <Application width={800} height={600}>
      <VirtualJoystickProvider>
        <PlayerController />
      </VirtualJoystickProvider>
    </Application>
  );
}

function PlayerController() {
  const joystick = useVirtualJoystick();

  useEffect(() => {
    // Subscribe to direction changes
    const unsubscribe = joystick.addDirectionChangeListener((direction) => {
      console.log(`Joystick direction: ${direction} radians`);
    });

    return unsubscribe; // Cleanup on unmount
  }, [joystick]);

  // Read joystick state
  console.log(`Power: ${joystick.power}`);
  console.log(`Axis: (${joystick.axisX}, ${joystick.axisY})`);

  return null;
}
```

### Sending Joystick Input to ECS

```tsx
import { useVirtualJoystick } from '@lagless/pixi-react';
import { useECSRunner } from './hooks';

function PlayerInputSystem() {
  const joystick = useVirtualJoystick();
  const runner = useECSRunner();

  useEffect(() => {
    const interval = setInterval(() => {
      // Send input to ECS every 16ms (60 FPS)
      if (joystick.power > 0.1) { // Deadzone
        runner.InputProvider.sendMoveInput({
          direction: joystick.direction,
          power: joystick.power,
        });
      }
    }, 16);

    return () => clearInterval(interval);
  }, [joystick, runner]);

  return null;
}
```

### VFX Container Setup

```tsx
import { Container } from '@pixi/react';
import { useVFXContainer } from '@lagless/pixi-react';
import { Assets } from 'pixi.js';
import { useEffect } from 'react';

function GameScene() {
  const vfx = useVFXContainer();

  useEffect(() => {
    // Preload VFX assets
    Assets.load('/effects/explosion.json').then(() => {
      console.log('VFX loaded');
    });
  }, []);

  const spawnExplosion = (x: number, y: number) => {
    vfx.spawn('explosion', [x, y, 0], {
      duration: 2000,       // Remove after 2 seconds
      scale: 1.5,           // 1.5x scale
      onComplete: () => {
        console.log('Explosion complete');
      },
    });
  };

  return (
    <>
      {/* Attach VFX container to scene */}
      <container ref={vfx.containerRef} />

      {/* Game objects */}
      <sprite
        texture={playerTexture}
        onClick={() => spawnExplosion(100, 100)}
      />
    </>
  );
}
```

### Spawning VFX on Collision

```tsx
import { useVFXContainer } from '@lagless/pixi-react';
import { useEffect } from 'react';

function CollisionEffects({ simulation }) {
  const vfx = useVFXContainer();

  useEffect(() => {
    // Subscribe to collision signal from ECS
    const unsubscribe = simulation.signals.collision.Predicted.on((event) => {
      const { x, y } = event.data.position;

      // Spawn impact effect
      vfx.spawn('impact', [x, y, 0], {
        scale: event.data.impactForce / 100, // Scale by force
        rotation: event.data.angle,
        // Auto-remove when particles = 0 (no duration specified)
      });
    });

    return unsubscribe;
  }, [simulation, vfx]);

  return null;
}
```

### Clearing All Effects

```tsx
import { useVFXContainer } from '@lagless/pixi-react';

function VFXControls() {
  const vfx = useVFXContainer();

  return (
    <button onClick={() => vfx.clear()}>
      Clear All VFX ({vfx.activeCount} active)
    </button>
  );
}
```

## 9. Testing Guidance

No tests currently exist for this library. When adding tests, consider:

**Framework suggestion:** Vitest + React Testing Library + `@testing-library/react` with Pixi.js mocking

**Test coverage priorities:**
1. **VirtualJoystick state** — Verify `axisX`, `axisY`, `power`, `direction` update correctly on drag
2. **VirtualJoystick clamping** — Verify values stay within valid ranges
3. **VFX spawning** — Verify effects are added to container
4. **VFX lifetime** — Verify effects are removed after duration or when particles = 0
5. **Cleanup** — Verify effects are destroyed on unmount

**Challenge:** Pixi.js and `@pixi/react` are difficult to test in jsdom. Consider:
- Mocking Pixi.js classes (`Container`, `Sprite`, `Texture`)
- Using Playwright for E2E tests of actual rendered joystick

## 10. Change Checklist

When modifying this module:

1. **Test on touch devices** — Joystick should work identically on mobile and desktop
2. **Check joystick positioning** — Verify joystick appears correctly on different screen sizes
3. **Profile VFX performance** — Ensure `useTick` loop doesn't cause frame drops with many effects
4. **Update texture assets** — If changing joystick appearance, update textures in `textures/` directory
5. **Update this README:** Document new APIs or options
6. **Verify cleanup** — Ensure effects are destroyed on unmount (no memory leaks)

## 11. Integration Notes

### Used By

- **`circle-sumo-game`:**
  - `VirtualJoystick` — Player movement input on mobile/desktop
  - `useVFXContainer` — Impact effects, collision effects, game-over effects

### Common Integration Patterns

**Full game setup:**
```tsx
import { Application, Container } from '@pixi/react';
import { VirtualJoystickProvider, useVirtualJoystick, useVFXContainer } from '@lagless/pixi-react';

function CircleSumoGame() {
  return (
    <Application width={1920} height={1080}>
      <VirtualJoystickProvider>
        <GameScene />
      </VirtualJoystickProvider>
    </Application>
  );
}

function GameScene() {
  const joystick = useVirtualJoystick();
  const vfx = useVFXContainer();

  // Use joystick for input
  useEffect(() => {
    // Send inputs to ECS
  }, [joystick]);

  // Subscribe to game signals for VFX
  useEffect(() => {
    // Spawn effects on collisions
  }, [vfx]);

  return (
    <>
      <container ref={vfx.containerRef} />
      {/* Game objects */}
    </>
  );
}
```

**Preloading VFX assets:**
```tsx
import { Assets, EffectModel } from 'pixi.js';

async function preloadGameAssets() {
  await Assets.load([
    '/effects/explosion.json',
    '/effects/impact.json',
    '/effects/smoke.json',
  ]);

  // Verify effects loaded
  const explosion = Assets.get<EffectModel>('explosion');
  console.log('Explosion effect loaded:', explosion !== null);
}
```

## 12. Appendix

### VirtualJoystick Coordinate System

```
Y-axis points UP (positive Y = up)
X-axis points RIGHT (positive X = right)

        axisY = +1
             ↑
             |
axisX = -1 ← O → axisX = +1
             |
             ↓
        axisY = -1

Direction (radians):
      π/2 (up)
        |
π ←─── O ───→ 0 (right)
        |
     -π/2 (down)
```

**Conversion to game input:**
```typescript
// Joystick uses Y-up convention
// Game may use Y-down (Pixi.js default)
const gameX = joystick.axisX;
const gameY = -joystick.axisY; // Flip Y axis if game uses Y-down
```

### Joystick Positioning

Joystick is rendered at:
```
x = canvasWidth / 2 - joystickSize / 2        // Centered horizontally
y = canvasHeight - joystickSize - canvasHeight * 0.1 // 10% padding from bottom
```

**To customize position**, modify `VirtualJoystick` component (lines 156-158).

### VFX Effect Lifecycle

```
1. spawn() called
   ↓
2. Effect created and added to container
   ↓
3. useTick() updates effect every frame
   ↓
4. Check removal conditions:
   - duration expired? → Remove
   - getNumParticles() === 0 && no duration? → Remove
   ↓
5. effect.destroy() + onComplete() called
```

**Duration vs Auto-removal:**
- **With duration:** Effect removed after `duration` ms, even if particles still exist
- **Without duration:** Effect removed when `getNumParticles() === 0` (all particles dead)

### Neutrino Particles Asset Format

Neutrino effects are JSON files with embedded texture references. Example structure:

```json
{
  "effect": {
    "name": "explosion",
    "emitters": [...],
    "textures": [
      { "id": "particle1", "url": "/textures/particle1.png" }
    ]
  }
}
```

**Loading:**
```typescript
await Assets.load('/effects/explosion.json');
const effectModel = Assets.get<EffectModel>('explosion');
```

**Spawning:**
```typescript
vfx.spawn('explosion', [x, y, z], options);
```
