import type { ICollisionProvider } from '../types/collision-provider.js';
import type { MapCollisionShape } from '../types/geometry.js';
import { ShapeType } from '../types/geometry.js';
import { testCircleCircle, testCircleAabb, testAabbAabb } from '../math/collision-test.js';

interface StoredShape {
  id: number;
  shape: MapCollisionShape;
  posX: number;
  posY: number;
  rotation: number;
  scale: number;
  minCellX: number;
  minCellY: number;
  maxCellX: number;
  maxCellY: number;
}

export class SpatialGridCollisionProvider implements ICollisionProvider {
  private readonly _cellSize: number;
  private readonly _gridW: number;
  private readonly _gridH: number;
  private readonly _cells: Map<number, number[]>;
  private readonly _shapes = new Map<number, StoredShape>();
  private _queryId = 0;
  private readonly _lastQueried = new Map<number, number>();

  constructor(width: number, height: number, cellSize = 32) {
    this._cellSize = cellSize;
    this._gridW = Math.ceil(width / cellSize);
    this._gridH = Math.ceil(height / cellSize);
    this._cells = new Map();
  }

  addShape(id: number, shape: MapCollisionShape, posX: number, posY: number, rotation: number, scale: number): void {
    const stored = this._createStoredShape(id, shape, posX, posY, rotation, scale);
    this._shapes.set(id, stored);

    for (let cy = stored.minCellY; cy <= stored.maxCellY; cy++) {
      for (let cx = stored.minCellX; cx <= stored.maxCellX; cx++) {
        const key = cy * this._gridW + cx;
        let cell = this._cells.get(key);
        if (!cell) {
          cell = [];
          this._cells.set(key, cell);
        }
        cell.push(id);
      }
    }
  }

  testShape(shape: MapCollisionShape, posX: number, posY: number, rotation: number, scale: number): boolean {
    this._queryId++;
    const queryId = this._queryId;
    const test = this._createStoredShape(-1, shape, posX, posY, rotation, scale);

    for (let cy = test.minCellY; cy <= test.maxCellY; cy++) {
      for (let cx = test.minCellX; cx <= test.maxCellX; cx++) {
        const key = cy * this._gridW + cx;
        const cell = this._cells.get(key);
        if (!cell) continue;

        for (const existingId of cell) {
          if (this._lastQueried.get(existingId) === queryId) continue;
          this._lastQueried.set(existingId, queryId);

          const existing = this._shapes.get(existingId);
          if (!existing) continue;

          if (this._testOverlap(test, existing)) {
            return true;
          }
        }
      }
    }

    return false;
  }

  removeShape(id: number): void {
    const stored = this._shapes.get(id);
    if (!stored) return;

    for (let cy = stored.minCellY; cy <= stored.maxCellY; cy++) {
      for (let cx = stored.minCellX; cx <= stored.maxCellX; cx++) {
        const key = cy * this._gridW + cx;
        const cell = this._cells.get(key);
        if (!cell) continue;

        const idx = cell.indexOf(id);
        if (idx !== -1) {
          cell.splice(idx, 1);
        }
        if (cell.length === 0) {
          this._cells.delete(key);
        }
      }
    }

    this._shapes.delete(id);
    this._lastQueried.delete(id);
  }

  clear(): void {
    this._cells.clear();
    this._shapes.clear();
    this._lastQueried.clear();
    this._queryId = 0;
  }

  private _createStoredShape(
    id: number, shape: MapCollisionShape,
    posX: number, posY: number,
    rotation: number, scale: number,
  ): StoredShape {
    let halfExtX: number;
    let halfExtY: number;

    if (shape.type === ShapeType.Circle) {
      const r = shape.radius * scale;
      halfExtX = r;
      halfExtY = r;
    } else {
      halfExtX = shape.halfWidth * scale;
      halfExtY = shape.halfHeight * scale;
    }

    const minCellX = Math.max(0, Math.floor((posX - halfExtX) / this._cellSize));
    const minCellY = Math.max(0, Math.floor((posY - halfExtY) / this._cellSize));
    const maxCellX = Math.min(this._gridW - 1, Math.floor((posX + halfExtX) / this._cellSize));
    const maxCellY = Math.min(this._gridH - 1, Math.floor((posY + halfExtY) / this._cellSize));

    return {
      id, shape, posX, posY, rotation, scale,
      minCellX, minCellY, maxCellX, maxCellY,
    };
  }

  private _testOverlap(a: StoredShape, b: StoredShape): boolean {
    const aShape = a.shape;
    const bShape = b.shape;

    if (aShape.type === ShapeType.Circle && bShape.type === ShapeType.Circle) {
      return testCircleCircle(
        a.posX, a.posY, aShape.radius * a.scale,
        b.posX, b.posY, bShape.radius * b.scale,
      );
    }

    if (aShape.type === ShapeType.Cuboid && bShape.type === ShapeType.Cuboid) {
      const aHW = aShape.halfWidth * a.scale;
      const aHH = aShape.halfHeight * a.scale;
      const bHW = bShape.halfWidth * b.scale;
      const bHH = bShape.halfHeight * b.scale;
      return testAabbAabb(
        a.posX - aHW, a.posY - aHH, a.posX + aHW, a.posY + aHH,
        b.posX - bHW, b.posY - bHH, b.posX + bHW, b.posY + bHH,
      );
    }

    // Circle vs Cuboid
    const [circ, box] = aShape.type === ShapeType.Circle ? [a, b] : [b, a];
    const circShape = circ.shape as { type: ShapeType.Circle; radius: number };
    const boxShape = box.shape as { type: ShapeType.Cuboid; halfWidth: number; halfHeight: number };
    const bHW = boxShape.halfWidth * box.scale;
    const bHH = boxShape.halfHeight * box.scale;

    return testCircleAabb(
      circ.posX, circ.posY, circShape.radius * circ.scale,
      box.posX - bHW, box.posY - bHH, box.posX + bHW, box.posY + bHH,
    );
  }
}
