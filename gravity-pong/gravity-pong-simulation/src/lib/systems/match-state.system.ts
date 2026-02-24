import { ECSSystem, IECSSystem, PlayerResources } from '@lagless/core';
import {
  MatchState, PlayerResource, Ball, Velocity2d, Transform2d, BallFilter,
} from '../schema/code-gen/index.js';
import { GravityPongArena } from '../arena.js';
import { RoundStartSignal, MatchOverSignal } from '../signals/index.js';

@ECSSystem()
export class MatchStateSystem implements IECSSystem {
  constructor(
    private readonly _MatchState: MatchState,
    private readonly _PlayerResources: PlayerResources,
    private readonly _Ball: Ball,
    private readonly _Velocity2d: Velocity2d,
    private readonly _Transform2d: Transform2d,
    private readonly _BallFilter: BallFilter,
    private readonly _RoundStartSignal: RoundStartSignal,
    private readonly _MatchOverSignal: MatchOverSignal,
  ) {}

  public update(tick: number): void {
    const phase = this._MatchState.safe.phase;
    const elapsed = tick - this._MatchState.safe.phaseStartTick;

    // Flight phase → check if both balls resolved or timeout
    if (phase === 2) {
      const allResolved = (this._MatchState.safe.ballsResolved & 3) === 3;
      if (allResolved || elapsed >= GravityPongArena.flightTimeoutTicks) {
        // Force resolve any remaining balls on timeout
        if (!allResolved) {
          for (const ballEntity of this._BallFilter) {
            if (this._Ball.unsafe.active[ballEntity] === 1) {
              const slot = this._Ball.unsafe.ownerSlot[ballEntity];
              this._Ball.unsafe.active[ballEntity] = 0;
              this._Velocity2d.unsafe.velocityX[ballEntity] = 0;
              this._Velocity2d.unsafe.velocityY[ballEntity] = 0;
              this._MatchState.safe.ballsResolved = this._MatchState.safe.ballsResolved | (1 << slot);
            }
          }
        }
        this._MatchState.safe.phase = 3;
        this._MatchState.safe.phaseStartTick = tick;
      }
      return;
    }

    // Round end phase → check for match over or start next round
    if (phase === 3 && elapsed >= GravityPongArena.roundEndTicks) {
      const scoreP0 = this._MatchState.safe.scoreP0;
      const scoreP1 = this._MatchState.safe.scoreP1;

      if (scoreP0 >= GravityPongArena.scoreToWin || scoreP1 >= GravityPongArena.scoreToWin) {
        this._MatchState.safe.phase = 4;
        this._MatchState.safe.phaseStartTick = tick;
        const winnerSlot = scoreP0 >= GravityPongArena.scoreToWin ? 0 : 1;
        this._MatchOverSignal.emit(tick, { winnerSlot, scoreP0, scoreP1 });
        return;
      }

      // Reset for next round
      this._resetRound(tick);
      return;
    }
  }

  private _resetRound(tick: number): void {
    const A = GravityPongArena;

    // Reset player shooting state
    for (let slot = 0; slot < 2; slot++) {
      const pr = this._PlayerResources.get(PlayerResource as any, slot);
      pr!.safe.hasShot = 0;
      pr!.safe.shootAngle = 0;
      pr!.safe.shootPower = 0;
    }

    // Reset balls to launch positions
    for (const ballEntity of this._BallFilter) {
      const slot = this._Ball.unsafe.ownerSlot[ballEntity];
      const launchX = A.ballLaunchX;
      const launchY = slot === 0 ? A.ballLaunchY0 : A.ballLaunchY1;

      this._Transform2d.unsafe.positionX[ballEntity] = launchX;
      this._Transform2d.unsafe.positionY[ballEntity] = launchY;
      this._Transform2d.unsafe.prevPositionX[ballEntity] = launchX;
      this._Transform2d.unsafe.prevPositionY[ballEntity] = launchY;
      this._Velocity2d.unsafe.velocityX[ballEntity] = 0;
      this._Velocity2d.unsafe.velocityY[ballEntity] = 0;
      this._Ball.unsafe.active[ballEntity] = 0;
    }

    this._MatchState.safe.ballsResolved = 0;
    this._MatchState.safe.roundNumber = this._MatchState.safe.roundNumber + 1;
    this._MatchState.safe.phase = 1;
    this._MatchState.safe.phaseStartTick = tick;
    this._RoundStartSignal.emit(tick, { roundNumber: this._MatchState.safe.roundNumber });
  }
}
