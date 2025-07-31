export function align8(value: number): number {
  return (value + 7) & ~7;
}

export class MemoryTracker {
  private _ptr: number;

  public get ptr(): number {
    return this._ptr;
  }

  constructor(initialOffset = 0) {
    this._ptr = initialOffset;
  }

  public add(byteLength: number) {
    this._ptr += align8(byteLength);

    return this._ptr;
  }
}

const FLOAT32_BUFFER = new Float32Array(1);

export const toFP = (value: number): number => {
  FLOAT32_BUFFER[0] = value;
  return FLOAT32_BUFFER[0];
};
