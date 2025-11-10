import { Container, Sprite } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { TerrainChunkCache } from './terrain-chunk-cache';

export interface TerrainWorldOptions {
  viewport: Viewport;
  cache: TerrainChunkCache;
  marginChunks?: number;   // extra chunks outside visible area
}

/**
 * Manages terrain chunk sprites based on viewport visible area.
 * Uses pre-generated textures from TerrainChunkCache.
 */
export class TerrainWorld {
  public readonly container: Container;

  private readonly viewport: Viewport;
  private readonly cache: TerrainChunkCache;
  private readonly chunkSize: number;
  private readonly worldWidth: number;
  private readonly worldHeight: number;
  private readonly marginChunks: number;

  private chunks = new Map<string, Sprite>();

  constructor(options: TerrainWorldOptions) {
    this.viewport = options.viewport;
    this.cache = options.cache;
    this.chunkSize = this.cache.chunkSize;
    this.worldWidth = this.cache.worldWidth;
    this.worldHeight = this.cache.worldHeight;
    this.marginChunks = options.marginChunks ?? 1;

    this.container = new Container();
    this.viewport.addChildAt(this.container, 0);

    this.updateVisibleChunks();
    this.viewport.on('moved', this.handleViewportMoved);
  }

  public destroy(): void {
    this.viewport.off('moved', this.handleViewportMoved);
    this.clearAllChunks();
    this.container.destroy({ children: true });
  }

  private handleViewportMoved = (): void => {
    this.updateVisibleChunks();
  };

  private updateVisibleChunks(): void {
    const bounds = this.viewport.getVisibleBounds();
    const size = this.chunkSize;

    const maxChunkX = Math.floor(this.worldWidth / size) - 1;
    const maxChunkY = Math.floor(this.worldHeight / size) - 1;

    const firstChunkX = Math.max(
      0,
      Math.floor(bounds.x / size) - this.marginChunks,
    );
    const firstChunkY = Math.max(
      0,
      Math.floor(bounds.y / size) - this.marginChunks,
    );
    const lastChunkX = Math.min(
      maxChunkX,
      Math.floor((bounds.x + bounds.width) / size) + this.marginChunks,
    );
    const lastChunkY = Math.min(
      maxChunkY,
      Math.floor((bounds.y + bounds.height) / size) + this.marginChunks,
    );

    const needed = new Set<string>();

    for (let cy = firstChunkY; cy <= lastChunkY; cy++) {
      for (let cx = firstChunkX; cx <= lastChunkX; cx++) {
        const key = this.key(cx, cy);
        needed.add(key);

        if (!this.chunks.has(key)) {
          this.createChunkSprite(cx, cy);
        }
      }
    }

    // Remove sprites that are no longer needed
    for (const [key, sprite] of this.chunks) {
      if (!needed.has(key)) {
        this.container.removeChild(sprite);
        // Keep the texture in cache, only destroy the sprite instance
        sprite.destroy({ texture: false, textureSource: true });
        this.chunks.delete(key);
      }
    }
  }

  private createChunkSprite(chunkX: number, chunkY: number): void {
    const texture = this.cache.getTexture(chunkX, chunkY);
    if (!texture) {
      return;
    }

    const sprite = new Sprite(texture);
    sprite.anchor.set(0, 0);
    sprite.x = chunkX * this.chunkSize;
    sprite.y = chunkY * this.chunkSize;

    this.container.addChild(sprite);
    this.chunks.set(this.key(chunkX, chunkY), sprite);
  }

  private clearAllChunks(): void {
    for (const sprite of this.chunks.values()) {
      this.container.removeChild(sprite);
      sprite.destroy({ texture: false, textureSource: true });
    }
    this.chunks.clear();
  }

  private key(x: number, y: number): string {
    return `${x},${y}`;
  }
}
