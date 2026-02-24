import { ECSSystem, IECSSystem, PlayerResources } from '@lagless/core';
import {
  Transform2d, Ball, Velocity2d,
  BallFilter, MatchState, PlayerResource,
} from '../schema/code-gen/index.js';
import { GravityPongArena } from '../arena.js';
import { GoalSignal } from '../signals/index.js';

@ECSSystem()
export class GoalDetectionSystem implements IECSSystem {
  constructor(
    private readonly _BallFilter: BallFilter,
    private readonly _Transform2d: Transform2d,
    private readonly _Ball: Ball,
    private readonly _Velocity2d: Velocity2d,
    private readonly _MatchState: MatchState,
    private readonly _PlayerResources: PlayerResources,
    private readonly _GoalSignal: GoalSignal,
  ) {}

  public update(tick: number): void {
    if (this._MatchState.safe.phase !== 2) return;

    const A = GravityPongArena;

    for (const ballEntity of this._BallFilter) {
      if (this._Ball.unsafe.active[ballEntity] !== 1) continue;

      const bx = this._Transform2d.unsafe.positionX[ballEntity];
      const by = this._Transform2d.unsafe.positionY[ballEntity];
      const ownerSlot = this._Ball.unsafe.ownerSlot[ballEntity];
      const centerX = A.width / 2;

      // Check bottom goal (P0's goal)
      if (by > A.goalY0) {
        this._Ball.unsafe.active[ballEntity] = 0;
        this._Velocity2d.unsafe.velocityX[ballEntity] = 0;
        this._Velocity2d.unsafe.velocityY[ballEntity] = 0;
        this._MatchState.safe.ballsResolved = this._MatchState.safe.ballsResolved | (1 << ownerSlot);

        if (Math.abs(bx - centerX) < A.goalHalfWidth) {
          // Goal scored! P1 scores (ball entered P0's goal)
          const scorerSlot = 1;
          this._MatchState.safe.scoreP1 = this._MatchState.safe.scoreP1 + 1;
          const pr = this._PlayerResources.get(PlayerResource as any, scorerSlot);
          pr!.safe.score = pr!.safe.score + 1;
          this._GoalSignal.emit(tick, { scorerSlot, goalOwnerSlot: 0, x: bx, y: by });
        }
        continue;
      }

      // Check top goal (P1's goal)
      if (by < A.goalY1) {
        this._Ball.unsafe.active[ballEntity] = 0;
        this._Velocity2d.unsafe.velocityX[ballEntity] = 0;
        this._Velocity2d.unsafe.velocityY[ballEntity] = 0;
        this._MatchState.safe.ballsResolved = this._MatchState.safe.ballsResolved | (1 << ownerSlot);

        if (Math.abs(bx - centerX) < A.goalHalfWidth) {
          // Goal scored! P0 scores (ball entered P1's goal)
          const scorerSlot = 0;
          this._MatchState.safe.scoreP0 = this._MatchState.safe.scoreP0 + 1;
          const pr = this._PlayerResources.get(PlayerResource as any, scorerSlot);
          pr!.safe.score = pr!.safe.score + 1;
          this._GoalSignal.emit(tick, { scorerSlot, goalOwnerSlot: 1, x: bx, y: by });
        }
        continue;
      }
    }
  }
}
