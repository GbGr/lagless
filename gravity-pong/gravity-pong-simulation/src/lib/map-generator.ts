import { PRNG } from '@lagless/core';
import { GravityPongArena } from './arena.js';

export interface GravitySourceData {
  x: number;
  y: number;
  mass: number;
  radius: number;
  isBlackHole: boolean;
}

export interface SimMapData {
  sources: GravitySourceData[];
}

export function generateMap(prng: PRNG): SimMapData {
  const sources: GravitySourceData[] = [];
  const A = GravityPongArena;

  const numPlanets = prng.getRandomIntInclusive(A.minPlanets, A.maxPlanets);
  const numBlackHoles = prng.getRandomIntInclusive(A.minBlackHoles, A.maxBlackHoles);

  const minY = A.goalY1 + A.goalMargin;
  const maxY = A.goalY0 - A.goalMargin;
  const margin = 40;

  for (let i = 0; i < numPlanets + numBlackHoles; i++) {
    const isBlackHole = i >= numPlanets;

    let x: number;
    let y: number;
    let tries = 0;
    do {
      x = margin + prng.getFloat() * (A.width - margin * 2);
      y = minY + prng.getFloat() * (maxY - minY);
      tries++;
    } while (tries < 50 && !isValidPlacement(x, y, sources, A.planetMinDist));

    if (tries >= 50) continue;

    if (isBlackHole) {
      sources.push({
        x, y,
        mass: A.blackHoleMass,
        radius: A.blackHoleRadius,
        isBlackHole: true,
      });
    } else {
      const mass = A.minPlanetMass + prng.getFloat() * (A.maxPlanetMass - A.minPlanetMass);
      const radius = A.minPlanetRadius + prng.getFloat() * (A.maxPlanetRadius - A.minPlanetRadius);
      sources.push({
        x, y,
        mass,
        radius,
        isBlackHole: false,
      });
    }
  }

  return { sources };
}

function isValidPlacement(x: number, y: number, existing: GravitySourceData[], minDist: number): boolean {
  for (const src of existing) {
    const dx = x - src.x;
    const dy = y - src.y;
    if (dx * dx + dy * dy < minDist * minDist) {
      return false;
    }
  }
  return true;
}
