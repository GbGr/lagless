# @lagless/pixi-react

Pixi.js React integration for the Lagless framework. Provides virtual joystick controls and particle effect utilities.

## Installation

```bash
pnpm add @lagless/pixi-react pixi.js @pixi/react
```

## Overview

This module provides:

- **VirtualJoystick**: Touch-friendly joystick control for mobile
- **VFX Container**: Particle effect integration with Neutrino Particles

## Virtual Joystick

A customizable on-screen joystick for touch input:

### Setup

```tsx
import { VirtualJoystickProvider, useVirtualJoystick } from '@lagless/pixi-react';

function Game() {
  return (
    <Application>
      <VirtualJoystickProvider>
        <GameContent />
      </VirtualJoystickProvider>
    </Application>
  );
}
```

### Using the Joystick

```tsx
import { useVirtualJoystick } from '@lagless/pixi-react';

function GameContent() {
  const joystick = useVirtualJoystick();

  useEffect(() => {
    // Subscribe to joystick updates
    const unsubscribe = joystick.onChange((state) => {
      // state.axisX: -1 to 1 (left to right)
      // state.axisY: -1 to 1 (down to up)
      // state.power: 0 to 1 (distance from center)
      // state.direction: radians (angle from center)

      if (state.power > 0.1) {
        inputProvider.drainInputs((addRpc) => {
          addRpc(Move, {
            direction: state.direction,
            speed: state.power,
          });
        });
      }
    });

    return unsubscribe;
  }, []);

  return <GameWorld />;
}
```

### Preloading Assets

```tsx
import { loadVirtualJoystickAssets } from '@lagless/pixi-react';

async function preload() {
  await loadVirtualJoystickAssets();
}
```

### VirtualJoystickCtx API

```typescript
class VirtualJoystickCtx {
  // Current state (read-only)
  axisX: number;     // -1 to 1
  axisY: number;     // -1 to 1
  power: number;     // 0 to 1
  direction: number; // radians

  // Subscribe to changes
  onChange(callback: (state: JoystickState) => void): () => void;
}
```

## VFX Container

Integration with Neutrino Particles for visual effects:

### Setup

```tsx
import { useVFXContainer } from '@lagless/pixi-react';

function EffectsLayer() {
  const vfxContainerRef = useVFXContainer();

  // Spawn effects
  const spawnExplosion = (x: number, y: number) => {
    if (vfxContainerRef.current) {
      vfxContainerRef.current.spawnEffect('explosion', x, y);
    }
  };

  return <Container ref={vfxContainerRef} />;
}
```

## Usage with Circle Sumo

The circle-sumo demo uses these components:

```tsx
// game-view.tsx
import { VirtualJoystickProvider, useVirtualJoystick } from '@lagless/pixi-react';

function GameView() {
  return (
    <Application>
      <VirtualJoystickProvider>
        <Viewport>
          <GameWorld />
        </Viewport>
      </VirtualJoystickProvider>
    </Application>
  );
}

// Input handling
function useJoystickInput(inputProvider: AbstractInputProvider) {
  const joystick = useVirtualJoystick();

  useEffect(() => {
    const unsub = joystick.onChange((state) => {
      if (state.power > 0.1) {
        inputProvider.drainInputs((add) => {
          add(Move, {
            direction: state.direction,
            speed: state.power,
          });
        });
      }
    });

    return unsub;
  }, [inputProvider]);
}
```

## Customization

### Joystick Positioning

The joystick automatically positions itself at the bottom center of the canvas and responds to resize events.

### Styling

The joystick uses PNG textures that can be replaced:
- `joystick.png` - Background circle
- `joystick-handle.png` - Draggable handle

## Dependencies

- `pixi.js` >= 8.0
- `@pixi/react` >= 8.0
- `neutrinoparticles.pixi` >= 6.0 (for VFX)
