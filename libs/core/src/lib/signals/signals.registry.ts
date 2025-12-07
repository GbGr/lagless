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

  public onTick(currentTick: number): void {
    for (const signal of this._signals) {
      signal._onTick(currentTick);
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
