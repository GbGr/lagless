import { MathOps } from '@lagless/math';

export interface LocomotionBlendWeights {
  forward: number;
  backward: number;
  left: number;
  right: number;
}

const _result: LocomotionBlendWeights = { forward: 0, backward: 0, left: 0, right: 0 };

export class LocomotionBlendCalculator {
  /**
   * Computes directional blend weights from angle and speed.
   * @param angle Locomotion angle in radians (-PI..PI, 0=forward)
   * @param speed Current speed
   * @param maxSpeed Maximum speed (for normalizing)
   * @returns Blend weights that sum to speedFactor (0..1)
   */
  public static compute(angle: number, speed: number, maxSpeed: number): LocomotionBlendWeights {
    if (maxSpeed <= 0 || speed <= 0) {
      _result.forward = 0;
      _result.backward = 0;
      _result.left = 0;
      _result.right = 0;
      return _result;
    }

    const speedFactor = Math.min(speed / maxSpeed, 1);
    const cosA = MathOps.cos(angle);
    const sinA = MathOps.sin(angle);

    // Forward/backward from cos, left/right from sin
    _result.forward = cosA > 0 ? cosA * speedFactor : 0;
    _result.backward = cosA < 0 ? -cosA * speedFactor : 0;
    _result.left = sinA < 0 ? -sinA * speedFactor : 0;
    _result.right = sinA > 0 ? sinA * speedFactor : 0;

    return _result;
  }
}
