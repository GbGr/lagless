const INTERPOLATION_RESULT_BUFFER = { x: 0, y: 0, rotation: 0 };

const BASE_TELEPORT_THRESHOLD = 300;

interface Transform2dCursorLike {
  positionX: number;
  positionY: number;
  rotation: number;
  prevPositionX: number;
  prevPositionY: number;
  prevRotation: number;
}

export const interpolateTransform2dToRef = (
  prevPositionX: number,
  prevPositionY: number,
  positionX: number,
  positionY: number,
  prevRotation: number,
  rotation: number,
  interpolationFactor: number,
  ref: { x: number; y: number; rotation: number },
  teleportThresholdSquared = BASE_TELEPORT_THRESHOLD,
): void => {
  const dx = positionX - prevPositionX;
  const dy = positionY - prevPositionY;
  const distanceSquared = dx * dx + dy * dy;

  if (distanceSquared >= teleportThresholdSquared * teleportThresholdSquared) {
    ref.x = positionX;
    ref.y = positionY;
    ref.rotation = rotation;
  } else {
    ref.x = prevPositionX + dx * interpolationFactor;
    ref.y = -(prevPositionY + dy * interpolationFactor);
    ref.rotation = -(prevRotation + (rotation - prevRotation) * interpolationFactor);
  }
};

export const interpolateTransform2d = (
  prevPositionX: number,
  prevPositionY: number,
  positionX: number,
  positionY: number,
  prevRotation: number,
  rotation: number,
  interpolationFactor: number
): { readonly x: number; readonly y: number; readonly rotation: number } => {
  interpolateTransform2dToRef(
    prevPositionX,
    prevPositionY,
    positionX,
    positionY,
    prevRotation,
    rotation,
    interpolationFactor,
    INTERPOLATION_RESULT_BUFFER
  );

  return INTERPOLATION_RESULT_BUFFER;
}

export const interpolateTransform2dCursor = (
  cursor: Transform2dCursorLike,
  interpolationFactor: number,
): { readonly x: number; readonly y: number; readonly rotation: number } => {
  return interpolateTransform2d(
    cursor.prevPositionX,
    cursor.prevPositionY,
    cursor.positionX,
    cursor.positionY,
    cursor.prevRotation,
    cursor.rotation,
    interpolationFactor
  );
}

export const interpolateTransform2dCursorToRef = (
  cursor: Transform2dCursorLike,
  interpolationFactor: number,
  ref: { x: number; y: number; rotation: number },
): void => {
  interpolateTransform2dToRef(
    cursor.prevPositionX,
    cursor.prevPositionY,
    cursor.positionX,
    cursor.positionY,
    cursor.prevRotation,
    cursor.rotation,
    interpolationFactor,
    ref
  );
}
