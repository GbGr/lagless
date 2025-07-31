import { MemoryTracker } from '@lagless/misc';
import { TypedArray, TypedArrayConstructor } from '@lagless/types';

export interface IPhysicsRefsComponentConstructor {
  name: string;
  ID: number;
  schema: Record<string, TypedArrayConstructor>;
  calculateSize(maxEntities: number, memTracker: MemoryTracker): void;
  new (maxEntities: number, buffer: ArrayBuffer, memTracker: MemoryTracker): IPhysicsRefsComponent;
}

export interface IPhysicsRefsComponent {
  unsafe: {
    colliderRefs: TypedArray;
    rigidBodyRefs: TypedArray;
    hasRigidBody: TypedArray;
  };
}

