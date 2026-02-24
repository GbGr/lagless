import { ECSSystem, IECSSystem } from '@lagless/core';
import {
  Transform2d, Ball, GravitySource, Velocity2d,
  BallFilter, GravitySourceFilter, MatchState,
} from '../schema/code-gen/index.js';
import { GravityPongArena } from '../arena.js';
import { BallAbsorbedSignal } from '../signals/index.js';

@ECSSystem()
export class BlackHoleSystem implements IECSSystem {
  constructor(
    private readonly _BallFilter: BallFilter,
    private readonly _GravitySourceFilter: GravitySourceFilter,
    private readonly _Transform2d: Transform2d,
    private readonly _Ball: Ball,
    private readonly _Velocity2d: Velocity2d,
    private readonly _GravitySource: GravitySource,
    private readonly _MatchState: MatchState,
    private readonly _BallAbsorbedSignal: BallAbsorbedSignal,
  ) {}

  public update(tick: number): void {
    if (this._MatchState.safe.phase !== 2) return;

    const absorbR = GravityPongArena.blackHoleAbsorbRadius;

    for (const ballEntity of this._BallFilter) {
      if (this._Ball.unsafe.active[ballEntity] !== 1) continue;

      const bx = this._Transform2d.unsafe.positionX[ballEntity];
      const by = this._Transform2d.unsafe.positionY[ballEntity];

      for (const srcEntity of this._GravitySourceFilter) {
        if (this._GravitySource.unsafe.isBlackHole[srcEntity] !== 1) continue;

        const sx = this._Transform2d.unsafe.positionX[srcEntity];
        const sy = this._Transform2d.unsafe.positionY[srcEntity];
        const dx = bx - sx;
        const dy = by - sy;

        if (dx * dx + dy * dy < absorbR * absorbR) {
          const slot = this._Ball.unsafe.ownerSlot[ballEntity];
          this._Ball.unsafe.active[ballEntity] = 0;
          this._Velocity2d.unsafe.velocityX[ballEntity] = 0;
          this._Velocity2d.unsafe.velocityY[ballEntity] = 0;
          this._MatchState.safe.ballsResolved = this._MatchState.safe.ballsResolved | (1 << slot);
          this._BallAbsorbedSignal.emit(tick, { ownerSlot: slot, x: bx, y: by });
          break;
        }
      }
    }
  }
}
