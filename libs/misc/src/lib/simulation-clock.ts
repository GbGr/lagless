import { now } from './now.js';
import { PhaseNudger } from './phase-nudger.js';

export class SimulationClock {
  private _startedTime = 0;
  private _accumulatedTime = 0;

  public readonly phaseNudger: PhaseNudger;

  constructor(
    frameLength: number,
    maxNudgePerFrame: number,
  ) {
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

  public update(dt: number): void {
    this._accumulatedTime += dt + this.phaseNudger.drain();
  }
}
