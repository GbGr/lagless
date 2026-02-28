import { MathOps } from '@lagless/math';

const INTERPOLATION_RESULT_BUFFER = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, rotW: 1 };

const BASE_TELEPORT_THRESHOLD = 300;

export interface Transform3dInterpolationResult {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly rotX: number;
  readonly rotY: number;
  readonly rotZ: number;
  readonly rotW: number;
}

export const interpolateTransform3dToRef = (
  prevPosX: number, prevPosY: number, prevPosZ: number,
  posX: number, posY: number, posZ: number,
  prevRotX: number, prevRotY: number, prevRotZ: number, prevRotW: number,
  rotX: number, rotY: number, rotZ: number, rotW: number,
  interpolationFactor: number,
  ref: { x: number; y: number; z: number; rotX: number; rotY: number; rotZ: number; rotW: number },
  teleportThreshold = BASE_TELEPORT_THRESHOLD,
): void => {
  const dx = posX - prevPosX;
  const dy = posY - prevPosY;
  const dz = posZ - prevPosZ;
  const distanceSquared = dx * dx + dy * dy + dz * dz;

  if (distanceSquared >= teleportThreshold * teleportThreshold) {
    ref.x = posX;
    ref.y = posY;
    ref.z = posZ;
    ref.rotX = rotX;
    ref.rotY = rotY;
    ref.rotZ = rotZ;
    ref.rotW = rotW;
  } else {
    ref.x = prevPosX + dx * interpolationFactor;
    ref.y = prevPosY + dy * interpolationFactor;
    ref.z = prevPosZ + dz * interpolationFactor;
    slerpToRef(
      prevRotX, prevRotY, prevRotZ, prevRotW,
      rotX, rotY, rotZ, rotW,
      interpolationFactor, ref,
    );
  }
};

export const interpolateTransform3d = (
  prevPosX: number, prevPosY: number, prevPosZ: number,
  posX: number, posY: number, posZ: number,
  prevRotX: number, prevRotY: number, prevRotZ: number, prevRotW: number,
  rotX: number, rotY: number, rotZ: number, rotW: number,
  interpolationFactor: number,
): Transform3dInterpolationResult => {
  interpolateTransform3dToRef(
    prevPosX, prevPosY, prevPosZ,
    posX, posY, posZ,
    prevRotX, prevRotY, prevRotZ, prevRotW,
    rotX, rotY, rotZ, rotW,
    interpolationFactor,
    INTERPOLATION_RESULT_BUFFER,
  );
  return INTERPOLATION_RESULT_BUFFER;
};

/** Inline quaternion slerp writing to ref (rotX/Y/Z/W fields). */
function slerpToRef(
  ax: number, ay: number, az: number, aw: number,
  bx: number, by: number, bz: number, bw: number,
  t: number,
  ref: { rotX: number; rotY: number; rotZ: number; rotW: number },
): void {
  let cosOmega = ax * bx + ay * by + az * bz + aw * bw;
  if (cosOmega < 0) {
    cosOmega = -cosOmega;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }

  let s0: number, s1: number;
  if (cosOmega > 1 - 1e-8) {
    s0 = 1 - t;
    s1 = t;
  } else {
    const sinOmega = MathOps.sqrt(1 - cosOmega * cosOmega);
    const omega = MathOps.atan2(sinOmega, cosOmega);
    const invSin = 1 / sinOmega;
    s0 = MathOps.sin((1 - t) * omega) * invSin;
    s1 = MathOps.sin(t * omega) * invSin;
  }

  ref.rotX = s0 * ax + s1 * bx;
  ref.rotY = s0 * ay + s1 * by;
  ref.rotZ = s0 * az + s1 * bz;
  ref.rotW = s0 * aw + s1 * bw;
}
