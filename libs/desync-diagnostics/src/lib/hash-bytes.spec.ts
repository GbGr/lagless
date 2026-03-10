import { hashBytes } from './hash-bytes.js';

describe('hashBytes', () => {
  it('should return 0 for empty input', () => {
    expect(hashBytes(new Uint8Array(0))).toBe(0);
  });

  it('should produce consistent hash for same input', () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const hash1 = hashBytes(data);
    const hash2 = hashBytes(data);
    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(0);
  });

  it('should produce different hashes for different input', () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([3, 2, 1]);
    expect(hashBytes(a)).not.toBe(hashBytes(b));
  });

  it('should return a 32-bit unsigned integer', () => {
    const data = new Uint8Array(1000);
    for (let i = 0; i < data.length; i++) data[i] = i & 0xFF;
    const hash = hashBytes(data);
    expect(hash).toBeGreaterThanOrEqual(0);
    expect(hash).toBeLessThanOrEqual(0xFFFFFFFF);
  });
});
