const MAX_LAYERS = 16;

export class CollisionLayers {
  private _nextBit = 0;
  private readonly _names = new Map<string, number>();
  private readonly _pairs = new Uint16Array(MAX_LAYERS); // per-layer filter mask

  /** Register a named layer, returns bit index (0..15). */
  public layer(name: string): number {
    if (this._names.has(name)) {
      throw new Error(`CollisionLayers: layer "${name}" already exists`);
    }
    if (this._nextBit >= MAX_LAYERS) {
      throw new Error(`CollisionLayers: maximum ${MAX_LAYERS} layers exceeded`);
    }
    const bit = this._nextBit++;
    this._names.set(name, bit);
    return bit;
  }

  /** Allow interactions between two layers (bidirectional). */
  public pair(a: string, b: string): this {
    const bitA = this._bit(a);
    const bitB = this._bit(b);
    this._pairs[bitA] |= (1 << bitB);
    this._pairs[bitB] |= (1 << bitA);
    return this;
  }

  /** Allow a layer to interact with itself. */
  public selfPair(name: string): this {
    const bit = this._bit(name);
    this._pairs[bit] |= (1 << bit);
    return this;
  }

  /**
   * Build Rapier InteractionGroups for a given layer name.
   * Returns u32: bits 0-15 = membership (1 << bit), bits 16-31 = filter mask.
   */
  public groups(name: string): number {
    const bit = this._bit(name);
    const membership = 1 << bit;
    const filter = this._pairs[bit];
    return (filter << 16) | membership;
  }

  /** Get bit index for a layer name. */
  public bit(name: string): number {
    return this._bit(name);
  }

  private _bit(name: string): number {
    const bit = this._names.get(name);
    if (bit === undefined) {
      throw new Error(`CollisionLayers: unknown layer "${name}"`);
    }
    return bit;
  }
}
