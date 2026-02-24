import { CollisionEventsBase } from '@lagless/physics-shared';
import type { RapierModule2d } from './rapier-types-2d.js';

export class CollisionEvents2d extends CollisionEventsBase {
  constructor(rapier: RapierModule2d, initialCapacity?: number) {
    super(rapier.EventQueue, initialCapacity);
  }
}
