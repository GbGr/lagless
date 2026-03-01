import { MemoryTracker } from '@lagless/binary';

const NOT_IN_FILTER = 0xFFFFFFFF;

export abstract class AbstractFilter {
  public readonly abstract includeMask: number[];
  public readonly abstract excludeMask: number[];

  protected readonly _length: Uint32Array;
  protected readonly _entities: Uint32Array;
  protected readonly _entityToIndex: Uint32Array;

  constructor(private readonly _maxEntities: number, buffer: ArrayBuffer, memoryTracker: MemoryTracker) {
    this._length = new Uint32Array(buffer, memoryTracker.ptr, 1);
    memoryTracker.add(this._length.byteLength);

    this._entities = new Uint32Array(buffer, memoryTracker.ptr, this._maxEntities);
    memoryTracker.add(this._entities.byteLength);

    this._entityToIndex = new Uint32Array(buffer, memoryTracker.ptr, this._maxEntities);
    this._entityToIndex.fill(NOT_IN_FILTER);
    memoryTracker.add(this._entityToIndex.byteLength);
  }

  public static calculateSize(maxEntities: number, memoryTracker: MemoryTracker) {
    memoryTracker.add(Uint32Array.BYTES_PER_ELEMENT); // length
    memoryTracker.add(maxEntities * Uint32Array.BYTES_PER_ELEMENT); // dense entities
    memoryTracker.add(maxEntities * Uint32Array.BYTES_PER_ELEMENT); // reverse index
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
    if (entity >= this._maxEntities || this._entityToIndex[entity] !== NOT_IN_FILTER) return;

    const idx = this._length[0];
    this._entities[idx] = entity;
    this._entityToIndex[entity] = idx;
    this._length[0] = idx + 1;
  }

  public removeEntityFromFilter(entity: number) {
    if (entity >= this._maxEntities) return;
    const idx = this._entityToIndex[entity];
    if (idx === NOT_IN_FILTER) return;

    const lastIdx = this._length[0] - 1;

    if (idx !== lastIdx) {
      const lastEntity = this._entities[lastIdx];
      this._entities[idx] = lastEntity;
      this._entityToIndex[lastEntity] = idx;
    }

    this._entityToIndex[entity] = NOT_IN_FILTER;
    this._length[0] = lastIdx;
  }

  public *[Symbol.iterator](): IterableIterator<number> {
    for (let i = 0; i < this.length; i++) {
      yield this._entities[i];
    }
  }
}
