import { describe, it, expect, beforeAll } from 'vitest';
import { MathOps } from '@lagless/math';
import { BiomeFeature, ShoreFeature, GrassFeature } from '@lagless/2d-map-generator';
import type { ISeededRandom } from '@lagless/2d-map-generator';
import { createStandardGenerator } from '../map-config/create-map-generator.js';

class SimpleRandom implements ISeededRandom {
  private _state: number;
  constructor(seed: number) { this._state = seed; }
  private _next(): number { this._state = (this._state * 1664525 + 1013904223) >>> 0; return this._state; }
  getFloat(): number { return this._next() / 0x100000000; }
  getRandomInt(from: number, to: number): number { return from + Math.floor(this.getFloat() * (to - from)); }
  getRandomIntInclusive(from: number, to: number): number { return from + Math.floor(this.getFloat() * (to - from + 1)); }
}

beforeAll(async () => {
  await MathOps.init();
});

describe('createStandardGenerator', () => {
  it('should return a configured MapGenerator', () => {
    const generator = createStandardGenerator();
    expect(generator).toBeDefined();
    expect(typeof generator.generate).toBe('function');
  });

  it('should produce valid GeneratedMap with terrain features', () => {
    const generator = createStandardGenerator();
    const random = new SimpleRandom(42);
    const map = generator.generate(random);

    expect(map).toBeDefined();
    expect(map.get(BiomeFeature)).toBeDefined();
    expect(map.get(ShoreFeature)).toBeDefined();
    expect(map.get(GrassFeature)).toBeDefined();
  });
});
