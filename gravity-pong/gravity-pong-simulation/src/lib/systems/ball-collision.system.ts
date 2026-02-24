import { ECSSystem, IECSSystem } from '@lagless/core';
import { MathOps } from '@lagless/math';
import {
  Transform2d, Velocity2d, Ball, GravitySource,
  BallFilter, GravitySourceFilter, MatchState,
} from '../schema/code-gen/index.js';
import { GravityPongArena } from '../arena.js';

@ECSSystem()
export class BallCollisionSystem implements IECSSystem {
  constructor(
    private readonly _BallFilter: BallFilter,
    private readonly _GravitySourceFilter: GravitySourceFilter,
    private readonly _Transform2d: Transform2d,
    private readonly _Velocity2d: Velocity2d,
    private readonly _Ball: Ball,
    private readonly _GravitySource: GravitySource,
    private readonly _MatchState: MatchState,
  ) {}

  public update(): void {
    if (this._MatchState.safe.phase !== 2) return;

    const A = GravityPongArena;

    // Collect active ball entities
    const balls: number[] = [];
    for (const entity of this._BallFilter) {
      if (this._Ball.unsafe.active[entity] === 1) {
        balls.push(entity);
      }
    }

    // Ball vs ball collision
    for (let i = 0; i < balls.length; i++) {
      for (let j = i + 1; j < balls.length; j++) {
        const a = balls[i];
        const b = balls[j];
        const ax = this._Transform2d.unsafe.positionX[a];
        const ay = this._Transform2d.unsafe.positionY[a];
        const bx = this._Transform2d.unsafe.positionX[b];
        const by = this._Transform2d.unsafe.positionY[b];

        const dx = bx - ax;
        const dy = by - ay;
        const distSq = dx * dx + dy * dy;
        const minDist = A.ballRadius * 2;

        if (distSq < minDist * minDist && distSq > 0) {
          const dist = MathOps.sqrt(distSq);
          const nx = dx / dist;
          const ny = dy / dist;

          // Relative velocity along collision normal
          const avx = this._Velocity2d.unsafe.velocityX[a];
          const avy = this._Velocity2d.unsafe.velocityY[a];
          const bvx = this._Velocity2d.unsafe.velocityX[b];
          const bvy = this._Velocity2d.unsafe.velocityY[b];

          const relV = (bvx - avx) * nx + (bvy - avy) * ny;
          if (relV >= 0) continue; // Moving apart

          // Elastic collision (equal mass)
          this._Velocity2d.unsafe.velocityX[a] += relV * nx;
          this._Velocity2d.unsafe.velocityY[a] += relV * ny;
          this._Velocity2d.unsafe.velocityX[b] -= relV * nx;
          this._Velocity2d.unsafe.velocityY[b] -= relV * ny;

          // Separate
          const overlap = minDist - dist;
          this._Transform2d.unsafe.positionX[a] -= nx * overlap * 0.5;
          this._Transform2d.unsafe.positionY[a] -= ny * overlap * 0.5;
          this._Transform2d.unsafe.positionX[b] += nx * overlap * 0.5;
          this._Transform2d.unsafe.positionY[b] += ny * overlap * 0.5;
        }
      }
    }

    // Ball vs planet surface bounce
    for (const ballEntity of balls) {
      const bx = this._Transform2d.unsafe.positionX[ballEntity];
      const by = this._Transform2d.unsafe.positionY[ballEntity];

      for (const srcEntity of this._GravitySourceFilter) {
        if (this._GravitySource.unsafe.isBlackHole[srcEntity] === 1) continue;

        const sx = this._Transform2d.unsafe.positionX[srcEntity];
        const sy = this._Transform2d.unsafe.positionY[srcEntity];
        const planetRadius = this._GravitySource.unsafe.radius[srcEntity];
        const collisionDist = planetRadius + A.ballRadius + A.planetBounceRadius;

        const dx = bx - sx;
        const dy = by - sy;
        const distSq = dx * dx + dy * dy;

        if (distSq < collisionDist * collisionDist && distSq > 0) {
          const dist = MathOps.sqrt(distSq);
          const nx = dx / dist;
          const ny = dy / dist;

          // Reflect velocity off surface normal
          const vx = this._Velocity2d.unsafe.velocityX[ballEntity];
          const vy = this._Velocity2d.unsafe.velocityY[ballEntity];
          const dot = vx * nx + vy * ny;

          if (dot < 0) {
            this._Velocity2d.unsafe.velocityX[ballEntity] = vx - 2 * dot * nx;
            this._Velocity2d.unsafe.velocityY[ballEntity] = vy - 2 * dot * ny;
          }

          // Push out
          const overlap = collisionDist - dist;
          this._Transform2d.unsafe.positionX[ballEntity] += nx * overlap;
          this._Transform2d.unsafe.positionY[ballEntity] += ny * overlap;
        }
      }
    }

    // Ball vs arena walls (left/right only — top/bottom handled by goal detection)
    for (const ballEntity of balls) {
      const bx = this._Transform2d.unsafe.positionX[ballEntity];

      if (bx < A.ballRadius) {
        this._Transform2d.unsafe.positionX[ballEntity] = A.ballRadius;
        this._Velocity2d.unsafe.velocityX[ballEntity] = -this._Velocity2d.unsafe.velocityX[ballEntity];
      } else if (bx > A.width - A.ballRadius) {
        this._Transform2d.unsafe.positionX[ballEntity] = A.width - A.ballRadius;
        this._Velocity2d.unsafe.velocityX[ballEntity] = -this._Velocity2d.unsafe.velocityX[ballEntity];
      }
    }
  }
}
