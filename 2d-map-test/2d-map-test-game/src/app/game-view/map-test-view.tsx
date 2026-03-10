import { FC, useEffect, useMemo, useRef } from 'react';
import { useTick } from '@pixi/react';
import { Assets, Texture } from 'pixi.js';
import { FilterViews, DebugPhysics2dRenderer } from '@lagless/pixi-react';
import { useRunner } from './runner-provider';
import { useViewport } from './viewport-provider';
import { MapData, PlayerFilter, PlayerResource, Transform2d } from '@lagless/2d-map-test-simulation';
import { PlayerView } from './player-view';
import { MapTerrainRenderer, MapObjectRenderer } from '@lagless/2d-map-renderer';
import { VisualSmoother2d } from '@lagless/misc';
import { PlayerResources } from '@lagless/core';
import { ObjectPlacementFeature, extractCanopyZones, isInsideCanopyZone } from '@lagless/2d-map-generator';
import type { ObjectPlacementOutput } from '@lagless/2d-map-generator';

export const MapTestView: FC = () => {
  const runner = useRunner();
  const viewport = useViewport();

  const playerFilter = useMemo(() => {
    return runner.DIContainer.resolve(PlayerFilter);
  }, [runner]);

  const mapData = useMemo(() => {
    return runner.DIContainer.resolve(MapData);
  }, [runner]);

  const objectRendererRef = useRef<MapObjectRenderer | null>(null);

  // Terrain + map objects (created once)
  useEffect(() => {
    const map = mapData.map;

    const terrain = new MapTerrainRenderer();
    const terrainContainer = terrain.buildTerrain(map);
    viewport.addChildAt(terrainContainer, 0);

    const objectRenderer = new MapObjectRenderer({ dynamicCanopyAlpha: true });
    objectRendererRef.current = objectRenderer;
    const placement = map.get<ObjectPlacementOutput>(ObjectPlacementFeature);
    if (placement) {
      const fallbackTexture = Assets.get<Texture>('placeholder') ?? Texture.EMPTY;
      objectRenderer.build(placement.objects, mapData.registry, (key) => Assets.get<Texture>(key) ?? fallbackTexture);
      viewport.addChild(objectRenderer.ground);
      viewport.addChild(objectRenderer.canopy);
    }

    return () => {
      terrain.destroy();
      objectRenderer.destroy();
      objectRendererRef.current = null;
    };
  }, [viewport, mapData]);

  // Pre-compute canopy zones for distance-based transparency
  const canopyZones = useMemo(() => {
    const placement = mapData.map.get<ObjectPlacementOutput>(ObjectPlacementFeature);
    return placement ? extractCanopyZones(placement.objects, mapData.registry) : [];
  }, [mapData]);

  // Camera follow local player
  const smootherRef = useRef(new VisualSmoother2d({}));

  const localSlot = useMemo(() => {
    return runner.InputProviderInstance.playerSlot;
  }, [runner]);

  const transform2d = useMemo(() => runner.DIContainer.resolve(Transform2d), [runner]);
  const playerResources = useMemo(() => runner.DIContainer.resolve(PlayerResources), [runner]);

  useTick(() => {
    const pr = playerResources.get(PlayerResource, localSlot);
    const entity = pr.safe.entity;
    if (entity === 0 && pr.safe.connected === 0) return;

    const smoother = smootherRef.current;
    smoother.update(
      transform2d.unsafe.prevPositionX[entity],
      transform2d.unsafe.prevPositionY[entity],
      transform2d.unsafe.positionX[entity],
      transform2d.unsafe.positionY[entity],
      0, 0,
      runner.Simulation.interpolationFactor,
    );
    viewport.moveCenter(smoother.x, smoother.y);

    // Update canopy transparency based on distance from local player
    const objRenderer = objectRendererRef.current;
    if (objRenderer) {
      const px = smoother.x, py = smoother.y;
      for (const zone of canopyZones) {
        const inside = isInsideCanopyZone(zone, px, py);
        objRenderer.setCanopyAlpha(zone.objectIndex, inside ? 0.3 : 1.0);
      }
    }
  });

  const getBuffers = useMemo(() => {
    return () => runner.PhysicsWorldManager.debugRender();
  }, [runner]);

  return (
    <>
      <FilterViews filter={playerFilter} View={PlayerView} />
      <DebugPhysics2dRenderer getBuffers={getBuffers} parent={viewport} strokeWidth={0.5} />
    </>
  );
};
