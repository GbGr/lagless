export const easing: TimingFunction = (timeFraction: number) => 1 - Math.sin(Math.acos(timeFraction));
export const easingInOut: TimingFunction = makeEaseInOut(easing);
export const linear: TimingFunction = (timeFraction: number) => timeFraction;

export class AnimationCancelToken {
  private _isCancelled = false;

  public get isCancelled(): boolean {
    return this._isCancelled;
  }

  public cancel(): void {
    this._isCancelled = true;
  }
}

export const animatePromise = (draw: DrawFunction, duration: number, timing?: TimingFunction): Promise<void> => {
  return new Promise<void>((resolve) => animate(draw, duration, resolve, timing));
};

export function animate(draw: DrawFunction, duration: number, onAnimationDone: () => void, timing: TimingFunction = easing): AnimationCancelToken {
  const start = performance.now();
  const cancelToken = new AnimationCancelToken();

  if (cancelToken.isCancelled) {
    return cancelToken;
  }

  requestAnimationFrame(function animate(time) {
    if (cancelToken.isCancelled) {
      return;
    }
    let timeFraction = (time - start) / duration;
    if (timeFraction > 1) timeFraction = 1;
    const progress = timing(timeFraction);

    draw(progress);

    if (timeFraction < 1) {
      requestAnimationFrame(animate);
    } else if (onAnimationDone) {
      onAnimationDone();
    }
  });

  return cancelToken;
}

function makeEaseInOut(timing: TimingFunction): TimingFunction {
  return function(timeFraction): number {
    if (timeFraction < .5)
      return timing(2 * timeFraction) / 2;
    else
      return (2 - timing(2 * (1 - timeFraction))) / 2;
  };
}

export type TimingFunction = (timeFraction: number) => number;
type DrawFunction = (progress: number) => void;
