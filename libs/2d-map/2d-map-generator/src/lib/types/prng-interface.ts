/**
 * Minimal seeded random interface.
 * Intentionally minimal — @lagless/core PRNG has additional methods (getFloat53)
 * that satisfy this interface via structural typing.
 */
export interface ISeededRandom {
  /** Returns a float in [0, 1) */
  getFloat(): number;
  /** Returns an integer in [from, to) */
  getRandomInt(from: number, to: number): number;
  /** Returns an integer in [from, to] */
  getRandomIntInclusive(from: number, to: number): number;
}
