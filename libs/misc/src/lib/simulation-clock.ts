import { now } from './now.js';
import { PhaseNudger } from './phase-nudger.js';

export class SimulationClock {
  private _startedTime = 0;
  private _accumulatedTime = 0;
  private readonly _frameLength: number;

  public readonly phaseNudger: PhaseNudger;

  constructor(
    frameLength: number,
    maxNudgePerFrame: number,
  ) {
    this._frameLength = frameLength;
    this.phaseNudger = new PhaseNudger(frameLength, maxNudgePerFrame);
  }

  public get startedTime(): number {
    return this._startedTime;
  }

  public get accumulatedTime(): number {
    return this._accumulatedTime;
  }

  public getElapsedTime = (): number => {
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

  public syncToTick(tick: number): void {
    if (!Number.isFinite(tick) || tick < 0) {
      throw new Error('tick must be a non-negative number');
    }

    this._accumulatedTime = tick * this._frameLength;
    if (this._startedTime !== 0) {
      this._startedTime = now() - this._accumulatedTime;
    }
  }

  public update(dt: number): void {
    this._accumulatedTime += dt + this.phaseNudger.drain();
  }
}
