import { CollisionEventsBase } from '@lagless/physics-shared';
import type { RapierModule3d } from './rapier-types-3d.js';

export class CollisionEvents3d extends CollisionEventsBase {
  constructor(rapier: RapierModule3d, initialCapacity?: number) {
    super(rapier.EventQueue, initialCapacity);
  }
}
