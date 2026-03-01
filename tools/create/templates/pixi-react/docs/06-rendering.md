# Rendering

## Architecture

Rendering is **non-deterministic** and **read-only**. The view layer reads ECS state but never writes to it. Simulation runs independently of rendering.

```
Simulation (deterministic)     View Layer (non-deterministic)
  ECS systems → ArrayBuffer ──→ FilterViews → Pixi.js sprites
  Tick N state                   Interpolated between ticks
```

## FilterViews — Entity Lifecycle Management

`FilterViews` from `@lagless/pixi-react` automatically manages Pixi.js containers for entities matching a filter. When an entity enters the filter, a view is created. When it leaves, the view is destroyed.

```tsx
import { FilterViews } from '@lagless/pixi-react';

// In game scene:
<FilterViews
  filter={runner.Core.PlayerFilter}
  View={PlayerView}
/>
```

## filterView — Define Entity Views

`filterView` creates a view component with lifecycle hooks:

```tsx
import { filterView } from '@lagless/pixi-react';

const PlayerView = filterView(
  // Render function — called once on entity creation
  ({ entity, runner }, ref) => {
    return (
      <pixiContainer ref={ref}>
        <pixiGraphics
          draw={(g) => {
            g.circle(0, 0, 20);
            g.fill({ color: 0x4488ff });
          }}
        />
      </pixiContainer>
    );
  },
  {
    // Called every render frame — update positions
    onUpdate: ({ entity, runner }, container) => {
      const transform = runner.Core.Transform2d;
      const sim = runner.Simulation;

      // Use interpolation for smooth rendering between ticks
      const factor = sim.interpolationFactor;
      const prevX = transform.unsafe.prevPositionX[entity];
      const prevY = transform.unsafe.prevPositionY[entity];
      const currX = transform.unsafe.positionX[entity];
      const currY = transform.unsafe.positionY[entity];

      container.position.set(
        prevX + (currX - prevX) * factor,
        prevY + (currY - prevY) * factor,
      );
    },
  },
);
```

### filterView Lifecycle

| Hook | When | Use For |
|------|------|---------|
| Render function | Entity enters filter | Create sprites, set up initial state |
| `onUpdate` | Every render frame | Update position, rotation, animation |
| `onDestroy` | Entity leaves filter | Cleanup (optional, auto-handled) |

## VisualSmoother2d — Rollback Smoothing

`VisualSmoother2d` handles both simulation↔render interpolation AND rollback lag smoothing. Without it, entities teleport when a rollback changes their position.

```typescript
import { VisualSmoother2d } from '@lagless/misc';

// Create one per entity (e.g., in filterView render):
const smoother = new VisualSmoother2d();

// In onUpdate:
onUpdate: ({ entity, runner }, container) => {
  const transform = runner.Core.Transform2d;
  const sim = runner.Simulation;

  smoother.update(
    transform.unsafe.prevPositionX[entity],
    transform.unsafe.prevPositionY[entity],
    transform.unsafe.positionX[entity],
    transform.unsafe.positionY[entity],
    0, // prevRotation (use transform field if available)
    0, // rotation (use transform field if available)
    sim.interpolationFactor,
  );

  container.position.set(smoother.x, smoother.y);
}
```

### How VisualSmoother2d Works

1. **Normal tick:** Interpolates between prevPosition and position using interpolationFactor
2. **After rollback:** Detects position jump, absorbs it into an offset
3. **Decay:** Offset decays exponentially (halfLife=200ms) — entity slides smoothly to correct position
4. **No feedback loop:** Stores raw sim position (not smoothed) for next-frame comparison

## Pixi.js Setup

The template uses Pixi.js 8 with `@pixi/react` for declarative rendering.

```tsx
// In main.tsx:
import '@abraham/reflection';
import { extend } from '@pixi/react';
import { Container, Graphics, Sprite, Text, Application } from 'pixi.js';

extend({ Container, Graphics, Sprite, Text, Application });
```

### RunnerTicker

The `RunnerTicker` component connects the simulation loop to Pixi.js's render loop:

```tsx
import { RunnerTicker } from '@lagless/pixi-react';

// Inside <Application>:
<RunnerTicker runner={runner} />
```

This calls `runner.update(deltaTime)` every frame, advancing the simulation.

## Adding New Entity Visuals

### Step 1: Define Component and Filter

```yaml
# ecs.yaml
components:
  Projectile:
    ownerSlot: uint8
    radius: float32

filters:
  ProjectileFilter:
    include: [Transform2d, Projectile]
```

### Step 2: Run Codegen

```bash
pnpm codegen
```

### Step 3: Create View Component

```tsx
// game-view/projectile-view.tsx
import { filterView } from '@lagless/pixi-react';
import { VisualSmoother2d } from '@lagless/misc';

const ProjectileView = filterView(
  ({ entity, runner }, ref) => {
    const smoother = new VisualSmoother2d();
    const radius = runner.Core.Projectile.unsafe.radius[entity];

    return (
      <pixiContainer ref={ref} userData={{ smoother }}>
        <pixiGraphics
          draw={(g) => {
            g.circle(0, 0, radius);
            g.fill({ color: 0xff4444 });
          }}
        />
      </pixiContainer>
    );
  },
  {
    onUpdate: ({ entity, runner }, container) => {
      const smoother = container.userData.smoother as VisualSmoother2d;
      const t = runner.Core.Transform2d;
      const sim = runner.Simulation;

      smoother.update(
        t.unsafe.prevPositionX[entity], t.unsafe.prevPositionY[entity],
        t.unsafe.positionX[entity], t.unsafe.positionY[entity],
        0, 0, sim.interpolationFactor,
      );
      container.position.set(smoother.x, smoother.y);
    },
  },
);

export { ProjectileView };
```

### Step 4: Add to Game Scene

```tsx
// game-view/game-scene.tsx
<FilterViews filter={runner.Core.ProjectileFilter} View={ProjectileView} />
```

## Performance Tips

- **Use unsafe arrays in `onUpdate`** — avoid `getCursor()` in render loops
- **Minimize React re-renders** — FilterViews handles lifecycle, don't use React state for positions
- **Batch draw calls** — use `pixiGraphics.draw()` callback, not imperative calls every frame
- **Object pooling** — FilterViews already pools containers; entity recycling handles the rest
- **Avoid allocations** — use `VECTOR2_BUFFER_1..10` scratch vectors in calculation-heavy render code

## Screen Management

The template uses React Router for screen navigation:

```tsx
// router.tsx
<Routes>
  <Route path="/" element={<TitleScreen />} />
  <Route path="/game" element={<GameScreen />} />
</Routes>
```

### Title Screen → Game Screen

```tsx
// screens/title.screen.tsx
const navigate = useNavigate();
const startMatch = useStartMatch(); // or useStartMultiplayerMatch

const handleStart = () => {
  startMatch();  // sets up runner, navigates to /game
};
```

## Debug Panel

The `<DebugPanel>` from `@lagless/react` shows network stats in development:

```tsx
import { DebugPanel } from '@lagless/react';

<DebugPanel
  runner={runner}
  hashVerification={true}  // show hash table
  // Toggle with F3 key
/>
```

Shows: RTT, jitter, input delay, nudger offset, tick, rollback count, FPS, hash verification table, disconnect/reconnect buttons.
