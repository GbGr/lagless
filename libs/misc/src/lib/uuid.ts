// For Node.js CommonJS fallback (ignored in browsers at runtime)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const require: any | undefined;

// Precomputed lookup table for fast byte -> hex conversion
const BYTE_TO_HEX: string[] = [];
for (let i = 0; i < 256; i++) {
  BYTE_TO_HEX[i] = (i + 0x100).toString(16).substring(1);
}

// Convert a single hex character to its numeric value (0-15)
function hexCharToNibble(code: number): number {
  if (code >= 48 && code <= 57) return code - 48;
  if (code >= 97 && code <= 102) return code - 87;
  if (code >= 65 && code <= 70) return code - 55;
  return -1;
}

// Parse canonical UUID string
function uuidStringToBytes(uuid: string): Uint8Array {
  const str = uuid.toLowerCase();

  if (str.length !== 36 || str[8] !== '-' || str[13] !== '-' || str[18] !== '-' || str[23] !== '-') {
    throw new TypeError(`Invalid UUID string: "${uuid}"`);
  }

  const bytes = new Uint8Array(16);
  let byteIndex = 0;

  for (let i = 0; i < 36; ) {
    if (str[i] === '-') {
      i++;
      continue;
    }
    const c1 = hexCharToNibble(str.charCodeAt(i++));
    const c2 = hexCharToNibble(str.charCodeAt(i++));
    if (c1 < 0 || c2 < 0) throw new TypeError(`Invalid UUID string: "${uuid}"`);
    bytes[byteIndex++] = (c1 << 4) | c2;
  }

  if (byteIndex !== 16) throw new TypeError(`Invalid UUID string: "${uuid}"`);
  return bytes;
}

function bytesToUuidString(bytes: Uint8Array): string {
  if (bytes.length !== 16) throw new RangeError('UUID byte array must be 16 bytes long');
  const bth = BYTE_TO_HEX;
  return (
    bth[bytes[0]] +
    bth[bytes[1]] +
    bth[bytes[2]] +
    bth[bytes[3]] +
    '-' +
    bth[bytes[4]] +
    bth[bytes[5]] +
    '-' +
    bth[bytes[6]] +
    bth[bytes[7]] +
    '-' +
    bth[bytes[8]] +
    bth[bytes[9]] +
    '-' +
    bth[bytes[10]] +
    bth[bytes[11]] +
    bth[bytes[12]] +
    bth[bytes[13]] +
    bth[bytes[14]] +
    bth[bytes[15]]
  );
}

function getRandomBytes(target: Uint8Array): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g: any = globalThis as any;
  const cryptoObj = g.crypto || g.msCrypto;

  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    cryptoObj.getRandomValues(target);
    return;
  }

  if (typeof require === 'function') {
    try {
      const nodeCrypto = require('crypto');
      if (nodeCrypto && typeof nodeCrypto.randomFillSync === 'function') {
        nodeCrypto.randomFillSync(target);
        return;
      }
      if (nodeCrypto && typeof nodeCrypto.randomBytes === 'function') {
        const buf: Uint8Array = nodeCrypto.randomBytes(target.length);
        target.set(buf);
        return;
      }
    } catch {
      /* ignore */
    }
  }

  for (let i = 0; i < target.length; i++) {
    target[i] = (Math.random() * 256) | 0;
  }
}

/**
 * FNV-1a Hash implementation (32-bit)
 * Used to generate a signature for the masked UUID.
 * Fast and simple distribution.
 */
function fnv1a32(bytes: Uint8Array, length: number): number {
  let hash = 0x811c9dc5; // Offset basis
  for (let i = 0; i < length; i++) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 0x01000193); // FNV prime
  }
  return hash >>> 0; // Ensure unsigned 32-bit integer
}

export class UUID {
  private readonly _bytes: Uint8Array;
  private _stringCache: string | null = null;

  private constructor(bytes: Uint8Array) {
    this._bytes = bytes;
  }

  /**
   * Generate a standard random (v4) UUID.
   */
  public static generate(): UUID {
    const bytes = new Uint8Array(16);
    getRandomBytes(bytes);

    // RFC 4122 Version 4
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    // RFC 4122 Variant
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    return new UUID(bytes);
  }

  /**
   * Generate a "Masked" UUID.
   *
   * It looks like a standard v4 UUID, but the last 4 bytes (32 bits)
   * are a checksum of the first 12 bytes.
   *
   * Entropy: 90 bits (vs 122 in standard v4).
   * False positive rate: 1 in ~4.3 billion.
   */
  public static generateMasked(): UUID {
    const bytes = new Uint8Array(16);
    getRandomBytes(bytes);

    // Apply RFC 4122 flags first to ensure the hash covers the final version/variant
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    // Calculate hash of the first 12 bytes
    const hash = fnv1a32(bytes, 12);

    // Embed hash into the last 4 bytes
    bytes[12] = (hash >>> 24) & 0xff;
    bytes[13] = (hash >>> 16) & 0xff;
    bytes[14] = (hash >>> 8) & 0xff;
    bytes[15] = hash & 0xff;

    return new UUID(bytes);
  }

  /**
   * Check if a Uint8Array (16 bytes) represents a Masked UUID.
   */
  public static isMaskedUint8(bytes: Uint8Array): boolean {
    if (bytes.length !== 16) return false;

    // 1. Calculate expected hash from the first 12 bytes
    const expectedHash = fnv1a32(bytes, 12);

    // 2. Read actual hash from the last 4 bytes
    const actualHash = (bytes[12] << 24) | (bytes[13] << 16) | (bytes[14] << 8) | bytes[15];

    // 3. Compare (using unsigned shift to handle JS signed integers)
    return actualHash >>> 0 === expectedHash;
  }

  /**
   * Check if a UUID string is a Masked UUID.
   * Returns false if string is invalid or not masked.
   */
  public static isMaskedString(uuidStr: string): boolean {
    try {
      const bytes = uuidStringToBytes(uuidStr);
      return UUID.isMaskedUint8(bytes);
    } catch {
      return false;
    }
  }

  // ... (остальные методы без изменений)

  public static fromString(uuidStr: string): UUID {
    const bytes = uuidStringToBytes(uuidStr);
    return new UUID(bytes);
  }

  public static fromUint8(uuidUint8: Uint8Array): UUID {
    if (uuidUint8.length !== 16) {
      throw new RangeError('UUID byte array must be 16 bytes long');
    }
    const bytes = new Uint8Array(uuidUint8);
    return new UUID(bytes);
  }

  public asString(): string {
    if (this._stringCache === null) {
      this._stringCache = bytesToUuidString(this._bytes);
    }
    return this._stringCache;
  }

  public asUint8(): Uint8Array {
    return new Uint8Array(this._bytes);
  }
}
