import { ECSSimulation } from '../ecs-simulation.js';

export abstract class AbstractInputProvider {
  protected _simulation!: ECSSimulation;

  public abstract getInvalidateRollbackTick(): void | number;

  public update(): void {
    // Optional to implement
  }

  public init(simulation: ECSSimulation): void {
    this._simulation = simulation;
  }
}
