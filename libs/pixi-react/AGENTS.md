# AGENTS: @lagless/pixi-react

## Purpose and boundaries
- Provide Pixi + React helpers for VFX and virtual joystick input.
- Not responsible for ECS simulation or network transport.

## Imports and entry points
- `libs/pixi-react/src/index.ts`
- `libs/pixi-react/src/lib/neutrino-particles/use-vfx-container.ts`
- `libs/pixi-react/src/lib/virtual-joystick/virtual-joystick.tsx`
- `libs/pixi-react/src/lib/virtual-joystick/virtual-joystick-ctx.ts`

## Common tasks -> files
- Adjust VFX behavior or lifecycle: `use-vfx-container.ts`.
- Change joystick UI or logic: `virtual-joystick.tsx`, `virtual-joystick-ctx.ts`.
- Update exports: `src/index.ts`.

## Integration points
- Circle Sumo uses `useVFXContainer` for impact effects (`circle-sumo/circle-sumo-game/src/app/game-view/components/impact-vfx.tsx`).
- Joystick uses `@lagless/binary` for float32 coercion.

## Invariants and rules
- `useVFXContainer` must clean up effects on unmount.
- `spawn` should fail gracefully when assets are missing.
- Joystick direction and axis values are float32 for deterministic input paths.

## Workflow for modifications
- Update implementation and exports, then update README examples if needed.
- Validate integration in Circle Sumo UI if behavior changes.
- Verify with `nx lint @lagless/pixi-react` and `nx typecheck @lagless/pixi-react`.

## Example future AI tasks
1) Add a `spawnAtContainer` helper: update `use-vfx-container.ts`, export it, update README.
2) Make joystick size configurable: update `virtual-joystick.tsx` and `VirtualJoystickCtx`, document new props.
3) Add a VFX preload helper: implement, export, and document usage.
