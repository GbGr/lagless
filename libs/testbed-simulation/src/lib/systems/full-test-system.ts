import { EntitiesManager, Prefab } from '@lagless/core';
import { ECSSystem } from '@lagless/di';
import { IECSSystem } from '@lagless/types';
import {
  Position, Velocity, TestOnlyPositionFilter, TestOnlyVelocityFilter, TestPositionAndVelocityFilter,
} from '../schema/code-gen/index.js';

@ECSSystem()
export class FullTestSystem implements IECSSystem {
  private readonly _positionPrefab = Prefab.create().with(Position);
  private readonly _velocityPrefab = Prefab.create().with(Velocity);
  private readonly _positionAndVelocityPrefab = Prefab.create().with(Position).with(Velocity);

  constructor(
    private readonly _Position: Position,
    private readonly _Velocity: Velocity,
    public readonly TestOnlyPositionFilter: TestOnlyPositionFilter,
    public readonly TestOnlyVelocityFilter: TestOnlyVelocityFilter,
    public readonly TestPositionAndVelocityFilter: TestPositionAndVelocityFilter,
    private readonly _EntitiesManager: EntitiesManager,
  ) {}

  public update(tick: number): void {
    // Scenario:
    // Tick 1: Create entity with Position component
    // Tick 2: Create entity with Velocity component
    // Tick 3: Create entity with Position and Velocity components
    // Tick 4: Remove entity with Position component
    // Tick 5: Remove entity with Velocity component
    // Tick 6: Remove entity with Position and Velocity components
    switch (tick) {
      case 1: {
        this._EntitiesManager.createEntity(this._positionPrefab);
        break;
      }
      case 2: {
        this._EntitiesManager.createEntity(this._velocityPrefab);
        break;
      }
      case 3: {
        this._EntitiesManager.createEntity(this._positionAndVelocityPrefab);
        break;
      }
      case 4: {
        const entityToRemove = Array.from(this.TestOnlyPositionFilter)[0];
        if (entityToRemove === undefined) {
          throw new Error('No entity found in TestOnlyPositionFilter to remove');
        }
        this._EntitiesManager.removeEntity(entityToRemove);
        break;
      }
      case 5: {
        const entityToRemove = Array.from(this.TestOnlyVelocityFilter)[0];
        if (entityToRemove === undefined) {
          throw new Error('No entity found in TestOnlyVelocityFilter to remove');
        }
        this._EntitiesManager.removeEntity(entityToRemove);
        break;
      }
      case 6: {
        const entityToRemove = Array.from(this.TestPositionAndVelocityFilter)[0];
        if (entityToRemove === undefined) {
          throw new Error('No entity found in TestPositionAndVelocityFilter to remove');
        }
        this._EntitiesManager.removeEntity(entityToRemove);
        break;
      }
    }

    for (const positionEntity of this.TestOnlyPositionFilter) {
      this._Position.unsafe.x[positionEntity] = tick;
      this._Position.unsafe.y[positionEntity] = tick * 2;
    }

    for (const velocityEntity of this.TestOnlyVelocityFilter) {
      this._Velocity.unsafe.dx[velocityEntity] = tick * 3;
      this._Velocity.unsafe.dy[velocityEntity] = tick * 4;
    }
  }
}
