# `@lagless/pixi-react`

## What it is
`@lagless/pixi-react` provides small React + Pixi helpers for Lagless frontends. It includes a VFX container hook and a virtual joystick UI.

## Why it exists / when to use it
Use it when building Pixi-based UI layers for Lagless games. It keeps VFX and input helpers consistent across projects.

## Public API
- `useVFXContainer`: hook that manages NeutrinoParticles effects in a Pixi container
- `VirtualJoystickProvider`, `useVirtualJoystick`, `loadVirtualJoystickAssets`

## Typical usage
Circle Sumo spawns VFX on high-impact signals:

```ts
import { useVFXContainer } from '@lagless/pixi-react';

const { containerRef, spawn } = useVFXContainer();
spawn('TrianglesImpact', [x, -y, 0], { scale: power, duration: 350 });
```

## Key concepts & data flow
- `useVFXContainer` owns a Pixi `Container` and updates particle effects on each tick.
- `spawn` looks up effect models via `Assets.get` and inserts them into the container.
- The virtual joystick exposes axis/power/direction through a context object.

## Configuration and environment assumptions
- Requires `@pixi/react`, `pixi.js`, and `neutrinoparticles.pixi` to be available.
- VFX aliases must be preloaded into `Assets`.
- The joystick provider loads its texture assets at runtime.

## Pitfalls / common mistakes
- Calling `spawn` before `containerRef` is mounted.
- Forgetting to preload effect models or joystick textures.
- Using the joystick without wrapping the app in `VirtualJoystickProvider`.

## Related modules
- `circle-sumo/circle-sumo-game` for real usage.
- `libs/animate` for UI animation helpers.
