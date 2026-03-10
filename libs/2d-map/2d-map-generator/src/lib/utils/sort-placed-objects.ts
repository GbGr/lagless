import type { PlacedObject } from '../types/placed-object.js';

export function sortPlacedObjects(objects: readonly PlacedObject[]): PlacedObject[] {
  return [...objects].sort((a, b) => a.posY - b.posY || a.posX - b.posX);
}
