import type { ISeededRandom } from '../../lib/types/index.js';

/**
 * Deterministic ISeededRandom for tests.
 * Uses a simple linear congruential generator seeded from the provided value.
 * All feature tests should import from this shared helper.
 */
export function createMockRandom(seed = 12345): ISeededRandom {
  let state = seed;

  function next(): number {
    // Simple LCG: state = (a * state + c) mod m
    state = (state * 1664525 + 1013904223) & 0xffffffff;
    // Normalize to [0, 1)
    return (state >>> 0) / 0x100000000;
  }

  return {
    getFloat(): number {
      return next();
    },
    getRandomInt(from: number, to: number): number {
      // Returns integer in [from, to)
      const range = to - from;
      return from + Math.floor(next() * range);
    },
    getRandomIntInclusive(from: number, to: number): number {
      // Returns integer in [from, to]
      const range = to - from + 1;
      return from + Math.floor(next() * range);
    },
  };
}
