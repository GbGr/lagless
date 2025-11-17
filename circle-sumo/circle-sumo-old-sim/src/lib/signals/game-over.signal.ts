import { ECSConfig, ECSSignal, VerifiedSignal } from '@lagless/core';
import { GameState } from '../schema/code-gen/index.js';

@ECSSignal()
export class GameOverSignal extends VerifiedSignal<{ tick: number; delayedTick: number }> {
  private readonly _maxInputDelayTick: number;

  constructor(private readonly _ECSConfig: ECSConfig, private readonly _GameState: GameState) {
    super();
    this._maxInputDelayTick = this._ECSConfig.maxInputDelayTick;
  }

  public override update(tick: number) {
    const delayedTick = tick - this._maxInputDelayTick;
    if (delayedTick <= 0) return undefined;
    if (this._GameState.safe.finishedAtTick === delayedTick) {
      return { tick: delayedTick, delayedTick: tick };
    }

    return undefined;
  }
}
