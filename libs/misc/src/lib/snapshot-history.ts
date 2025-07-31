import { RingBuffer } from './ring-buffer.js';

export class SnapshotHistory<T> {
  /** circular buffer that actually stores the snapshots */
  private readonly _ring: RingBuffer<T>;

  /** tick -> ring-buffer slot index */
  private readonly _tickToSlot = new Map<number, number>();

  /** slot -> tick currently stored in that slot (or undefined if empty) */
  private readonly _slotToTick: (number | undefined)[];

  /** ticks kept **sorted asc** so we can binary-search in O(log n) */
  private readonly _orderedTicks: number[] = [];

  constructor(size: number) {
    this._slotToTick = new Array(size);
    this._ring = new RingBuffer<T>(size);
  }

  /** free every reference so the instance can be GC’d */
  public dispose(): void {
    this._ring.clear();
    this._tickToSlot.clear();
    this._orderedTicks.length = 0;
    this._slotToTick.fill(undefined);
  }

  /** store a new snapshot for a game-tick */
  public set(tick: number, snapshot: T): void {
    const slot = this._ring.add(snapshot);          // O(1)

    // if that slot was previously occupied, forget the old tick
    const overwrittenTick = this._slotToTick[slot];
    if (overwrittenTick !== undefined) {
      this._tickToSlot.delete(overwrittenTick);
      // remove overwrittenTick from the ordered list (O(log n) via binary search)
      const pos = binarySearch(this._orderedTicks, overwrittenTick);
      if (pos >= 0) this._orderedTicks.splice(pos, 1);
    }

    // wire up the new mappings
    this._tickToSlot.set(tick, slot);
    this._slotToTick[slot] = tick;
    insertSorted(this._orderedTicks, tick);          // O(n) worst-case, amortised cheap
  }

  /** exact lookup */
  public get(tick: number): T {
    const slot = this._tickToSlot.get(tick);
    if (slot === undefined) throw new Error(`Snapshot for tick ${tick} not found.`);
    const value = this._ring.get(slot);
    if (value === undefined) throw new Error(`Snapshot for tick ${tick} not found.`);
    return value;
  }

  /**
   * return the newest snapshot **strictly older** than the requested tick
   * (behaviour kept identical to the original implementation)
   */
  public getNearest(tick: number): T {
    if (this._orderedTicks.length === 0)
      throw new Error(`Unable to find snapshot for tick ${tick}.`);

    // find rightmost element < tick
    const pos = upperBound(this._orderedTicks, tick);
    if (pos === 0)
      throw new Error(`Unable to find snapshot for tick ${tick}.`);

    return this.get(this._orderedTicks[pos - 1]);
  }
}

/** binary search – returns index if found, else bitwise complement of insertion point */
function binarySearch(arr: number[], target: number): number {
  let lo = 0, hi = arr.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const v = arr[mid];
    if (v === target) return mid;
    if (v < target) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ~lo;
}

/** insert `value` keeping the array sorted asc */
function insertSorted(arr: number[], value: number): void {
  const idx = binarySearch(arr, value);
  if (idx >= 0) return;                 // already present – shouldn’t happen but cheap guard
  arr.splice(~idx, 0, value);
}

/** first index whose value is >= target; if all < target returns arr.length */
function upperBound(arr: number[], target: number): number {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] < target) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}
