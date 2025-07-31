import { MemoryTracker } from '@lagless/misc';

export interface IAbstractMemory {
  init(arrayBuffer: ArrayBuffer, tracker: MemoryTracker): void;
  calculateSize(tracker: MemoryTracker): void;
}
