# @lagless/animate

## 1. Responsibility & Context

Provides browser-based animation utilities using `requestAnimationFrame` for smooth, 60 FPS animations with customizable timing functions (easing). Includes `animate()` for callback-based animations, `animatePromise()` for async/await usage, and `AnimationCancelToken` for cancellation. This is a lightweight UI animation helper — not part of the deterministic ECS simulation — used for frontend effects like fades, transitions, and UI element animations.

## 2. Architecture Role

**UI layer** — browser-only utility library with no dependencies on other Lagless modules. Used by frontend UI code, not by ECS systems.

**Downstream consumers:**
- `circle-sumo-game` — Uses animations for UI transitions and visual effects
- Frontend React components — Any UI element that needs smooth animations

**Upstream dependencies:**
- None (uses browser APIs: `requestAnimationFrame`, `performance.now`)

## 3. Public API

### animate()

Starts a `requestAnimationFrame`-based animation. Calls `draw` function on every frame with progress value [0, 1].

```typescript
function animate(
  draw: (progress: number) => void,      // Called every frame with progress [0, 1]
  duration: number,                      // Animation duration in milliseconds
  onAnimationDone: () => void,           // Called when animation completes
  timing?: TimingFunction                // Timing function (default: easing)
): AnimationCancelToken;                 // Token for cancellation
```

**Parameters:**
- `draw` — Callback invoked on each frame with `progress` in [0, 1] (after applying timing function)
- `duration` — Total animation duration in milliseconds
- `onAnimationDone` — Callback invoked when animation completes (timeFraction reaches 1)
- `timing` — Timing function that transforms linear time fraction [0, 1] to eased progress [0, 1] (default: `easing`)

**Returns:** `AnimationCancelToken` — Call `cancel()` to stop animation

### animatePromise()

Promise-based wrapper for `animate()`. Resolves when animation completes.

```typescript
function animatePromise(
  draw: (progress: number) => void,
  duration: number,
  timing?: TimingFunction
): Promise<void>;
```

**Usage with async/await:**
```typescript
await animatePromise((progress) => {
  element.style.opacity = progress.toString();
}, 500);
console.log('Animation complete!');
```

### AnimationCancelToken

Cancellation token returned by `animate()`. Call `cancel()` to stop the animation.

```typescript
class AnimationCancelToken {
  get isCancelled(): boolean;   // True if cancel() was called
  cancel(): void;                // Stop the animation
}
```

**Behavior:** After `cancel()` is called, `draw` and `onAnimationDone` will not be invoked on subsequent frames. Animation loop exits gracefully.

### Timing Functions

Pre-defined timing functions that transform linear time to eased progress.

```typescript
type TimingFunction = (timeFraction: number) => number;

// Pre-defined timing functions:
const easing: TimingFunction;       // Ease-out (fast start, slow end) — default
const easingInOut: TimingFunction;  // Ease-in-out (slow start, fast middle, slow end)
const linear: TimingFunction;       // Linear (no easing)
```

**Custom timing functions:**
```typescript
const customEasing: TimingFunction = (t) => t * t; // Quadratic ease-in
animate(draw, 1000, onDone, customEasing);
```

## 4. Preconditions

- **Browser environment required** — This library uses `requestAnimationFrame` and `performance.now`, which are not available in Node.js
- **Duration must be positive** — Passing `duration <= 0` causes immediate completion (draws once with progress=1)

## 5. Postconditions

- After `animate()` completes (timeFraction reaches 1), `onAnimationDone()` is called
- After `animatePromise()` resolves, the animation has completed
- After `cancelToken.cancel()` is called, no further `draw` or `onAnimationDone` callbacks occur

## 6. Invariants & Constraints

- **Progress range:** `draw` is always called with `progress` in [0, 1] (clamped at 1 on final frame)
- **Frame rate:** Tied to browser's refresh rate (typically 60 FPS, but can be 120 FPS on high-refresh displays)
- **Cancellation is immediate:** After `cancel()`, no further callbacks occur (checked at start of each frame)
- **Timing function output:** Timing functions should map [0, 1] → [0, 1], but this is not enforced

## 7. Safety Notes (AI Agent)

### DO NOT

- **DO NOT use `animate()` inside ECS systems** — This is for UI animations only. ECS systems must be deterministic and cannot depend on `requestAnimationFrame`.
- **DO NOT assume 60 FPS** — Animation duration is in milliseconds, but actual frame rate depends on the browser. Use `progress` parameter, not frame count.
- **DO NOT forget to cancel animations on unmount** — React components should cancel animations in cleanup functions to prevent memory leaks.
- **DO NOT use in Node.js** — This library requires browser APIs (`requestAnimationFrame`, `performance.now`).

### Common Mistakes

- Using animations inside ECS systems → breaks determinism (use `interpolationFactor` from ECSSimulation instead)
- Not cancelling animations on component unmount → memory leak (callbacks continue after component is gone)
- Assuming fixed frame rate → animation speed varies on different displays (use `progress`, not frame count)

## 8. Usage Examples

### Basic Fade-In Animation

```typescript
import { animate, easing } from '@lagless/animate';

const element = document.getElementById('myElement');

animate(
  (progress) => {
    element.style.opacity = progress.toString();
  },
  500, // 500ms duration
  () => {
    console.log('Fade-in complete!');
  },
  easing // ease-out timing
);
```

### Promise-Based Animation with Async/Await

```typescript
import { animatePromise, easingInOut } from '@lagless/animate';

async function fadeInThenOut(element: HTMLElement) {
  // Fade in
  await animatePromise((progress) => {
    element.style.opacity = progress.toString();
  }, 500, easingInOut);

  // Wait 1 second
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Fade out
  await animatePromise((progress) => {
    element.style.opacity = (1 - progress).toString();
  }, 500, easingInOut);

  console.log('Fade sequence complete!');
}
```

### Cancellable Animation

```typescript
import { animate, AnimationCancelToken } from '@lagless/animate';

let cancelToken: AnimationCancelToken | null = null;

function startAnimation() {
  cancelToken = animate(
    (progress) => {
      element.style.transform = `translateX(${progress * 100}px)`;
    },
    1000,
    () => console.log('Animation finished')
  );
}

function stopAnimation() {
  if (cancelToken) {
    cancelToken.cancel();
    console.log('Animation cancelled');
  }
}

// Start animation
startAnimation();

// Cancel after 300ms
setTimeout(stopAnimation, 300);
```

### React Component Integration

```typescript
import { useEffect, useState } from 'react';
import { animate, AnimationCancelToken } from '@lagless/animate';

function FadeInComponent({ children }) {
  const [ref, setRef] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ref) return;

    const cancelToken = animate(
      (progress) => {
        ref.style.opacity = progress.toString();
      },
      500,
      () => console.log('Component faded in')
    );

    // Cleanup: cancel animation on unmount
    return () => {
      cancelToken.cancel();
    };
  }, [ref]);

  return <div ref={setRef} style={{ opacity: 0 }}>{children}</div>;
}
```

### Custom Timing Function

```typescript
import { animate } from '@lagless/animate';

// Bounce effect (overshoots target)
const bounce: TimingFunction = (t) => {
  const c4 = (2 * Math.PI) / 3;
  return t === 0
    ? 0
    : t === 1
    ? 1
    : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
};

animate(
  (progress) => {
    element.style.transform = `scale(${progress})`;
  },
  800,
  () => console.log('Bounce animation complete'),
  bounce
);
```

## 9. Testing Guidance

No tests currently exist for this library. When adding tests, consider:

**Framework suggestion:** Vitest with `jsdom` for browser API mocking

**Test coverage priorities:**
1. **Animation timing** — Verify `draw` is called with increasing progress values
2. **Cancellation** — Verify `draw` and `onAnimationDone` are not called after `cancel()`
3. **Duration** — Verify animation completes after specified duration (use fake timers)
4. **Timing functions** — Verify easing transforms input correctly (unit test timing functions independently)

**Example test pattern:**
```typescript
import { describe, it, expect, vi } from 'vitest';
import { animate, easing } from '@lagless/animate';

describe('animate', () => {
  it('should call draw with increasing progress values', async () => {
    const draw = vi.fn();
    const onDone = vi.fn();

    animate(draw, 100, onDone);

    // Wait for animation to complete
    await new Promise(resolve => setTimeout(resolve, 150));

    expect(draw).toHaveBeenCalled();
    expect(draw.mock.calls.length).toBeGreaterThan(1);

    // Verify progress is increasing
    const progressValues = draw.mock.calls.map(call => call[0]);
    for (let i = 1; i < progressValues.length; i++) {
      expect(progressValues[i]).toBeGreaterThanOrEqual(progressValues[i - 1]);
    }

    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('should cancel animation when token.cancel() is called', async () => {
    const draw = vi.fn();
    const onDone = vi.fn();

    const cancelToken = animate(draw, 1000, onDone);
    cancelToken.cancel();

    await new Promise(resolve => setTimeout(resolve, 100));

    // Draw may have been called once before cancellation, but not after
    expect(onDone).not.toHaveBeenCalled();
  });
});
```

## 10. Change Checklist

When modifying this module:

1. **Preserve browser compatibility** — Ensure `requestAnimationFrame` and `performance.now` remain the only browser APIs used
2. **Test on high-refresh displays** — Verify animations work correctly at 120 FPS / 144 FPS
3. **Update this README:** Document new timing functions or API changes
4. **Maintain cancellation safety** — Ensure `cancel()` prevents all future callbacks
5. **Add tests:** Cover new functionality with unit tests

## 11. Integration Notes

### Used By

- **`circle-sumo-game`:**
  - UI transitions (screen fades, button animations)
  - Visual effects (particle animations, score popups)

- **React components:**
  - Fade-in effects on mount
  - Smooth transitions between states

### Common Integration Patterns

**React Hook for Fade-In:**
```typescript
import { useEffect, useRef } from 'react';
import { animate } from '@lagless/animate';

function useFadeIn(duration = 500) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;

    const element = ref.current;
    element.style.opacity = '0';

    const cancelToken = animate(
      (progress) => {
        element.style.opacity = progress.toString();
      },
      duration,
      () => console.log('Fade-in complete')
    );

    return () => cancelToken.cancel();
  }, [duration]);

  return ref;
}

// Usage
function MyComponent() {
  const fadeInRef = useFadeIn(500);
  return <div ref={fadeInRef}>Content</div>;
}
```

**Chaining Animations:**
```typescript
import { animatePromise, easingInOut } from '@lagless/animate';

async function complexAnimation(element: HTMLElement) {
  // Move right
  await animatePromise((progress) => {
    element.style.transform = `translateX(${progress * 200}px)`;
  }, 500, easingInOut);

  // Fade out
  await animatePromise((progress) => {
    element.style.opacity = (1 - progress).toString();
  }, 300);

  // Hide element
  element.style.display = 'none';
}
```

## 12. Appendix

### Timing Function Examples

**Visual representation (progress over time for 1000ms animation):**

```
Linear:
Progress
1.0 |                                        ████
    |                                ████████
    |                        ████████
    |                ████████
    |        ████████
0.0 |████████
    └────────────────────────────────────────────> Time (ms)
    0       250      500      750      1000

Easing (ease-out):
Progress
1.0 |                        ████████████████████
    |                ████████
    |            ████
    |        ████
    |    ████
0.0 |████
    └────────────────────────────────────────────> Time (ms)
    0       250      500      750      1000

EasingInOut (ease-in-out):
Progress
1.0 |                                ████████████
    |                        ████████
    |                    ████
    |                ████
    |            ████
0.0 |████████
    └────────────────────────────────────────────> Time (ms)
    0       250      500      750      1000
```

### Timing Function Formulas

**Easing (ease-out):**
```typescript
const easing = (t) => 1 - Math.sin(Math.acos(t));
```
Fast start, slow end. Commonly used for fade-ins, slide-ins.

**EasingInOut:**
```typescript
const easingInOut = makeEaseInOut(easing);

// Internally transforms:
if (t < 0.5) return easing(2 * t) / 2;        // First half: ease-in
else         return (2 - easing(2 * (1 - t))) / 2; // Second half: ease-out
```
Slow start, fast middle, slow end. Commonly used for modal transitions.

**Linear:**
```typescript
const linear = (t) => t;
```
No easing. Constant speed throughout animation.

### Cancellation Behavior

**When `cancel()` is called:**

1. `cancelToken.isCancelled` is set to `true`
2. On the next `requestAnimationFrame` callback, the check `if (cancelToken.isCancelled) return;` exits the animation loop
3. No further `draw` or `onAnimationDone` callbacks occur

**Edge case:** If `cancel()` is called while the `draw` callback is executing, that frame completes normally, but the next frame is skipped.

**Example timeline:**
```
Frame 0: draw(0.0)     [Animation starts]
Frame 1: draw(0.2)
Frame 2: draw(0.4)     [User calls cancel() during this frame]
Frame 3: [Skipped due to cancellation check]
         draw(0.6)     [NOT called]
         onAnimationDone() [NOT called]
```
