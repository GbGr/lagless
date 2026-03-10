import { ParticleContainer, Particle, Texture } from 'pixi.js';
import type { PlacedObject, MapObjectRegistry } from '@lagless/2d-map-generator';
import { RenderLayer, sortPlacedObjects } from '@lagless/2d-map-generator';

export class MapObjectRenderer {
  readonly ground: ParticleContainer;
  readonly canopy: ParticleContainer;

  private readonly _canopyParticles: Map<number, Particle> = new Map();

  constructor(options?: { dynamicCanopyAlpha?: boolean }) {
    const dynamicAlpha = options?.dynamicCanopyAlpha ?? true;
    this.ground = new ParticleContainer({ dynamicProperties: { color: false } });
    this.canopy = new ParticleContainer({ dynamicProperties: { color: dynamicAlpha } });
  }

  build(
    objects: readonly PlacedObject[],
    registry: MapObjectRegistry,
    getTexture: (frameKey: string) => Texture,
  ): void {
    const sorted = sortPlacedObjects(objects);

    for (let i = 0; i < sorted.length; i++) {
      const obj = sorted[i];
      const def = registry.get(obj.typeId);
      if (!def) continue;

      for (const visual of def.visuals) {
        const particle = new Particle(getTexture(visual.texture));
        particle.x = obj.posX + (visual.offsetX ?? 0) * obj.scale;
        particle.y = obj.posY + (visual.offsetY ?? 0) * obj.scale;
        particle.rotation = obj.rotation;
        particle.scaleX = obj.scale;
        particle.scaleY = obj.scale;
        particle.anchorX = visual.anchorX ?? 0.5;
        particle.anchorY = visual.anchorY ?? 0.5;

        if (visual.layer === RenderLayer.Ground) {
          this.ground.addParticle(particle);
        } else {
          this.canopy.addParticle(particle);
          this._canopyParticles.set(i, particle);
        }
      }
    }
  }

  setCanopyAlpha(objectIndex: number, alpha: number): void {
    const particle = this._canopyParticles.get(objectIndex);
    if (particle) {
      particle.alpha = alpha;
    }
  }

  destroy(): void {
    this.ground.destroy();
    this.canopy.destroy();
    this._canopyParticles.clear();
  }
}
