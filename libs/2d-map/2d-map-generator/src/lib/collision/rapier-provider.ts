import type { ICollisionProvider } from '../types/collision-provider.js';
import type { MapCollisionShape } from '../types/geometry.js';
import { ShapeType } from '../types/geometry.js';

interface RapierVector2 {
  x: number;
  y: number;
}

interface RapierRigidBodyDesc {
  setTranslation(x: number, y: number): RapierRigidBodyDesc;
  setRotation(rotation: number): RapierRigidBodyDesc;
}

interface RapierRigidBody {
  handle: number;
}

interface RapierWorld {
  createRigidBody(desc: RapierRigidBodyDesc): RapierRigidBody;
  createCollider(desc: RapierColliderDesc, body: RapierRigidBody): unknown;
  removeRigidBody(body: RapierRigidBody): void;
  getRigidBody(handle: number): RapierRigidBody | null;
  intersectionsWithShape(
    pos: RapierVector2, rotation: number, shape: RapierShape,
    callback: (handle: number) => boolean,
  ): void;
  step(): void;
}

interface RapierShape {
  readonly __rapierShape?: unknown;
}

interface RapierColliderDesc {
  readonly __rapierColliderDesc?: unknown;
}

export interface RapierModule2dLike {
  Vector2: new (x: number, y: number) => RapierVector2;
  World: new (gravity: RapierVector2) => RapierWorld;
  RigidBodyDesc: { fixed(): RapierRigidBodyDesc };
  ColliderDesc: {
    ball(radius: number): RapierColliderDesc;
    cuboid(halfWidth: number, halfHeight: number): RapierColliderDesc;
  };
  Ball: new (radius: number) => RapierShape;
  Cuboid: new (halfWidth: number, halfHeight: number) => RapierShape;
}

export class RapierCollisionProvider implements ICollisionProvider {
  private readonly _rapier: RapierModule2dLike;
  private _world: RapierWorld;
  private readonly _bodies: Map<number, number> = new Map();

  constructor(rapier: RapierModule2dLike) {
    this._rapier = rapier;
    const gravity = new rapier.Vector2(0, 0);
    this._world = new rapier.World(gravity);
  }

  addShape(id: number, shape: MapCollisionShape, posX: number, posY: number, rotation: number, scale: number): void {
    const colliderDesc = this._createColliderDesc(shape, scale);
    if (!colliderDesc) return;

    const R = this._rapier;
    const bodyDesc = R.RigidBodyDesc.fixed()
      .setTranslation(posX, posY)
      .setRotation(rotation);
    const body = this._world.createRigidBody(bodyDesc);
    this._world.createCollider(colliderDesc, body);
    this._bodies.set(id, body.handle);
  }

  testShape(shape: MapCollisionShape, posX: number, posY: number, rotation: number, scale: number): boolean {
    const rapierShape = this._createShape(shape, scale);
    if (!rapierShape) return false;

    const position = new this._rapier.Vector2(posX, posY);

    this._world.step();

    let hasOverlap = false;
    this._world.intersectionsWithShape(position, rotation, rapierShape, () => {
      hasOverlap = true;
      return false;
    });

    return hasOverlap;
  }

  removeShape(id: number): void {
    const handle = this._bodies.get(id);
    if (handle === undefined) return;

    const body = this._world.getRigidBody(handle);
    if (body) {
      this._world.removeRigidBody(body);
    }
    this._bodies.delete(id);
  }

  clear(): void {
    const gravity = new this._rapier.Vector2(0, 0);
    this._world = new this._rapier.World(gravity);
    this._bodies.clear();
  }

  private _createShape(shape: MapCollisionShape, scale: number): RapierShape | null {
    const R = this._rapier;
    if (shape.type === ShapeType.Circle) return new R.Ball(shape.radius * scale);
    if (shape.type === ShapeType.Cuboid) return new R.Cuboid(shape.halfWidth * scale, shape.halfHeight * scale);
    return null;
  }

  private _createColliderDesc(shape: MapCollisionShape, scale: number): RapierColliderDesc | null {
    const R = this._rapier;
    if (shape.type === ShapeType.Circle) return R.ColliderDesc.ball(shape.radius * scale);
    if (shape.type === ShapeType.Cuboid) return R.ColliderDesc.cuboid(shape.halfWidth * scale, shape.halfHeight * scale);
    return null;
  }
}
