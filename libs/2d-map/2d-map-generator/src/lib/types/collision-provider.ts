import type { MapCollisionShape } from './geometry.js';

export interface ICollisionProvider {
  addShape(id: number, shape: MapCollisionShape, posX: number, posY: number, rotation: number, scale: number): void;
  testShape(shape: MapCollisionShape, posX: number, posY: number, rotation: number, scale: number): boolean;
  removeShape(id: number): void;
  clear(): void;
}
