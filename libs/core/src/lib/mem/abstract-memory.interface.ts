import { MemoryTracker } from '@lagless/binary';

export interface IAbstractMemory {
  init(arrayBuffer: ArrayBuffer, tracker: MemoryTracker): void;
  calculateSize(tracker: MemoryTracker): void;
}
