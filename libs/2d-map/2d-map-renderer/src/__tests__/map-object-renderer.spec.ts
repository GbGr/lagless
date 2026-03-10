import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use numeric values directly to avoid cross-package enum resolution issues
const ShapeType = { Circle: 0, Cuboid: 1 };
const RenderLayer = { Ground: 0, Canopy: 1 };
const TerrainZone = { Grass: 0 };

// Mock pixi.js before importing MapObjectRenderer
const groundParticles: MockParticle[] = [];
const canopyParticles: MockParticle[] = [];
const allParticles: MockParticle[] = [];
let destroyCalls = 0;

class MockParticle {
  x = 0; y = 0; rotation = 0; scaleX = 1; scaleY = 1;
  anchorX = 0.5; anchorY = 0.5;
  private _alpha = 1;
  constructor(public texture: unknown) { allParticles.push(this); }
  get alpha() { return this._alpha; }
  set alpha(v: number) { this._alpha = v; }
}

class MockGroundContainer {
  addParticle(p: MockParticle) { groundParticles.push(p); }
  destroy() { destroyCalls++; }
}

class MockCanopyContainer {
  addParticle(p: MockParticle) { canopyParticles.push(p); }
  destroy() { destroyCalls++; }
}

let containerCount = 0;

vi.mock('pixi.js', () => ({
  ParticleContainer: class {
    addParticle: (p: unknown) => void;
    destroy: () => void;
    constructor() {
      const index = containerCount++;
      if (index === 0) {
        this.addParticle = (p: MockParticle) => groundParticles.push(p);
        this.destroy = () => { destroyCalls++; };
      } else {
        this.addParticle = (p: MockParticle) => canopyParticles.push(p);
        this.destroy = () => { destroyCalls++; };
      }
    }
  },
  Particle: MockParticle,
  Texture: { EMPTY: {} },
}));

const { MapObjectRenderer } = await import('../lib/core/map-object-renderer.js');

function makeObj(typeId: number, posX: number, posY: number, scale = 1) {
  return { typeId, posX, posY, rotation: 0, scale, terrainZone: TerrainZone.Grass, children: [] };
}

const registry = new Map([
  [0, {
    typeId: 0,
    colliders: [{ shape: { type: ShapeType.Circle, radius: 3 } }],
    visuals: [
      { texture: 'trunk', layer: RenderLayer.Ground },
      { texture: 'foliage', layer: RenderLayer.Canopy },
    ],
    scaleRange: [1, 1] as [number, number],
  }],
]);

const getTexture = (key: string) => ({ label: key }) as never;

describe('MapObjectRenderer', () => {
  beforeEach(() => {
    groundParticles.length = 0;
    canopyParticles.length = 0;
    allParticles.length = 0;
    destroyCalls = 0;
    containerCount = 0;
  });

  it('should route ground visuals to ground container and canopy to canopy container', () => {
    const renderer = new MapObjectRenderer();
    renderer.build([makeObj(0, 10, 20)], registry as never, getTexture);

    expect(groundParticles).toHaveLength(1);
    expect(canopyParticles).toHaveLength(1);
    expect(groundParticles[0].x).toBe(10);
    expect(groundParticles[0].y).toBe(20);
  });

  it('should sort objects by posY before creating particles', () => {
    const renderer = new MapObjectRenderer();
    renderer.build([makeObj(0, 0, 50), makeObj(0, 0, 10), makeObj(0, 0, 30)], registry as never, getTexture);

    // 3 objects × 1 ground visual = 3 ground particles in Y-sorted order
    expect(groundParticles[0].y).toBe(10);
    expect(groundParticles[1].y).toBe(30);
    expect(groundParticles[2].y).toBe(50);
  });

  it('should apply scale to particle', () => {
    const renderer = new MapObjectRenderer();
    renderer.build([makeObj(0, 0, 0, 2)], registry as never, getTexture);

    expect(groundParticles[0].scaleX).toBe(2);
    expect(groundParticles[0].scaleY).toBe(2);
  });

  it('should set canopy alpha via setCanopyAlpha', () => {
    const renderer = new MapObjectRenderer();
    renderer.build([makeObj(0, 0, 0)], registry as never, getTexture);

    // First sorted object is index 0
    renderer.setCanopyAlpha(0, 0.25);
    expect(canopyParticles[0].alpha).toBe(0.25);
  });

  it('should skip objects not in registry', () => {
    const renderer = new MapObjectRenderer();
    renderer.build([makeObj(99, 0, 0)], registry as never, getTexture);

    expect(groundParticles).toHaveLength(0);
    expect(canopyParticles).toHaveLength(0);
  });

  it('should destroy both containers on destroy()', () => {
    const renderer = new MapObjectRenderer();
    renderer.destroy();
    expect(destroyCalls).toBe(2);
  });
});
