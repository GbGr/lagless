import { SpatialGridCollisionProvider } from '../../lib/collision/spatial-grid-provider.js';
import type { MapCollisionShape } from '../../lib/types/geometry.js';
import { ShapeType } from '../../lib/types/geometry.js';

describe('SpatialGridCollisionProvider', () => {
  let grid: SpatialGridCollisionProvider;

  beforeEach(() => {
    grid = new SpatialGridCollisionProvider(512, 512, 32);
  });

  const circle = (r: number): MapCollisionShape => ({ type: ShapeType.Circle, radius: r });
  const aabb = (hw: number, hh: number): MapCollisionShape => ({ type: ShapeType.Cuboid, halfWidth: hw, halfHeight: hh });

  describe('addShape + testShape', () => {
    it('should detect circle-circle overlap', () => {
      grid.addShape(1, circle(10), 100, 100, 0, 1);

      expect(grid.testShape(circle(10), 115, 100, 0, 1)).toBe(true);
    });

    it('should not detect non-overlapping circles', () => {
      grid.addShape(1, circle(10), 100, 100, 0, 1);

      expect(grid.testShape(circle(10), 200, 200, 0, 1)).toBe(false);
    });

    it('should detect AABB-AABB overlap', () => {
      grid.addShape(1, aabb(10, 10), 100, 100, 0, 1);

      expect(grid.testShape(aabb(10, 10), 115, 100, 0, 1)).toBe(true);
    });

    it('should not detect non-overlapping AABBs', () => {
      grid.addShape(1, aabb(10, 10), 100, 100, 0, 1);

      expect(grid.testShape(aabb(10, 10), 200, 200, 0, 1)).toBe(false);
    });

    it('should detect circle-AABB overlap', () => {
      grid.addShape(1, aabb(10, 10), 100, 100, 0, 1);

      expect(grid.testShape(circle(5), 115, 100, 0, 1)).toBe(true);
    });

    it('should handle scale parameter', () => {
      grid.addShape(1, circle(10), 100, 100, 0, 2);

      // Scaled radius = 20, so overlap at distance 25 with radius 10 = false
      expect(grid.testShape(circle(10), 135, 100, 0, 1)).toBe(false);
      // But at distance 25 with both shapes total reach = 20 + 10 = 30 > 25
      expect(grid.testShape(circle(10), 125, 100, 0, 1)).toBe(true);
    });
  });

  describe('removeShape', () => {
    it('should remove shape so it no longer collides', () => {
      grid.addShape(1, circle(10), 100, 100, 0, 1);

      expect(grid.testShape(circle(10), 115, 100, 0, 1)).toBe(true);

      grid.removeShape(1);

      expect(grid.testShape(circle(10), 115, 100, 0, 1)).toBe(false);
    });
  });

  describe('clear', () => {
    it('should remove all shapes', () => {
      grid.addShape(1, circle(10), 100, 100, 0, 1);
      grid.addShape(2, circle(10), 200, 200, 0, 1);

      grid.clear();

      expect(grid.testShape(circle(10), 115, 100, 0, 1)).toBe(false);
      expect(grid.testShape(circle(10), 215, 200, 0, 1)).toBe(false);
    });
  });

  describe('queryId dedup', () => {
    it('should not double-count shapes spanning multiple cells', () => {
      // Place a shape at a cell boundary (cellSize=32, so 64 is on boundary)
      grid.addShape(1, circle(20), 64, 64, 0, 1);

      // Test at a point that overlaps - should detect once, not error
      const result = grid.testShape(circle(5), 70, 64, 0, 1);
      expect(result).toBe(true);
    });
  });

  describe('shapes at grid boundaries', () => {
    it('should detect shapes across cell boundaries', () => {
      // Shape in one cell
      grid.addShape(1, circle(10), 30, 30, 0, 1);
      // Test shape in adjacent cell
      expect(grid.testShape(circle(10), 42, 30, 0, 1)).toBe(true);
    });

    it('should handle shapes near map edges', () => {
      grid.addShape(1, circle(10), 5, 5, 0, 1);
      expect(grid.testShape(circle(10), 10, 5, 0, 1)).toBe(true);
    });
  });

});
