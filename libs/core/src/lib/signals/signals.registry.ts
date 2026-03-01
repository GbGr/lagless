import { Signal } from './signal.js';

export class SignalsRegistry {
  private readonly _signals: Signal[] = [];

  public init(signals: Signal[]): void {
    if (this._signals.length !== 0) {
      throw new Error('Signals already registered');
    }
    for (const signal of signals) {
      this._signals.push(signal);
    }
  }

  public onTick(verifiedTick: number): void {
    for (const signal of this._signals) {
      signal._onTick(verifiedTick);
    }
  }

  public onBeforeRollback(toTick: number): void {
    for (const signal of this._signals) {
      signal._onBeforeRollback(toTick);
    }
  }

  public dispose(): void {
    for (const signal of this._signals) {
      signal.dispose();
    }
    this._signals.length = 0;
  }
}
