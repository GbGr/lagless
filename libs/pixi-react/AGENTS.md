# AGENTS.md - @lagless/pixi-react

AI coding guide for the Pixi.js React integration module.

## Module Purpose

React components and hooks for:
- Virtual joystick (touch input)
- Particle effects (Neutrino integration)
- Pixi.js rendering helpers

## Key Exports

```typescript
// Virtual Joystick
export const VirtualJoystickProvider: FC<{ children: ReactNode }>;
export function useVirtualJoystick(): VirtualJoystickCtx;
export function loadVirtualJoystickAssets(): Promise<VirtualJoystickAssets>;

// VFX
export function useVFXContainer(): RefObject<VFXContainer>;
```

## VirtualJoystickCtx

### State Properties

```typescript
class VirtualJoystickCtx {
  axisX: number;     // -1 (left) to 1 (right)
  axisY: number;     // -1 (down) to 1 (up)
  power: number;     // 0 (center) to 1 (edge)
  direction: number; // Radians, 0 = right, PI/2 = up
}
```

### Methods

```typescript
// Internal - called by VirtualJoystick component
setAxis(x: number, y: number): void;
setPower(power: number): void;
setDirection(direction: number): void;

// Subscribe to changes
onChange(callback: (state) => void): () => void;
```

## Usage Patterns

### Basic Setup

```tsx
import { Application } from '@pixi/react';
import { VirtualJoystickProvider } from '@lagless/pixi-react';

function App() {
  return (
    <Application>
      <VirtualJoystickProvider>
        <GameContent />
      </VirtualJoystickProvider>
    </Application>
  );
}
```

### Reading Joystick State

```tsx
import { useVirtualJoystick } from '@lagless/pixi-react';

function PlayerController() {
  const joystick = useVirtualJoystick();

  useEffect(() => {
    const unsub = joystick.onChange((state) => {
      console.log(`Direction: ${state.direction}, Power: ${state.power}`);
    });
    return unsub;
  }, []);
}
```

### Converting to Input RPCs

```tsx
function useJoystickInput(inputProvider: AbstractInputProvider) {
  const joystick = useVirtualJoystick();

  useEffect(() => {
    const unsub = joystick.onChange((state) => {
      // Dead zone
      if (state.power < 0.1) return;

      inputProvider.drainInputs((addRpc) => {
        addRpc(Move, {
          direction: state.direction,
          speed: state.power,
        });
      });
    });

    return unsub;
  }, [inputProvider]);
}
```

### Look Direction from Joystick

```tsx
function useLookAtInput(inputProvider: AbstractInputProvider) {
  const joystick = useVirtualJoystick();

  useEffect(() => {
    const unsub = joystick.onChange((state) => {
      if (state.power < 0.1) return;

      inputProvider.drainInputs((addRpc) => {
        addRpc(LookAt, {
          direction: state.direction,
        });
      });
    });

    return unsub;
  }, [inputProvider]);
}
```

## Joystick Behavior

### Visual Layout

```
┌─────────────────────────────────────┐
│                                     │
│           Game View                 │
│                                     │
│                                     │
├─────────────────────────────────────┤
│                                     │
│         ┌───────────┐               │
│         │  Handle   │  ← Draggable  │
│         │    ●      │               │
│         └───────────┘               │
│      Background Circle              │
│                                     │
└─────────────────────────────────────┘
```

### Coordinate System

```
          Up (+Y)
            │
            │
Left (-X) ──┼── Right (+X)
            │
            │
         Down (-Y)

direction = atan2(axisY, axisX)
```

### Handle Clamping

The handle is clamped to stay within the background circle:
- `maxOffset = (joystickSize - handleSize/2) / 2`
- When dragged beyond, position is normalized to edge

## Preloading

Always preload assets before rendering:

```tsx
import { loadVirtualJoystickAssets } from '@lagless/pixi-react';

function AssetsLoader({ children }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadVirtualJoystickAssets().then(() => setReady(true));
  }, []);

  if (!ready) return <LoadingScreen />;
  return children;
}
```

## VFX Container

For particle effects with Neutrino:

```tsx
import { useVFXContainer } from '@lagless/pixi-react';

function EffectsLayer() {
  const containerRef = useVFXContainer();

  useEffect(() => {
    // Effects are managed by the container
  }, []);

  return <Container ref={containerRef} />;
}
```

## File Structure

```
libs/pixi-react/src/lib/
├── virtual-joystick/
│   ├── virtual-joystick.tsx      # Main component
│   ├── virtual-joystick-ctx.ts   # Context class
│   └── textures/
│       ├── joystick.png
│       └── joystick-handle.png
└── neutrino-particles/
    └── use-vfx-container.ts
```

## DO's and DON'Ts

### DO

- Preload assets before rendering
- Use dead zone (power < 0.1) to filter noise
- Unsubscribe from onChange in cleanup
- Place provider inside Application

### DON'T

- Access joystick outside provider
- Forget to handle cleanup
- Use without preloading assets
- Assume immediate values (use onChange)
