import { Texture } from 'pixi.js';
import { createNoise2D } from 'simplex-noise';
import alea from 'alea';

type Color = [number, number, number];

export interface TerrainChunkCacheConfig {
  seed: string;
  chunkSize: number;     // pixels per chunk (e.g. 256)
  chunksX: number;       // number of chunks horizontally
  chunksY: number;       // number of chunks vertically

  baseFrequency?: number;
  octaves?: number;
  persistence?: number;
  lacunarity?: number;
}

/**
 * Pre-generates textures for all chunks at initialization
 * and stores them in a cache for fast access at runtime.
 */
export class TerrainChunkCache {
  public readonly chunkSize: number;
  public readonly chunksX: number;
  public readonly chunksY: number;
  public readonly worldWidth: number;
  public readonly worldHeight: number;

  private readonly baseFrequency: number;
  private readonly octaves: number;
  private readonly persistence: number;
  private readonly lacunarity: number;

  private readonly noise2D: (x: number, y: number) => number;

  // textures[y][x]
  private textures: Texture[][] = [];

  constructor(config: TerrainChunkCacheConfig) {
    this.chunkSize = config.chunkSize;
    this.chunksX = config.chunksX;
    this.chunksY = config.chunksY;

    this.worldWidth = this.chunkSize * this.chunksX;
    this.worldHeight = this.chunkSize * this.chunksY;

    this.baseFrequency = config.baseFrequency ?? 0.002;
    this.octaves = config.octaves ?? 3;          // fewer octaves → faster
    this.persistence = config.persistence ?? 0.5;
    this.lacunarity = config.lacunarity ?? 2.0;

    // Seeded PRNG for deterministic worlds
    const rng = alea(config.seed);
    this.noise2D = createNoise2D(rng);

    // Generate all chunk textures right away
    this.buildAllChunks();
  }

  /**
   * Returns cached texture for given chunk indices.
   */
  public getTexture(chunkX: number, chunkY: number): Texture | undefined {
    if (
      chunkX < 0 ||
      chunkY < 0 ||
      chunkX >= this.chunksX ||
      chunkY >= this.chunksY
    ) {
      return undefined;
    }
    return this.textures[chunkY][chunkX];
  }

  /**
   * Generates texture for every chunk and stores in cache.
   * This is synchronous and can take noticeable time if the world is large.
   */
  private buildAllChunks(): void {
    const size = this.chunkSize;

    // Reuse one buffer for all chunks to avoid reallocations
    const buffer = new Uint8ClampedArray(size * size * 4);

    for (let cy = 0; cy < this.chunksY; cy++) {
      this.textures[cy] = [];
      for (let cx = 0; cx < this.chunksX; cx++) {
        // Fill buffer for this chunk
        this.fillChunkBuffer(cx, cy, buffer);

        // Create canvas and texture
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Could not get 2D context for terrain canvas');
        }

        const imageData = ctx.createImageData(size, size);
        imageData.data.set(buffer);
        ctx.putImageData(imageData, 0, 0);

        const texture = Texture.from(canvas);

        // Linear filtering for smooth zoom
        if (texture.source) {
          (texture.source as any).scaleMode = 'linear';
        }

        this.textures[cy][cx] = texture;
      }
    }
  }

  /**
   * Fills the provided buffer with RGBA pixels for the given chunk.
   */
  private fillChunkBuffer(
    chunkX: number,
    chunkY: number,
    buffer: Uint8ClampedArray,
  ): void {
    const size = this.chunkSize;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const worldX = chunkX * size + x;
        const worldY = chunkY * size + y;

        const height = this.fbm(worldX, worldY); // [0, 1]
        const color = this.pickColor(height);

        const idx = (y * size + x) * 4;
        buffer[idx + 0] = color[0];
        buffer[idx + 1] = color[1];
        buffer[idx + 2] = color[2];
        buffer[idx + 3] = 255;
      }
    }
  }

  /**
   * Simple fbm using simplex noise, returns [0, 1].
   */
  private fbm(x: number, y: number): number {
    let amplitude = 1;
    let frequency = this.baseFrequency;
    let sum = 0;
    let maxSum = 0;

    for (let i = 0; i < this.octaves; i++) {
      const n = this.noise2D(x * frequency, y * frequency); // [-1, 1]
      sum += n * amplitude;
      maxSum += amplitude;

      amplitude *= this.persistence;
      frequency *= this.lacunarity;
    }

    const value = sum / maxSum;    // [-1, 1]
    const normalized = value * 0.5 + 0.5; // [0, 1]

    // Small contrast boost by applying gamma
    const gamma = 1.1;
    return Math.pow(normalized, gamma);
  }

  /**
   * High-contrast palette based only on height.
   */
  private pickColor(height: number): Color {
    // Strong, saturated colors
    const deepWater: Color   = [  4,  20,  60];  // dark blue
    const shallowWater: Color= [  0, 180, 210];  // bright cyan
    const sand: Color        = [244, 208,  63];  // vivid yellowish sand
    const lowGrass: Color    = [ 80, 220, 110];  // bright green
    const highGrass: Color   = [ 33, 140,  70];  // darker green
    const rock: Color        = [120,  90,  70];  // warm brown rock
    const snow: Color        = [250, 250, 255];  // almost pure white

    let base: Color;

    if (height < 0.25) {
      const t = height / 0.25;
      base = TerrainChunkCache.mix(deepWater, shallowWater, t);
    } else if (height < 0.33) {
      const t = (height - 0.25) / (0.33 - 0.25);
      base = TerrainChunkCache.mix(shallowWater, sand, t);
    } else if (height < 0.55) {
      const t = (height - 0.33) / (0.55 - 0.33);
      base = TerrainChunkCache.mix(sand, lowGrass, t);
    } else if (height < 0.70) {
      const t = (height - 0.55) / (0.70 - 0.55);
      base = TerrainChunkCache.mix(lowGrass, highGrass, t);
    } else if (height < 0.85) {
      const t = (height - 0.70) / (0.85 - 0.70);
      base = TerrainChunkCache.mix(highGrass, rock, t);
    } else {
      const t = (height - 0.85) / (1.0 - 0.85);
      base = TerrainChunkCache.mix(rock, snow, t);
    }

    // Cheap height-based shading for more depth
    return this.applyHeightShading(base, height);
  }

  /**
   * Slightly darken low areas and lighten high areas for more contrast.
   */
  private applyHeightShading(color: Color, height: number): Color {
    const shadeStrength = 0.18; // how strong the shading is
    // height in [0,1] → [-0.5, 0.5] → multiplier in [1 - s, 1 + s]
    const factor = 1 + (height - 0.5) * 2 * shadeStrength;

    return [
      TerrainChunkCache.clampColor(color[0] * factor),
      TerrainChunkCache.clampColor(color[1] * factor),
      TerrainChunkCache.clampColor(color[2] * factor),
    ];
  }

  private static mix(a: Color, b: Color, t: number): Color {
    const tt = Math.min(1, Math.max(0, t));
    return [
      TerrainChunkCache.lerp(a[0], b[0], tt),
      TerrainChunkCache.lerp(a[1], b[1], tt),
      TerrainChunkCache.lerp(a[2], b[2], tt),
    ];
  }

  private static lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  private static clampColor(v: number): number {
    return Math.max(0, Math.min(255, v | 0));
  }
}
