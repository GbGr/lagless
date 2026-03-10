import { IECSSystemConstructor } from '@lagless/core';
import { SavePrevTransformSystem } from './save-prev-transform.system.js';
import { PlayerConnectionSystem } from './player-connection.system.js';
import { PlayerLeaveSystem } from './player-leave.system.js';
import { ApplyMoveInputSystem } from './apply-move-input.system.js';
import { PhysicsStepSystem } from './physics-step.system.js';

export const MapTestSystems: IECSSystemConstructor[] = [
  SavePrevTransformSystem,
  PlayerConnectionSystem,
  ApplyMoveInputSystem,
  PhysicsStepSystem,
  PlayerLeaveSystem,
];
