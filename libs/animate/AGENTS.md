# AGENTS.md - @lagless/animate

AI coding guide for the animation module.

## Module Purpose

Frame-based animation utilities for UI effects and transitions. Not for game simulation (use ECS systems for that).

## Key Exports

```typescript
export function animate(options: AnimateOptions): Promise<void>;

export type EasingFunction = (t: number) => number;
export const linear: EasingFunction;
export const easeInOutCubic: EasingFunction;

export class AnimationCancelToken {
  cancel(): void;
  readonly isCancelled: boolean;
}
```

## Usage Context

**Use animate for:**
- UI transitions (fade, slide, scale)
- Visual effects (screen shake, flash)
- Camera movements
- Non-simulation visuals

**Do NOT use for:**
- Game logic (use ECS systems)
- Physics (use ECSSimulation)
- Anything affecting game state

## API

### animate()

```typescript
interface AnimateOptions {
  duration: number;           // Milliseconds
  easing?: EasingFunction;    // Default: linear
  onUpdate: (progress: number) => void;
  cancelToken?: AnimationCancelToken;
}

// Returns Promise that resolves when complete/cancelled
async function animate(options: AnimateOptions): Promise<void>;
```

### Progress Value

- `progress` is always `0` to `1`
- `0` at start, `1` at end
- Easing applied before calling `onUpdate`

## Common Patterns

### Basic Animation

```typescript
await animate({
  duration: 300,
  onUpdate: (t) => {
    element.style.opacity = String(t);
  },
});
```

### Value Interpolation

```typescript
const from = 0;
const to = 100;

await animate({
  duration: 500,
  onUpdate: (t) => {
    const value = from + (to - from) * t;
    setValue(value);
  },
});
```

### Cancelable Animation

```typescript
const token = new AnimationCancelToken();

animate({
  duration: 2000,
  cancelToken: token,
  onUpdate: updateFn,
});

// Later...
token.cancel();
```

### Sequential Animations

```typescript
await animate({ duration: 200, onUpdate: step1 });
await animate({ duration: 300, onUpdate: step2 });
await animate({ duration: 200, onUpdate: step3 });
```

### Parallel Animations

```typescript
await Promise.all([
  animate({ duration: 300, onUpdate: fadeIn }),
  animate({ duration: 300, onUpdate: slideRight }),
]);
```

### React Hook Integration

```typescript
function useFadeIn(ref: RefObject<HTMLElement>) {
  const tokenRef = useRef<AnimationCancelToken>();

  useEffect(() => {
    tokenRef.current = new AnimationCancelToken();

    animate({
      duration: 300,
      cancelToken: tokenRef.current,
      onUpdate: (t) => {
        if (ref.current) {
          ref.current.style.opacity = String(t);
        }
      },
    });

    return () => tokenRef.current?.cancel();
  }, []);
}
```

### Screen Shake

```typescript
async function screenShake(container: HTMLElement, intensity: number) {
  await animate({
    duration: 200,
    onUpdate: (t) => {
      const decay = 1 - t;
      const x = (Math.random() - 0.5) * intensity * decay;
      const y = (Math.random() - 0.5) * intensity * decay;
      container.style.transform = `translate(${x}px, ${y}px)`;
    },
  });
  container.style.transform = '';
}
```

### Flash Effect

```typescript
async function flash(element: HTMLElement) {
  await animate({
    duration: 100,
    onUpdate: (t) => {
      element.style.filter = `brightness(${1 + (1 - t) * 2})`;
    },
  });
  element.style.filter = '';
}
```

## Easing Functions

### Built-in

```typescript
// Linear (default)
linear(t) // Just returns t

// Smooth start and end
easeInOutCubic(t)
```

### Custom Easing

```typescript
// Ease out (fast start, slow end)
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

// Ease in (slow start, fast end)
const easeIn = (t: number) => t * t * t;

// Elastic
const elastic = (t: number) => {
  return Math.pow(2, -10 * t) * Math.sin((t - 0.075) * (2 * Math.PI) / 0.3) + 1;
};
```

## File Structure

```
libs/animate/src/lib/
└── animate.ts  # All exports
```

## DO's and DON'Ts

### DO

- Use for UI/visual effects only
- Cancel animations on component unmount
- Use easing for natural motion
- Keep durations short for responsiveness

### DON'T

- Use in ECS systems (breaks determinism)
- Modify game state in onUpdate
- Forget to cancel on cleanup
- Use very long durations without cancel support
