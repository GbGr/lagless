import { ECSSystem } from '@lagless/di';
import { Position } from '../schema/code-gen/index.js';
import { IECSSystem } from '@lagless/types';

@ECSSystem()
export class TestSystem implements IECSSystem {
  constructor(
    public readonly Position: Position,
  ) {}

  public update(tick: number): void {
    this.Position.unsafe.x[0] = tick;
    this.Position.unsafe.y[0] += 2;
  }
}
