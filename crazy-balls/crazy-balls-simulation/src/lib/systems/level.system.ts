import { ECSSystem } from '@lagless/di';
import { IECSSystem } from '@lagless/types';
import { Physics2DWorld } from '@lagless/physics2d';
import { EntitiesManager, Prefab, PRNG } from '@lagless/core';
import { PhysicsRefs, Transform2d } from '../schema/code-gen/index.js';
import { MathOps } from '@lagless/math';
import Rapier from '@dimforge/rapier2d-deterministic-compat';

export class FinishError extends Error {
  constructor(message: string, public readonly entity: number) {
    super(message);
    this.name = 'FinishError';
  }
}

@ECSSystem()
export class LevelSystem implements IECSSystem {
  private readonly _ballPrefab = Prefab.create().with(PhysicsRefs).with(Transform2d);
  private finishCollider!: Rapier.Collider;
  private readonly _colliderToEntityMap = new Map<number, number>();
  private readonly _entityToColliderMap = new Map<number, number>();

  public static deps = [Physics2DWorld, EntitiesManager, PhysicsRefs, PRNG];

  constructor(
    private readonly _World: Physics2DWorld,
    private readonly _EntitiesManager: EntitiesManager,
    private readonly _PhysicsRefs: PhysicsRefs,
    private readonly _PRNG: PRNG,
  ) {
    this.createLevel();

    for (let i = 0; i < 100; i++) {
      this.createBall();
    }
  }

  public update(tick: number): void {
    let entityRes: number | undefined;
    this._World.intersectionPairsWith(this.finishCollider, (collider: any) => {
      if (entityRes !== undefined) return;
      entityRes = this._colliderToEntityMap.get(collider.handle);
    });
    if (entityRes !== undefined) {
      throw new FinishError('Finish reached', entityRes);
    }
  }

  private createBall(): void {
    const ballColliderDesc = Rapier.ColliderDesc.ball(fromPX(5));
    ballColliderDesc.setTranslation(fromPX(this._PRNG.getRandomInt(100, 300)), fromPX(this._PRNG.getRandomInt(-100, 100)));
    ballColliderDesc.setRestitution(0.8);
    ballColliderDesc.setFriction(0.5);
    ballColliderDesc.setDensity(1.0);
    ballColliderDesc.setMass(0.1);
    const ballRigidBody = this._World.createRigidBody(Rapier.RigidBodyDesc.dynamic());
    const ballCollider = this._World.createCollider(ballColliderDesc, ballRigidBody);

    const ballEntity = this._EntitiesManager.createEntity(this._ballPrefab);
    this._PhysicsRefs.unsafe.rigidBodyRef[ballEntity] = ballRigidBody;
    this._PhysicsRefs.unsafe.colliderRef[ballEntity] = ballCollider;

    this._colliderToEntityMap.set(ballCollider.handle, ballEntity);
    this._entityToColliderMap.set(ballEntity, ballCollider.handle);
  }

  private createLevel(): void {
    this.createRectObstacle(40, -30, 10, 200, MathOps.Deg2Rad * 45);
    this.createRectObstacle(100, -200, 10, 200);
    this.createRectObstacle(360, -30, 10, 200, MathOps.Deg2Rad * -45);
    this.createRectObstacle(300, -200, 10, 200);

    this.createRectObstacle(180, -330, 10, 200, MathOps.Deg2Rad * 65);

    // create pins in checkmate position
    const step = 50;
    const x = 120;
    const y = -280;
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        this.createPinObstacle(x + j * step, y + i * step);
      }
    }

    this.createFinishRectObstacle(400, -400, 100, 20);
  }

  private createRectObstacle(x: number, y: number, w: number, h: number, angle = 0): void {
    const obstacleColliderDesc = Rapier.ColliderDesc.cuboid(fromPX(w / 2), fromPX(h / 2));
    obstacleColliderDesc.setTranslation(fromPX(x), fromPX(y));
    obstacleColliderDesc.setRotation(angle);
    obstacleColliderDesc.setRestitution(1);
    obstacleColliderDesc.setFriction(0.5);
    obstacleColliderDesc.setDensity(1.0);
    const obstacleRigidBody = this._World.createRigidBody(Rapier.RigidBodyDesc.fixed());
    this._World.createCollider(obstacleColliderDesc, obstacleRigidBody);
  }

  private createFinishRectObstacle(x: number, y: number, w: number, h: number): void {
    const finishColliderDesc = Rapier.ColliderDesc.cuboid(fromPX(w / 2), fromPX(h / 2));
    finishColliderDesc.setTranslation(fromPX(x), fromPX(y));
    finishColliderDesc.setSensor(true);
    const finishRigidBody = this._World.createRigidBody(Rapier.RigidBodyDesc.fixed());
    const finishCollider = this._World.createCollider(finishColliderDesc, finishRigidBody);
    this.finishCollider = finishCollider;
  }

  private createPinObstacle(x: number, y: number): void {
    const pinColliderDesc = Rapier.ColliderDesc.ball(fromPX(4));
    pinColliderDesc.setTranslation(fromPX(x), fromPX(y));
    pinColliderDesc.setRestitution(1);
    pinColliderDesc.setFriction(0.5);
    pinColliderDesc.setDensity(1.0);
    const pinRigidBody = this._World.createRigidBody(Rapier.RigidBodyDesc.fixed());
    this._World.createCollider(pinColliderDesc, pinRigidBody);
  }
}

// const toPX = (x: number): number => {
//   return x * 20;
// }

const fromPX = (x: number): number => {
  return x / 20;
}
