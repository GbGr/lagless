import { describe, it, expect } from 'vitest';
import { encodeStringToUint8, decodeStringFromUint8 } from './string-utils.js';

describe('encodeStringToUint8', () => {
  it('should encode ASCII string', () => {
    const { buffer, truncated } = encodeStringToUint8('Hello', 16);
    expect(truncated).toBe(false);
    expect(buffer.length).toBe(16);
    expect(decodeStringFromUint8(buffer)).toBe('Hello');
  });

  it('should encode Cyrillic string', () => {
    const { buffer, truncated } = encodeStringToUint8('Привет', 16);
    expect(truncated).toBe(false);
    expect(decodeStringFromUint8(buffer)).toBe('Привет');
  });

  it('should encode mixed ASCII and Cyrillic', () => {
    const { buffer } = encodeStringToUint8('Hi Мир', 16);
    expect(decodeStringFromUint8(buffer)).toBe('Hi Мир');
  });

  it('should truncate when string exceeds maxBytes', () => {
    // maxBytes=6 → 3 chars max
    const { buffer, truncated } = encodeStringToUint8('Hello', 6);
    expect(truncated).toBe(true);
    expect(decodeStringFromUint8(buffer)).toBe('Hel');
  });

  it('should handle exact fit (no null terminator needed)', () => {
    // maxBytes=10 → 5 chars max, "Hello" is exactly 5
    const { buffer, truncated } = encodeStringToUint8('Hello', 10);
    expect(truncated).toBe(false);
    expect(decodeStringFromUint8(buffer)).toBe('Hello');
  });

  it('should replace emoji (surrogate pairs) with ?', () => {
    const { buffer } = encodeStringToUint8('A😀B', 10);
    expect(decodeStringFromUint8(buffer)).toBe('A?B');
  });

  it('should replace multiple emoji with ?', () => {
    const { buffer } = encodeStringToUint8('👨‍👩‍👧‍👦', 32);
    // Family emoji = 👨 ZWJ 👩 ZWJ 👧 ZWJ 👦 = 7 code points, 4 surrogates + 3 ZWJ
    // Surrogates → ?, ZWJ (U+200D) is BMP → kept
    const decoded = decodeStringFromUint8(buffer);
    // 👨(surrogate→?) + ZWJ + 👩(surrogate→?) + ZWJ + 👧(surrogate→?) + ZWJ + 👦(surrogate→?)
    expect(decoded).toBe('?\u200D?\u200D?\u200D?');
  });

  it('should handle empty string', () => {
    const { buffer, truncated } = encodeStringToUint8('', 8);
    expect(truncated).toBe(false);
    expect(buffer.length).toBe(8);
    expect(decodeStringFromUint8(buffer)).toBe('');
  });

  it('should throw on odd maxBytes', () => {
    expect(() => encodeStringToUint8('Hi', 7)).toThrow(/even/);
  });

  it('should throw on zero maxBytes', () => {
    expect(() => encodeStringToUint8('Hi', 0)).toThrow(/must be at least 2/);
  });

  it('should zero-pad remaining bytes', () => {
    const { buffer } = encodeStringToUint8('A', 8);
    // 'A' takes 2 bytes, remaining 6 should be 0
    expect(buffer[2]).toBe(0);
    expect(buffer[3]).toBe(0);
    expect(buffer[4]).toBe(0);
    expect(buffer[5]).toBe(0);
    expect(buffer[6]).toBe(0);
    expect(buffer[7]).toBe(0);
  });

  it('should handle CJK characters', () => {
    const { buffer } = encodeStringToUint8('你好世界', 16);
    expect(decodeStringFromUint8(buffer)).toBe('你好世界');
  });

  it('should handle lone low surrogate', () => {
    // Create a string with a lone low surrogate
    const str = 'A' + String.fromCharCode(0xDC00) + 'B';
    const { buffer } = encodeStringToUint8(str, 10);
    expect(decodeStringFromUint8(buffer)).toBe('A?B');
  });
});

describe('decodeStringFromUint8', () => {
  it('should stop at first null character', () => {
    const buffer = new Uint8Array(8);
    const view = new DataView(buffer.buffer);
    view.setUint16(0, 0x0041, true); // 'A'
    view.setUint16(2, 0x0042, true); // 'B'
    view.setUint16(4, 0x0000, true); // null
    view.setUint16(6, 0x0043, true); // 'C' — should not be read
    expect(decodeStringFromUint8(buffer)).toBe('AB');
  });

  it('should read until end if no null terminator', () => {
    const buffer = new Uint8Array(4);
    const view = new DataView(buffer.buffer);
    view.setUint16(0, 0x0041, true); // 'A'
    view.setUint16(2, 0x0042, true); // 'B'
    expect(decodeStringFromUint8(buffer)).toBe('AB');
  });

  it('should return empty string for all-zero buffer', () => {
    expect(decodeStringFromUint8(new Uint8Array(8))).toBe('');
  });

  it('should throw on odd buffer length', () => {
    expect(() => decodeStringFromUint8(new Uint8Array(5))).toThrow(/even/);
  });

  it('should handle buffer with byteOffset', () => {
    // Simulate a typed array view into a larger buffer
    const large = new ArrayBuffer(16);
    const view = new DataView(large);
    view.setUint16(4, 0x0041, true); // 'A' at offset 4
    view.setUint16(6, 0x0042, true); // 'B' at offset 6
    const slice = new Uint8Array(large, 4, 4);
    expect(decodeStringFromUint8(slice)).toBe('AB');
  });
});

describe('roundtrip', () => {
  const cases = [
    'Hello',
    'Привет',
    'こんにちは',
    'مرحبا',
    'Héllo Wörld',
    'Player_123',
    'αβγδ',
    '',
  ];

  for (const str of cases) {
    it(`should roundtrip "${str}"`, () => {
      const maxBytes = 64;
      const { buffer } = encodeStringToUint8(str, maxBytes);
      expect(decodeStringFromUint8(buffer)).toBe(str);
    });
  }
});
