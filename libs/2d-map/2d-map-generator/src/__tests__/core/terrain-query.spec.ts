import { describe, it, expect } from 'vitest';
import { TerrainQuery } from '../../lib/core/terrain-query.js';
import { TerrainZone } from '../../lib/types/placed-object.js';
import type { ShoreOutput, GrassOutput, RiverOutput, LakeOutput } from '../../lib/types/feature-configs.js';
import type { GeneratedRiver } from '../../lib/types/generated-river.js';
import type { Polygon, AABB, ReadonlyVec2 } from '../../lib/types/geometry.js';

function makeRect(x1: number, y1: number, x2: number, y2: number): { polygon: Polygon; bounds: AABB } {
  const points: ReadonlyVec2[] = [
    { x: x1, y: y1 },
    { x: x2, y: y1 },
    { x: x2, y: y2 },
    { x: x1, y: y2 },
  ];
  return {
    polygon: { points, count: 4 },
    bounds: { min: { x: x1, y: y1 }, max: { x: x2, y: y2 } },
  };
}

function makeShore(x1: number, y1: number, x2: number, y2: number): ShoreOutput {
  return makeRect(x1, y1, x2, y2);
}

function makeGrass(x1: number, y1: number, x2: number, y2: number): GrassOutput {
  const r = makeRect(x1, y1, x2, y2);
  return { ...r, area: (x2 - x1) * (y2 - y1) };
}

function makeRiver(
  waterRect: [number, number, number, number],
  shoreRect: [number, number, number, number],
): GeneratedRiver {
  const water = makeRect(...waterRect);
  const shore = makeRect(...shoreRect);
  return {
    splinePoints: [
      { x: (waterRect[0] + waterRect[2]) / 2, y: waterRect[1] },
      { x: (waterRect[0] + waterRect[2]) / 2, y: waterRect[3] },
    ],
    waterWidth: (waterRect[2] - waterRect[0]) / 2,
    shoreWidth: (shoreRect[2] - shoreRect[0] - (waterRect[2] - waterRect[0])) / 2,
    looped: false,
    center: {
      x: (waterRect[0] + waterRect[2]) / 2,
      y: (waterRect[1] + waterRect[3]) / 2,
    },
    waterPoly: water.polygon,
    shorePoly: shore.polygon,
    aabb: shore.bounds,
  };
}

describe('TerrainQuery', () => {
  it('should classify positions inside grass polygon as Grass', () => {
    const shore = makeShore(10, 10, 100, 100);
    const grass = makeGrass(20, 20, 90, 90);
    const query = new TerrainQuery({ shore, grass });

    expect(query.classify(50, 50)).toBe(TerrainZone.Grass);
  });

  it('should classify positions between shore and grass as Beach', () => {
    const shore = makeShore(10, 10, 100, 100);
    const grass = makeGrass(30, 30, 80, 80);
    const query = new TerrainQuery({ shore, grass });

    // Point at (15, 15) is inside shore but outside grass → Beach
    expect(query.classify(15, 15)).toBe(TerrainZone.Beach);
  });

  it('should classify positions outside shore as WaterEdge', () => {
    const shore = makeShore(10, 10, 100, 100);
    const grass = makeGrass(20, 20, 90, 90);
    const query = new TerrainQuery({ shore, grass });

    // Point at (5, 5) is outside shore → WaterEdge (ocean)
    expect(query.classify(5, 5)).toBe(TerrainZone.WaterEdge);
  });

  it('should classify positions inside river waterPoly as River', () => {
    const shore = makeShore(0, 0, 200, 200);
    const grass = makeGrass(10, 10, 190, 190);
    const river = makeRiver([95, 0, 105, 200], [90, 0, 110, 200]);
    const riverOutput: RiverOutput = { rivers: [river], normalRivers: [river] };
    const query = new TerrainQuery({ shore, grass, river: riverOutput });

    expect(query.classify(100, 100)).toBe(TerrainZone.River);
  });

  it('should classify positions inside river shorePoly (not waterPoly) as RiverShore', () => {
    const shore = makeShore(0, 0, 200, 200);
    const grass = makeGrass(10, 10, 190, 190);
    // Water: x=95..105, Shore: x=85..115
    const river = makeRiver([95, 0, 105, 200], [85, 0, 115, 200]);
    const riverOutput: RiverOutput = { rivers: [river], normalRivers: [river] };
    const query = new TerrainQuery({ shore, grass, river: riverOutput });

    // Point at x=90 is inside shore poly but not water poly → RiverShore
    expect(query.classify(90, 100)).toBe(TerrainZone.RiverShore);
  });

  it('should classify lake positions as Lake', () => {
    const shore = makeShore(0, 0, 200, 200);
    const grass = makeGrass(10, 10, 190, 190);
    const lakeRiver: GeneratedRiver = {
      ...makeRiver([80, 80, 120, 120], [75, 75, 125, 125]),
      looped: true,
    };
    const lakeOutput: LakeOutput = { lakes: [lakeRiver] };
    const query = new TerrainQuery({ shore, grass, lake: lakeOutput });

    expect(query.classify(100, 100)).toBe(TerrainZone.Lake);
  });

  it('should work with no terrain features — defaults to Grass', () => {
    const query = new TerrainQuery({});
    expect(query.classify(50, 50)).toBe(TerrainZone.Grass);
  });

  it('should use AABB pre-check to skip polygon test for distant points', () => {
    const shore = makeShore(100, 100, 200, 200);
    const grass = makeGrass(110, 110, 190, 190);
    const query = new TerrainQuery({ shore, grass });

    // Point far outside shore AABB — should quickly classify as WaterEdge
    expect(query.classify(0, 0)).toBe(TerrainZone.WaterEdge);
    expect(query.classify(500, 500)).toBe(TerrainZone.WaterEdge);
  });

  it('should prioritize river over grass/beach', () => {
    const shore = makeShore(0, 0, 200, 200);
    const grass = makeGrass(10, 10, 190, 190);
    const river = makeRiver([95, 0, 105, 200], [90, 0, 110, 200]);
    const riverOutput: RiverOutput = { rivers: [river], normalRivers: [river] };
    const query = new TerrainQuery({ shore, grass, river: riverOutput });

    // Point in river water + in grass → should be River (river takes priority)
    expect(query.classify(100, 100)).toBe(TerrainZone.River);
  });

  it('should prioritize lake over grass/beach', () => {
    const shore = makeShore(0, 0, 200, 200);
    const grass = makeGrass(10, 10, 190, 190);
    const lakeRiver: GeneratedRiver = {
      ...makeRiver([80, 80, 120, 120], [75, 75, 125, 125]),
      looped: true,
    };
    const lakeOutput: LakeOutput = { lakes: [lakeRiver] };
    const query = new TerrainQuery({ shore, grass, lake: lakeOutput });

    // Point in lake + in grass → should be Lake
    expect(query.classify(100, 100)).toBe(TerrainZone.Lake);
  });
});
