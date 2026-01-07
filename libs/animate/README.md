# @lagless/animate

Animation utilities for the Lagless framework. Provides frame-based animations with easing functions and cancellation support.

## Installation

```bash
pnpm add @lagless/animate
```

## Overview

This module provides:

- **animate**: Promise-based animation function
- **Easing functions**: Linear, cubic ease-in-out
- **AnimationCancelToken**: Cancellation support

## Basic Usage

```typescript
import { animate, easeInOutCubic } from '@lagless/animate';

// Animate a value from 0 to 100 over 1 second
await animate({
  duration: 1000,
  easing: easeInOutCubic,
  onUpdate: (progress) => {
    const value = progress * 100;
    element.style.opacity = String(progress);
  },
});
```

## API Reference

### animate

```typescript
interface AnimateOptions {
  duration: number;           // Duration in milliseconds
  easing?: EasingFunction;    // Default: linear
  onUpdate: (progress: number) => void;
  cancelToken?: AnimationCancelToken;
}

function animate(options: AnimateOptions): Promise<void>;
```

### Easing Functions

```typescript
// Linear (default)
const linear = (t: number) => t;

// Smooth acceleration and deceleration
const easeInOutCubic = (t: number) => {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
};
```

### AnimationCancelToken

```typescript
class AnimationCancelToken {
  cancel(): void;
  readonly isCancelled: boolean;
}
```

## Examples

### Basic Animation

```typescript
import { animate } from '@lagless/animate';

// Fade in
await animate({
  duration: 500,
  onUpdate: (t) => {
    element.style.opacity = String(t);
  },
});
```

### With Easing

```typescript
import { animate, easeInOutCubic } from '@lagless/animate';

// Smooth slide
await animate({
  duration: 300,
  easing: easeInOutCubic,
  onUpdate: (t) => {
    element.style.transform = `translateX(${t * 200}px)`;
  },
});
```

### With Cancellation

```typescript
import { animate, AnimationCancelToken } from '@lagless/animate';

const cancelToken = new AnimationCancelToken();

// Start animation
const promise = animate({
  duration: 2000,
  cancelToken,
  onUpdate: (t) => {
    // Update...
  },
});

// Cancel after 500ms
setTimeout(() => cancelToken.cancel(), 500);

// Promise resolves when cancelled or complete
await promise;
```

### Chained Animations

```typescript
// Sequence
await animate({ duration: 300, onUpdate: fadeIn });
await animate({ duration: 500, onUpdate: slideIn });
await animate({ duration: 200, onUpdate: scaleUp });
```

### Parallel Animations

```typescript
await Promise.all([
  animate({ duration: 300, onUpdate: fadeIn }),
  animate({ duration: 300, onUpdate: slideIn }),
]);
```

### Value Interpolation

```typescript
const startValue = 0;
const endValue = 100;

await animate({
  duration: 1000,
  easing: easeInOutCubic,
  onUpdate: (t) => {
    const value = startValue + (endValue - startValue) * t;
    setValue(value);
  },
});
```

### Color Interpolation

```typescript
function lerpColor(a: number[], b: number[], t: number): string {
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const b = Math.round(a[2] + (b[2] - a[2]) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

const red = [255, 0, 0];
const blue = [0, 0, 255];

await animate({
  duration: 500,
  onUpdate: (t) => {
    element.style.backgroundColor = lerpColor(red, blue, t);
  },
});
```

## Custom Easing

```typescript
// Bounce effect
const easeOutBounce = (t: number): number => {
  if (t < 1 / 2.75) {
    return 7.5625 * t * t;
  } else if (t < 2 / 2.75) {
    return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
  } else if (t < 2.5 / 2.75) {
    return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
  } else {
    return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
  }
};

await animate({
  duration: 800,
  easing: easeOutBounce,
  onUpdate: (t) => {
    element.style.transform = `translateY(${(1 - t) * 100}px)`;
  },
});
```

## Usage Notes

- Uses `requestAnimationFrame` internally
- Progress value `t` is always in range [0, 1]
- Animation completes when duration elapsed or cancelled
- Promise resolves in both cases (does not reject on cancel)
