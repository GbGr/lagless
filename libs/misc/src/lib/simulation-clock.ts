import { now } from './now.js';

export class SimulationClock {
  private _startedTime = 0;
  private _accumulatedTime = 0;

  public get startedTime(): number {
    return this._startedTime;
  }

  public get accumulatedTime(): number {
    return this._accumulatedTime;
  }

  public getElapsedTime(): number {
    if (this._startedTime === 0) {
      throw new Error('SimulationClock has not been started yet.');
    }
    return now() - this._startedTime;
  }

  public start(): void {
    if (this._startedTime !== 0) {
      throw new Error('SimulationClock has already been started.');
    }
    this._startedTime = now();
    this._accumulatedTime = 0;
  }

  public update(dt: number): void {
    this._accumulatedTime += dt;
  }
}
