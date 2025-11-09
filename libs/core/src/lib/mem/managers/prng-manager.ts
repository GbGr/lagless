import { MemoryTracker } from '@lagless/binary';
import { ECSConfig, RawSeed } from '../../ecs-config.js';
import { IAbstractMemory } from '../abstract-memory.interface.js';

const STATE_TYPED_ARRAY_LENGTH = 4;

export class PRNG {
  /** Parse UUID string (with or without dashes) into 16 bytes. Throws on invalid input. */
  public static uuidToBytes16(uuid: string): Uint8Array {
    const hex = uuid.replace(/-/g, '').toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(hex)) throw new Error('Invalid UUID string.');
    const out = new Uint8Array(16);
    for (let i = 0; i < 16; i++) {
      const hi = parseInt(hex.slice(i * 2, i * 2 + 1), 16);
      const lo = parseInt(hex.slice(i * 2 + 1, i * 2 + 2), 16);
      out[i] = (hi << 4) | lo;
    }
    return out;
  }

  constructor(private readonly _PRNGManager: PRNGManager) {}

  public getFloat(): number {
    return this._PRNGManager.getFloat();
  }

  public getFloat53(): number {
    return this._PRNGManager.getFloat53();
  }

  public getRandomInt(from: number, to: number): number {
    return this._PRNGManager.getRandomInt(from, to);
  }

  public getRandomIntInclusive(from: number, to: number): number {
    return this._PRNGManager.getRandomIntInclusive(from, to);
  }
}

export class PRNGManager implements IAbstractMemory {
  private _state!: Uint32Array; // s0,s1,s2,s3
  public readonly prng: PRNG;

  private readonly _tmpSeedBuffer = new Uint8Array(16);

  constructor(
    private readonly _ECSConfig: ECSConfig,
  ) {
    this.prng = new PRNG(this);
  }

  public init(arrayBuffer: ArrayBuffer, tracker: MemoryTracker): void {
    this._state = new Uint32Array(arrayBuffer, tracker.ptr, STATE_TYPED_ARRAY_LENGTH);
    tracker.add(this._state.byteLength);

    // Accept various seed inputs:
    // - this._ECSConfig.seed may be: number | Uint32Array(4) | Uint8Array(16) | string (UUID)
    this.seed128(this._ECSConfig.seed);
  }

  public calculateSize(tracker: MemoryTracker): void {
    tracker.add(Uint32Array.BYTES_PER_ELEMENT * STATE_TYPED_ARRAY_LENGTH);
  }

  /** Returns a uniform float in [0, 1). Uses 32 random bits. */
  public getFloat(): number {
    // Division by 2^32 gives a uniform grid on IEEE-754; good enough for most gameplay.
    return this.nextUint32() / 0x1_0000_0000;
  }

  /** Returns a float in [0, 1) using 53 bits of randomness (two 32-bit draws). */
  public getFloat53(): number {
    // Combine two draws into a 53-bit mantissa: (hi << 27) | (lo >>> 5), then / 2^53
    const hi = this.nextUint32() >>> 5;  // 27 bits
    const lo = this.nextUint32() >>> 6;  // 26 bits
    return (hi * 0x4000000 + lo) / 0x2000_0000_0000_00; // 2^26 + 2^53 denominator
  }

  /** Returns integer in [from, to) without modulo bias. */
  public getRandomInt(from: number, to: number): number {
    if (to <= from) throw new Error(`Invalid range: from (${from}) >= to (${to})`);
    const span = (to - from) >>> 0;
    const lim = (0x1_0000_0000 - span) % span; // rejection threshold
    let x: number;
    do {
      x = this.nextUint32();
    } while ((x >>> 0) < lim);
    return from + (x % span);
  }

  /** Returns integer in [from, to] without modulo bias. */
  public getRandomIntInclusive(from: number, to: number): number {
    if (to < from) throw new Error(`Invalid range: from (${from}) > to (${to})`);
    // Map to [0, span) then add 'from'
    return this.getRandomInt(from, to + 1);
  }

  // ---------- Seeding ----------

  /** Seed from 128 bits: Uint32Array(4) | Uint8Array(16) | string (UUID) | number fallback. */
  private seed128(seed: RawSeed): void {
    const s = this._state;

    this._tmpSeedBuffer.set(seed);

    const a = readU32LE(this._tmpSeedBuffer, 0);
    const b = readU32LE(this._tmpSeedBuffer, 4);
    const c = readU32LE(this._tmpSeedBuffer, 8);
    const d = readU32LE(this._tmpSeedBuffer, 12);

    // Scramble each word to avoid weak seeds and reduce correlation.
    s[0] = mix32(a);
    s[1] = mix32(b);
    s[2] = mix32(c);
    s[3] = mix32(d);

    // xoshiro requires a non-zero state; if all zero, fixup with a constant.
    if ((s[0] | s[1] | s[2] | s[3]) === 0) {
      // Use a fixed odd constant pattern then mix again.
      s[0] = mix32(0xA3C59AC3); s[1] = mix32(0x3C6EF372);
      s[2] = mix32(0x9E3779B9); s[3] = mix32(0xBB67AE85);
    }
  }

  // ---------- Core generator: xoshiro128** ----------

  /** Core step: returns next uint32. */
  private nextUint32(): number {
    // Output function for xoshiro128**: rotl(s1 * 5, 7) * 9
    const s = this._state;
    const result = rotl32(Math.imul(s[1] * 5, 1) >>> 0, 7);
    const out = Math.imul(result, 9) >>> 0;

    // State transition (xoshiro128 family)
    const t = (s[1] << 9) >>> 0;

    s[2] ^= s[0];
    s[3] ^= s[1];
    s[1] ^= s[2];
    s[0] ^= s[3];

    s[2] ^= t;
    s[3] = rotl32(s[3], 11);

    return out >>> 0;
  }
}

const SEED_2x64_TYPED_ARRAY = new Float64Array(2);
export const seedFrom2x64 = (seed0: number, seed1: number): RawSeed => {
  const seed = new Uint8Array(16);
  SEED_2x64_TYPED_ARRAY[0] = seed0;
  SEED_2x64_TYPED_ARRAY[1] = seed1;
  const seedBytes = new Uint8Array(SEED_2x64_TYPED_ARRAY.buffer);
  seed.set(seedBytes);
  return seed as unknown as RawSeed;
}

export const generate2x64Seed = (): [ number, number ] => {
  return [ Math.random(), Math.random() ];
};

// ---------- Helper functions (pure, inlineable) ----------

/** 32-bit left rotate. */
function rotl32(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

/** Strong 32-bit mixer (Murmur3 finalizer). */
function mix32(x: number): number {
  x >>>= 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x85ebca6b) >>> 0;
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35) >>> 0;
  x ^= x >>> 16;
  return x >>> 0;
}

/** Read little-endian u32 from bytes[offset..offset+3]. */
function readU32LE(bytes: Uint8Array, off: number): number {
  return (
    bytes[off] |
    (bytes[off + 1] << 8) |
    (bytes[off + 2] << 16) |
    (bytes[off + 3] << 24)
  ) >>> 0;
}
