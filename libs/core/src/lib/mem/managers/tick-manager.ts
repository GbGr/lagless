import { MemoryTracker } from '@lagless/binary';
import { IAbstractMemory } from '../abstract-memory.interface.js';

export class TickManager implements IAbstractMemory {
  private _tickTypedArray!: Uint32Array;

  public get tick(): number {
    return this._tickTypedArray[0];
  }

  public setTick(tick: number): void {
    this._tickTypedArray[0] = tick;
  }

  public init(arrayBuffer: ArrayBuffer, tracker: MemoryTracker): void {
    this._tickTypedArray = new Uint32Array(arrayBuffer, tracker.ptr, 1);
    tracker.add(Uint32Array.BYTES_PER_ELEMENT);
    this._tickTypedArray[0] = 0;
  }

  public calculateSize(tracker: MemoryTracker): void {
    tracker.add(Uint32Array.BYTES_PER_ELEMENT);
  }
}
