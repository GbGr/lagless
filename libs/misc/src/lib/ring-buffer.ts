export class RingBuffer<T> {
  protected readonly _buffer = new Array<T>;
  protected readonly _size: number;
  private _pos = 0;

  constructor(size: number) {
    if (size < 0) {
      throw new RangeError('The size does not allow negative values.');
    }
    this._size = size;
  }

  public add(item: T): number {
    const insertAtIdx = this._pos;
    this._buffer[insertAtIdx] = item;
    this._pos = (insertAtIdx + 1) % this._size;

    return insertAtIdx;
  }

  public get(atIdx: number): T | undefined {
    return this._buffer[atIdx];
  }

  public [Symbol.iterator]() {
    return this._buffer[Symbol.iterator]();
  }

  public clear(): void {
    this._buffer.length = 0;
    this._pos = 0;
  }
}
