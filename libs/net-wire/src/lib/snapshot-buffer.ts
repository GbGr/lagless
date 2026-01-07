export interface SnapshotChunk {
  readonly chunkIndex: number;
  readonly chunkCount: number;
  readonly totalBytes: number;
  readonly bytes: Uint8Array;
}

export const splitSnapshotBytes = (
  bytes: Uint8Array,
  preferredChunkSize: number
): SnapshotChunk[] => {
  if (preferredChunkSize <= 0) {
    throw new Error('preferredChunkSize must be > 0');
  }

  const totalBytes = bytes.byteLength;
  if (totalBytes === 0) {
    return [{
      chunkIndex: 0,
      chunkCount: 1,
      totalBytes: 0,
      bytes: new Uint8Array(0),
    }];
  }

  const chunkCount = Math.ceil(totalBytes / preferredChunkSize);
  const chunks: SnapshotChunk[] = [];

  for (let index = 0; index < chunkCount; index += 1) {
    const start = index * preferredChunkSize;
    const end = Math.min(start + preferredChunkSize, totalBytes);
    chunks.push({
      chunkIndex: index,
      chunkCount,
      totalBytes,
      bytes: bytes.slice(start, end),
    });
  }

  return chunks;
};

export class SnapshotAssembler {
  private readonly _chunks = new Map<number, Uint8Array>();
  private _receivedBytes = 0;

  constructor(
    public readonly chunkCount: number,
    public readonly totalBytes: number
  ) {
    if (!Number.isFinite(chunkCount) || chunkCount <= 0) {
      throw new Error('chunkCount must be > 0');
    }
    if (!Number.isFinite(totalBytes) || totalBytes < 0) {
      throw new Error('totalBytes must be >= 0');
    }
  }

  public get isComplete(): boolean {
    return this._chunks.size === this.chunkCount && this._receivedBytes === this.totalBytes;
  }

  public addChunk(index: number, bytes: Uint8Array): boolean {
    if (index < 0 || index >= this.chunkCount) {
      throw new Error(`chunkIndex ${index} out of bounds`);
    }
    if (this._chunks.has(index)) {
      return this.isComplete;
    }

    this._chunks.set(index, bytes);
    this._receivedBytes += bytes.byteLength;
    return this.isComplete;
  }

  public assemble(): Uint8Array {
    if (!this.isComplete) {
      throw new Error('Snapshot is not complete');
    }

    const result = new Uint8Array(this.totalBytes);
    let offset = 0;

    for (let index = 0; index < this.chunkCount; index += 1) {
      const chunk = this._chunks.get(index);
      if (!chunk) {
        throw new Error(`Missing chunk ${index}`);
      }

      result.set(chunk, offset);
      offset += chunk.byteLength;
    }

    if (offset !== this.totalBytes) {
      throw new Error(`Assembled bytes mismatch (${offset} != ${this.totalBytes})`);
    }

    return result;
  }
}
