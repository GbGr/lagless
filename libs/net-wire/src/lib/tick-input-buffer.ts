/**
 * Stores tick-indexed input data for late joiner synchronization.
 * Automatically prunes old entries based on retention policy.
 */
export class TickInputBuffer {
  private readonly _buffer: Map<number, Uint8Array[]> = new Map();
  private _oldestStoredTick = 0;

  public constructor(
    private readonly _maxRetentionTicks = 600 // ~10 seconds at 60fps
  ) {}

  public get oldestTick(): number {
    return this._oldestStoredTick;
  }

  public get size(): number {
    return this._buffer.size;
  }

  /**
   * Adds input data for a specific tick.
   */
  public add(tick: number, data: Uint8Array): void {
    let bucket = this._buffer.get(tick);
    if (!bucket) {
      bucket = [];
      this._buffer.set(tick, bucket);
    }
    bucket.push(data);

    if (this._oldestStoredTick === 0 || tick < this._oldestStoredTick) {
      this._oldestStoredTick = tick;
    }
  }

  /**
   * Returns all inputs from the specified tick onwards (inclusive).
   */
  public getFromTick(fromTick: number): ReadonlyMap<number, ReadonlyArray<Uint8Array>> {
    const result = new Map<number, Uint8Array[]>();
    for (const [tick, inputs] of this._buffer) {
      if (tick >= fromTick) {
        result.set(tick, [...inputs]);
      }
    }
    return result;
  }

  /**
   * Returns flattened array of all inputs from tick onwards.
   */
  public getFlattenedFromTick(fromTick: number): Uint8Array[] {
    const result: Uint8Array[] = [];
    const sortedTicks = [...this._buffer.keys()].filter(t => t >= fromTick).sort((a, b) => a - b);

    for (const tick of sortedTicks) {
      const bucket = this._buffer.get(tick);
      if (bucket) {
        result.push(...bucket);
      }
    }
    return result;
  }

  /**
   * Prunes entries older than the retention window.
   */
  public prune(currentTick: number): number {
    const threshold = currentTick - this._maxRetentionTicks;
    let pruned = 0;

    for (const tick of this._buffer.keys()) {
      if (tick < threshold) {
        this._buffer.delete(tick);
        pruned++;
      }
    }

    // Update oldest tick marker
    if (this._buffer.size === 0) {
      this._oldestStoredTick = 0;
    } else {
      this._oldestStoredTick = Math.min(...this._buffer.keys());
    }

    return pruned;
  }

  public clear(): void {
    this._buffer.clear();
    this._oldestStoredTick = 0;
  }
}
