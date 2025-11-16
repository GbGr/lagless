import { ECSConfig } from '../ecs-config.js';
import { VerifiedSignal } from './verified-signal.js';

export class SignalsRegistry {
  private readonly _tickShift: number;
  private readonly _Signals = new Array<VerifiedSignal>();

  constructor(
    private readonly _ECSConfig: ECSConfig,
  ) {
    this._tickShift = this._ECSConfig.maxInputDelayTick;
  }

  public init(signals: VerifiedSignal[]): void {
    if (this._Signals.length !== 0) throw new Error('Signals already registered');
    for (const signal of signals) this._Signals.push(signal);
  }

  public update(tick: number): void {
    for (const signal of this._Signals) signal.onSimulate(tick, this._tickShift);
  }
}
