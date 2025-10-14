import cos from '@stdlib/math-base-special-cos';
import sin from '@stdlib/math-base-special-sin';
import atan2 from '@stdlib/math-base-special-atan2';
import acos from '@stdlib/math-base-special-acos';

export class MathOps {
  public static PI = 3.141592653589793;
  public static PI_2 = 6.283185307179586;
  public static PI_HALF = 1.5707963267948966;
  public static Deg2Rad = 3.141592653589793 / 180;
  public static Rad2Deg = 180 / 3.141592653589793;

  public static clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
  }

  public static clamp01(value: number): number {
    return Math.min(1, Math.max(0, value));
  }

  public static cos(angle: number): number {
    return cos(angle);
  }

  public static sin(angle: number): number {
    return sin(angle);
  }

  public static atan2(y: number, x: number): number {
    return atan2(y, x);
  }

  public static acos(value: number): number {
    return acos(value);
  }

  public static lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  public static repeat(t: number, length: number): number {
    return t - Math.floor(t / length) * length;
  }

  public static lerpAngle(a: number, b: number, t: number): number {
    let num = MathOps.repeat(b - a, this.PI_2);
    if (num > this.PI) {
      num -= this.PI_2;
    }
    return a + num * t;
  }

  public static normalizeAngle(angle: number): number {
    return ((angle + this.PI) % (2 * this.PI)) - this.PI;
  }

  public static smoothRotate(
    rotation: number,
    targetRotation: number,
    rotationSpeed: number,
  ): number {

    const current = this.normalizeAngle(rotation);
    const target = this.normalizeAngle(targetRotation);

    let delta = target - current;
    if (delta > this.PI) delta -= 2 * this.PI;
    if (delta < -this.PI) delta += 2 * this.PI;

    // Clamp rotation change based on rotation speed and delta time
    const maxRotation = rotationSpeed;
    const clampedDelta = Math.max(-maxRotation, Math.min(maxRotation, delta));

    return this.normalizeAngle(current + clampedDelta);
  }
}
