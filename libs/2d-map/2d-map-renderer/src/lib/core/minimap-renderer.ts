import { Container, Graphics, Text } from 'pixi.js';
import type { IGeneratedMap, BiomeOutput, ShoreOutput, GrassOutput, RiverOutput, LakeOutput, PlacedObject, MapObjectRegistry, PlacesOutput } from '@lagless/2d-map-generator';
import { BiomeFeature, ShoreFeature, GrassFeature, RiverFeature, LakeFeature, ShapeType } from '@lagless/2d-map-generator';
import { drawPolygon } from '../utils/polygon-draw.js';

export class MinimapRenderer {
  private _container: Container | null = null;

  buildMinimap(map: IGeneratedMap, size: number): Container {
    const container = new Container();
    const scaleX = size / map.width;
    const scaleY = size / map.height;
    container.scale.set(scaleX, scaleY);

    const biome = map.get<BiomeOutput>(BiomeFeature);
    const shore = map.get<ShoreOutput>(ShoreFeature);
    const grass = map.get<GrassOutput>(GrassFeature);
    const riverOutput = map.get<RiverOutput>(RiverFeature);
    const lakeOutput = map.get<LakeOutput>(LakeFeature);

    // Background
    const bg = new Graphics();
    bg.rect(0, 0, map.width, map.height).fill({ color: biome?.water ?? 0x3d85c6 });
    container.addChild(bg);

    // Shore
    if (shore && biome) {
      const shoreG = new Graphics();
      drawPolygon(shoreG, shore.polygon.points);
      shoreG.fill({ color: biome.beach });
      container.addChild(shoreG);
    }

    // Grass
    if (grass && biome) {
      const grassG = new Graphics();
      drawPolygon(grassG, grass.polygon.points);
      grassG.fill({ color: biome.grass });
      container.addChild(grassG);
    }

    // Rivers
    const allRivers = [
      ...(riverOutput?.rivers ?? []),
      ...(lakeOutput?.lakes ?? []),
    ];
    if (allRivers.length > 0 && biome) {
      const riverG = new Graphics();
      for (const river of allRivers) {
        drawPolygon(riverG, river.waterPoly.points);
        riverG.fill({ color: biome.water });
      }
      container.addChild(riverG);
    }

    this._container = container;
    return container;
  }

  addObjectShapes(objects: readonly PlacedObject[], registry: MapObjectRegistry): void {
    if (!this._container) return;

    const g = new Graphics();
    for (const obj of objects) {
      const def = registry.get(obj.typeId);
      if (!def?.mapDisplay) continue;

      for (const shape of def.mapDisplay.shapes) {
        if (shape.collider.type === ShapeType.Circle) {
          g.circle(obj.posX, obj.posY, shape.collider.radius * shape.scale);
          g.fill({ color: shape.color });
        } else if (shape.collider.type === ShapeType.Cuboid) {
          const hw = shape.collider.halfWidth * shape.scale;
          const hh = shape.collider.halfHeight * shape.scale;
          g.rect(obj.posX - hw, obj.posY - hh, hw * 2, hh * 2);
          g.fill({ color: shape.color });
        }
      }
    }
    this._container.addChild(g);
  }

  addPlaceLabels(places: PlacesOutput['places']): void {
    if (!this._container) return;

    for (const place of places) {
      const text = new Text({ text: place.name, style: { fontSize: 12, fill: 0xffffff } });
      text.position.set(place.x, place.y);
      text.anchor.set(0.5, 0.5);
      this._container.addChild(text);
    }
  }

  destroy(): void {
    if (this._container) {
      this._container.destroy({ children: true });
      this._container = null;
    }
  }
}
