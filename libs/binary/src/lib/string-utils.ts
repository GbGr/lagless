import { LE } from './binary.js';

export interface StringEncodeResult {
  buffer: Uint8Array;
  truncated: boolean;
}

/**
 * Encodes a JS string into a fixed-size Uint8Array using BMP-only UTF-16 (2 bytes per character).
 * Non-BMP characters (emoji, surrogate pairs) are replaced with '?'.
 * Remaining bytes are zero-filled. Decode with `decodeStringFromUint8`.
 *
 * @param str       — source string
 * @param maxBytes  — buffer size in bytes (must be even, >= 2). maxBytes / 2 = max characters.
 * @returns         — { buffer, truncated }
 */
export function encodeStringToUint8(str: string, maxBytes: number): StringEncodeResult {
  if (maxBytes < 2) throw new Error('maxBytes must be at least 2');
  if (maxBytes % 2 !== 0) throw new Error('maxBytes must be even (2 bytes per character)');

  const maxChars = maxBytes / 2;
  const buffer = new Uint8Array(maxBytes);
  const view = new DataView(buffer.buffer);

  let written = 0;
  let i = 0;

  while (i < str.length && written < maxChars) {
    const code = str.charCodeAt(i);

    if (code >= 0xD800 && code <= 0xDBFF) {
      // High surrogate — skip the pair, write '?'
      view.setUint16(written * 2, 0x003F, LE);
      written++;
      i += 2;
    } else if (code >= 0xDC00 && code <= 0xDFFF) {
      // Lone low surrogate — write '?'
      view.setUint16(written * 2, 0x003F, LE);
      written++;
      i++;
    } else {
      view.setUint16(written * 2, code, LE);
      written++;
      i++;
    }
  }

  return { buffer, truncated: i < str.length };
}

/**
 * Decodes a Uint8Array (produced by `encodeStringToUint8`) back into a JS string.
 * Reads BMP UTF-16 code units (2 bytes each, LE) until first 0x0000 or end of buffer.
 */
export function decodeStringFromUint8(buffer: Uint8Array): string {
  if (buffer.length % 2 !== 0) throw new Error('Buffer length must be even (2 bytes per character)');

  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const chars: number[] = [];

  for (let i = 0; i < buffer.length; i += 2) {
    const code = view.getUint16(i, LE);
    if (code === 0) break;
    chars.push(code);
  }

  return String.fromCharCode(...chars);
}
