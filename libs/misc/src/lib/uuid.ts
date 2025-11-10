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
  // '0' - '9'
  if (code >= 48 && code <= 57) return code - 48;
  // 'a' - 'f'
  if (code >= 97 && code <= 102) return code - 87;
  // 'A' - 'F'
  if (code >= 65 && code <= 70) return code - 55;
  return -1;
}

// Parse canonical UUID string: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
function uuidStringToBytes(uuid: string): Uint8Array {
  const str = uuid.toLowerCase();

  if (
    str.length !== 36 ||
    str[8] !== '-' ||
    str[13] !== '-' ||
    str[18] !== '-' ||
    str[23] !== '-'
  ) {
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

    if (c1 < 0 || c2 < 0) {
      throw new TypeError(`Invalid UUID string: "${uuid}"`);
    }

    bytes[byteIndex++] = (c1 << 4) | c2;
  }

  if (byteIndex !== 16) {
    throw new TypeError(`Invalid UUID string: "${uuid}"`);
  }

  return bytes;
}

// Convert 16 bytes to canonical UUID string
function bytesToUuidString(bytes: Uint8Array): string {
  if (bytes.length !== 16) {
    throw new RangeError('UUID byte array must be 16 bytes long');
  }

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

// Fill target with random bytes, using the best available source
function getRandomBytes(target: Uint8Array): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g: any = globalThis as any;
  const cryptoObj = g.crypto || g.msCrypto;

  // Browser / modern Node (WebCrypto) path
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    cryptoObj.getRandomValues(target);
    return;
  }

  // Node.js CommonJS fallback
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
      // Ignore and fall through to Math.random()
    }
  }

  // Non-cryptographic last-resort fallback
  for (let i = 0; i < target.length; i++) {
    target[i] = (Math.random() * 256) | 0;
  }
}

/**
 * RFC 4122 version 4 UUID wrapper.
 *
 * Works in both Node.js and browsers.
 */
export class UUID {
  private readonly _bytes: Uint8Array;
  private _stringCache: string | null = null;

  private constructor(bytes: Uint8Array) {
    this._bytes = bytes;
  }

  /**
   * Generate a new random (v4) UUID.
   */
  public static generate(): UUID {
    const bytes = new Uint8Array(16);
    getRandomBytes(bytes);

    // Per RFC 4122: set version to 4 (random)
    bytes[6] = (bytes[6] & 0x0f) | 0x40;

    // Set variant to RFC 4122 (10xx)
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    return new UUID(bytes);
  }

  /**
   * Create a UUID from a canonical string representation.
   * Example: "123e4567-e89b-12d3-a456-426614174000"
   */
  public static fromString(uuidStr: string): UUID {
    const bytes = uuidStringToBytes(uuidStr);
    return new UUID(bytes);
  }

  /**
   * Create a UUID from a 16-byte Uint8Array.
   */
  public static fromUint8(uuidUint8: Uint8Array): UUID {
    if (uuidUint8.length !== 16) {
      throw new RangeError('UUID byte array must be 16 bytes long');
    }

    // Copy to prevent external mutation
    const bytes = new Uint8Array(uuidUint8);
    return new UUID(bytes);
  }

  /**
   * Get the canonical string representation (lowercase, with hyphens).
   */
  public asString(): string {
    if (this._stringCache === null) {
      this._stringCache = bytesToUuidString(this._bytes);
    }
    return this._stringCache;
  }

  /**
   * Get a copy of the raw 16-byte representation.
   */
  public asUint8(): Uint8Array {
    return new Uint8Array(this._bytes);
  }
}
