export const UNMAPPED_ENTITY = -1;
const DEFAULT_CAPACITY = 256;

// Reinterpret float64 bit pattern → uint32 index (low 32 bits of IEEE 754)
const _f64 = new Float64Array(1);
const _u32 = new Uint32Array(_f64.buffer);

export function handleToIndex(handle: number): number {
  _f64[0] = handle;
  return _u32[0]; // low 32 bits = Rapier arena index
}

export class ColliderEntityMap {
  private _map: Int32Array;

  constructor(initialCapacity: number = DEFAULT_CAPACITY) {
    this._map = new Int32Array(initialCapacity).fill(UNMAPPED_ENTITY);
  }

  public set(colliderHandle: number, entity: number): void {
    const idx = handleToIndex(colliderHandle);
    if (idx >= this._map.length) {
      this._grow(idx + 1);
    }
    this._map[idx] = entity;
  }

  public get(colliderHandle: number): number {
    const idx = handleToIndex(colliderHandle);
    if (idx >= this._map.length) return UNMAPPED_ENTITY;
    return this._map[idx];
  }

  public delete(colliderHandle: number): void {
    const idx = handleToIndex(colliderHandle);
    if (idx < this._map.length) {
      this._map[idx] = UNMAPPED_ENTITY;
    }
  }

  public clear(): void {
    this._map.fill(UNMAPPED_ENTITY);
  }

  private _grow(minCapacity: number): void {
    const newCapacity = Math.max(minCapacity, this._map.length * 2);
    const newMap = new Int32Array(newCapacity).fill(UNMAPPED_ENTITY);
    newMap.set(this._map);
    this._map = newMap;
  }
}
