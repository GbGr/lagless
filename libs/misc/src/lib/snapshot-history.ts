export class SnapshotHistory<T> {
  private readonly _maxSize: number;
  private readonly _ticks: number[];
  private readonly _snapshots: (T | undefined)[];

  // Index of the oldest element in the ring buffer
  private _head = 0;
  // Number of stored elements (<= maxSize)
  private _count = 0;
  // Last inserted tick (to enforce monotonicity)
  private _lastTick = -Infinity;

  constructor(maxSize: number) {
    if (!Number.isInteger(maxSize) || maxSize <= 0) {
      throw new Error('maxSize must be a positive integer');
    }

    this._maxSize = maxSize;
    this._ticks = new Array<number>(maxSize);
    this._snapshots = new Array<T | undefined>(maxSize);
  }

  public set(tick: number, snapshot: T): void {
    // Enforce non-decreasing ticks for fast structure
    if (tick < this._lastTick) {
      throw new Error('Ticks must be non-decreasing. Call rollback() before writing older ticks.');
    }

    // If tick is the same as last one - just overwrite the last snapshot
    if (tick === this._lastTick && this._count > 0) {
      const lastLogicalIndex = this._count - 1;
      const lastPhysicalIndex = this.indexAt(lastLogicalIndex);
      this._ticks[lastPhysicalIndex] = tick;
      this._snapshots[lastPhysicalIndex] = snapshot;
      return;
    }

    this._lastTick = tick;

    // Choose physical index where we will write new snapshot
    let idx: number;
    if (this._count < this._maxSize) {
      // There is still free space: append after the last element
      idx = this.indexAt(this._count);
      this._count++;
    } else {
      // Buffer is full: overwrite the oldest element (at head)
      idx = this._head;
      // Move head forward
      this._head = (this._head + 1) % this._maxSize;
    }

    this._ticks[idx] = tick;
    this._snapshots[idx] = snapshot;
  }

  public getNearest(tick: number): T {
    if (this._count === 0) {
      throw new Error('History is empty');
    }

    // Smallest tick (oldest snapshot)
    const firstTick = this._ticks[this.indexAt(0)];
    if (tick <= firstTick) {
      // No snapshot with tick < requested tick
      throw new Error('No snapshot with tick less than requested');
    }

    // Standard binary search for the greatest tick < requested tick
    let left = 0;
    let right = this._count - 1;
    let resultLogicalIndex = -1;

    while (left <= right) {
      const mid = (left + right) >>> 1; // floor((left + right) / 2)
      const midTick = this._ticks[this.indexAt(mid)];

      if (midTick < tick) {
        // Candidate: move right to find a closer one
        resultLogicalIndex = mid;
        left = mid + 1;
      } else {
        // midTick >= tick, we need smaller ticks
        right = mid - 1;
      }
    }

    if (resultLogicalIndex === -1) {
      throw new Error('No snapshot with tick less than requested');
    }

    const idx = this.indexAt(resultLogicalIndex);
    return this._snapshots[idx] as T;
  }

  /**
   * Remove all snapshots with tick >= given tick.
   * After this call you can safely write new snapshots starting from that tick.
   */
  public rollback(tick: number): void {
    if (this._count === 0) {
      this._lastTick = -Infinity;
      return;
    }

    // Find first logical index where tick >= given one
    let left = 0;
    let right = this._count - 1;
    let firstToDrop = this._count; // default: nothing to drop

    while (left <= right) {
      const mid = (left + right) >>> 1;
      const midTick = this._ticks[this.indexAt(mid)];

      if (midTick >= tick) {
        firstToDrop = mid;
        right = mid - 1;
      } else {
        left = mid + 1;
      }
    }

    // Keep elements [0, firstToDrop)
    this._count = firstToDrop;

    if (this._count === 0) {
      this._lastTick = -Infinity;
    } else {
      this._lastTick = this._ticks[this.indexAt(this._count - 1)];
    }
  }

  // Convert logical index [0..count) to physical index in ring buffer
  private indexAt(logicalIndex: number): number {
    // logicalIndex 0 corresponds to head
    const idx = this._head + logicalIndex;
    return idx >= this._maxSize ? idx - this._maxSize : idx;
  }
}
