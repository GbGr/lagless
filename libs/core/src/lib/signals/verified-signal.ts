export interface ISignalConstructor {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  new (...args: any[]): VerifiedSignal;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export abstract class VerifiedSignal<TData = any> {
  private readonly _listeners = new Set<(data: TData) => void>();

  public abstract update(tick: number): void | TData;

  public onSimulate(tick: number, tickShift: number) {
    const adjustedTick = tick - tickShift;
    if (adjustedTick < 0) return;

    const data = this.update(adjustedTick);
    if (data === undefined) return;

    for (const listener of this._listeners) listener(data);
  }

  public addListener(listener: (data: TData) => void) {
    this._listeners.add(listener);

    return () => {
      this._listeners.delete(listener);
    };
  }

  public removeListener(listener: (data: TData) => void) {
    this._listeners.delete(listener);
  }
}
