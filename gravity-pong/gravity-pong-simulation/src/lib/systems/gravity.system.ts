import { ECSSystem, IECSSystem } from '@lagless/core';
import { MathOps } from '@lagless/math';
import {
  Transform2d, Velocity2d, Ball, GravitySource,
  BallFilter, GravitySourceFilter, MatchState,
} from '../schema/code-gen/index.js';
import { GravityPongArena } from '../arena.js';

const MIN_DIST_SQ = 400; // avoid singularity (20^2)

@ECSSystem()
export class GravitySystem implements IECSSystem {
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

    const G = GravityPongArena.gravityConstant;
    const maxSpeed = GravityPongArena.maxBallSpeed;
    const maxSpeedSq = maxSpeed * maxSpeed;

    for (const ballEntity of this._BallFilter) {
      if (this._Ball.unsafe.active[ballEntity] !== 1) continue;

      const bx = this._Transform2d.unsafe.positionX[ballEntity];
      const by = this._Transform2d.unsafe.positionY[ballEntity];

      for (const srcEntity of this._GravitySourceFilter) {
        const sx = this._Transform2d.unsafe.positionX[srcEntity];
        const sy = this._Transform2d.unsafe.positionY[srcEntity];
        const mass = this._GravitySource.unsafe.mass[srcEntity];

        const dx = sx - bx;
        const dy = sy - by;
        const distSq = dx * dx + dy * dy;

        if (distSq < MIN_DIST_SQ) continue;

        const dist = MathOps.sqrt(distSq);
        const force = G * mass / distSq;
        const fx = force * dx / dist;
        const fy = force * dy / dist;

        this._Velocity2d.unsafe.velocityX[ballEntity] += fx;
        this._Velocity2d.unsafe.velocityY[ballEntity] += fy;
      }

      // Clamp speed to prevent runaway acceleration near planets
      const vx = this._Velocity2d.unsafe.velocityX[ballEntity];
      const vy = this._Velocity2d.unsafe.velocityY[ballEntity];
      const speedSq = vx * vx + vy * vy;
      if (speedSq > maxSpeedSq) {
        const scale = maxSpeed / MathOps.sqrt(speedSq);
        this._Velocity2d.unsafe.velocityX[ballEntity] = vx * scale;
        this._Velocity2d.unsafe.velocityY[ballEntity] = vy * scale;
      }
    }
  }
}
