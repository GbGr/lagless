import { MemoryTracker } from '@lagless/binary';

export abstract class AbstractFilter {
  public readonly abstract includeMask: number;
  public readonly abstract excludeMask: number;

  protected readonly _length: Uint32Array;
  protected readonly _entities: Uint32Array;

  constructor(private readonly _maxEntities: number, buffer: ArrayBuffer, memoryTracker: MemoryTracker) {
    this._length = new Uint32Array(buffer, memoryTracker.ptr, 1);
    memoryTracker.add(this._length.byteLength);
    this._entities = new Uint32Array(buffer, memoryTracker.ptr, this._maxEntities);
    memoryTracker.add(this._entities.byteLength);
  }

  public static calculateSize(maxEntities: number, memoryTracker: MemoryTracker) {
    memoryTracker.add(Uint32Array.BYTES_PER_ELEMENT); // for length
    memoryTracker.add(maxEntities * Uint32Array.BYTES_PER_ELEMENT);
  }

  public get length() {
    return this._length[0];
  }

  protected set length(value: number) {
    if (value < 0 || value > this._entities.length) {
      throw new Error('Invalid length value');
    }
    this._length[0] = value;
  }

  public addEntityToFilter(entity: number) {
    const entityIdx = this._entities.indexOf(entity);
    if (entityIdx !== -1 && entityIdx < this.length) return; // Entity already in filter

    this._entities[this.length] = entity;
    this.length++;
  }

  public removeEntityFromFilter(entity: number) {
    const entityIdx = this._entities.indexOf(entity);
    if (entityIdx === -1 || entityIdx >= this.length) return; // Entity not in filter

    const lastIndex = this.length - 1;

    if (entityIdx !== lastIndex) {
      this._entities[entityIdx] = this._entities[lastIndex];
    }

    this.length--;
  }

  public *[Symbol.iterator](): IterableIterator<number> {
    for (let i = 0; i < this.length; i++) {
      yield this._entities[i];
    }
  }
}
