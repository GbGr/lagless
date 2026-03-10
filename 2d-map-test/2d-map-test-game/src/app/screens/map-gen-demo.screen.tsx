import { FC, useEffect, useRef, useState, useCallback } from 'react';
import { Application, extend, useApplication } from '@pixi/react';
import { Assets, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { SpatialGridCollisionProvider, ObjectPlacementFeature } from '@lagless/2d-map-generator';
import { createStandardGenerator } from '@lagless/2d-map-test-simulation';
import type { IGeneratedMap, ISeededRandom, ObjectPlacementOutput } from '@lagless/2d-map-generator';
import { MapTerrainRenderer, MinimapRenderer } from '@lagless/2d-map-renderer';

extend({ Container, Graphics, Sprite, Text, Viewport });

// ---------------------------------------------------------------------------
// Simple LCG PRNG for standalone demo (no ECS runner available)
// ---------------------------------------------------------------------------

class DemoRandom implements ISeededRandom {
  private _state: number;
  constructor(seed: number) { this._state = seed; }
  private _next(): number { this._state = (this._state * 1664525 + 1013904223) >>> 0; return this._state; }
  getFloat(): number { return this._next() / 0x100000000; }
  getRandomInt(from: number, to: number): number { return from + Math.floor(this.getFloat() * (to - from)); }
  getRandomIntInclusive(from: number, to: number): number { return from + Math.floor(this.getFloat() * (to - from + 1)); }
}

function generateMap(seed: number): IGeneratedMap {
  const generator = createStandardGenerator();
  const random = new DemoRandom(seed);
  const collision = new SpatialGridCollisionProvider(1024, 1024, 64);
  return generator.generate(random, collision);
}

// ---------------------------------------------------------------------------
// Map content (Pixi viewport + terrain + objects)
// ---------------------------------------------------------------------------

const MapDemoContent: FC<{ map: IGeneratedMap }> = ({ map }) => {
  const { app } = useApplication();
  const viewportRef = useRef<InstanceType<typeof Viewport> | null>(null);
  const terrainRef = useRef<MapTerrainRenderer | null>(null);
  const minimapRef = useRef<MinimapRenderer | null>(null);

  const initViewport = useCallback((vp: InstanceType<typeof Viewport>) => {
    if (!vp) return;
    viewportRef.current = vp;

    vp.drag()
      .pinch()
      .wheel()
      .clampZoom({ minScale: 3, maxScale: 32 });

    vp.moveCenter(map.width / 2, map.height / 2);
    vp.setZoom(32);
  }, [app, map]);

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp || !app) return;

    // Terrain
    const terrain = new MapTerrainRenderer();
    const terrainContainer = terrain.buildTerrain(map);
    vp.addChild(terrainContainer);
    terrainRef.current = terrain;

    // Object sprites (tree texture already loaded by app-level Loader)
    const objectsContainer = new Container();
    const placement = map.get<ObjectPlacementOutput>(ObjectPlacementFeature);
    const treeTexture = Assets.get<Texture>('tree');
    if (placement && treeTexture) {
      for (const obj of placement.objects) {
        const sprite = new Sprite(treeTexture);
        sprite.anchor.set(0.5, 1);
        sprite.position.set(obj.posX, obj.posY);
        sprite.scale.set(obj.scale / 32);
        sprite.rotation = obj.rotation;
        objectsContainer.addChild(sprite);
      }
    }
    vp.addChild(objectsContainer);

    // Minimap
    const minimap = new MinimapRenderer();
    const minimapContainer = minimap.buildMinimap(map, 200);
    minimapContainer.position.set(10, 10);
    app.stage.addChild(minimapContainer);
    minimapRef.current = minimap;

    return () => {
      terrain.destroy();
      objectsContainer.destroy({ children: true });
      minimap.destroy();
    };
  }, [app, map]);

  useEffect(() => {
    if (!app.renderer) return;
    const vp = viewportRef.current;
    if (!vp) return;

    const resizeHandler = () => { vp.resize(app.renderer.width, app.renderer.height); };
    const resizeObserver = new ResizeObserver(resizeHandler);
    resizeObserver.observe(app.renderer.canvas);
    return () => { resizeObserver.disconnect(); };
  }, [app.renderer, viewportRef.current]);

  return (
    <viewport
      worldWidth={map.width}
      worldHeight={map.height}
      screenWidth={app.renderer.width}
      screenHeight={app.renderer.height}
      events={app.renderer.events}
      ref={initViewport}
    />
  );
};

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export const MapGenDemoScreen: FC = () => {
  const [seed, setSeed] = useState(12345);
  const [map, setMap] = useState<IGeneratedMap>(() => generateMap(12345));
  const containerRef = useRef<HTMLDivElement>(null);

  const handleRegenerate = () => {
    const newSeed = Math.floor(Math.random() * 0xFFFFFFFF);
    setSeed(newSeed);
    setMap(generateMap(newSeed));
  };

  return (
    <div style={styles.wrapper} ref={containerRef}>
      <div style={styles.controls}>
        <a href="/" style={styles.link}>Back</a>
        <span style={styles.seedLabel}>Seed: {seed}</span>
        <button style={styles.button} onClick={handleRegenerate}>Regenerate</button>
      </div>
      <Application
        autoDensity
        resolution={devicePixelRatio || 1}
        resizeTo={containerRef}
        background={0x2c3e50}
      >
        <MapDemoContent map={map} />
      </Application>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    top: 0, left: 0, width: '100%', height: '100%', position: 'fixed',
  },
  controls: {
    position: 'absolute', bottom: 16, right: 16, zIndex: 10,
    display: 'flex', gap: 12, alignItems: 'center',
  },
  link: {
    color: '#88aaff', fontFamily: "'Courier New', monospace",
    fontSize: 14, textDecoration: 'underline', cursor: 'pointer',
  },
  seedLabel: {
    color: '#aaa', fontFamily: "'Courier New', monospace", fontSize: 13,
  },
  button: {
    padding: '6px 16px', fontSize: 14, cursor: 'pointer',
    background: '#222', color: '#e0e0e0',
    border: '1px solid #555', borderRadius: 4,
    fontFamily: "'Courier New', monospace",
  },
};
