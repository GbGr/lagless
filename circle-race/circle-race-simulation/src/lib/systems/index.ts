import { IECSSystemConstructor } from '@lagless/core';
import { Transform2dSystem } from './transform2d.system.js';
import { PlayerConnectionSystem } from './player-connection.system.js';
import { ApplyMoveSystem } from './apply-move.system.js';
import { VelocitySystem } from './velocity.system.js';
import { PlayerLeaveSystem } from './player-leave.system.js';

export const CircleRaceSimulationSystems: IECSSystemConstructor[] = [
  Transform2dSystem,

  PlayerConnectionSystem,
  ApplyMoveSystem,
  VelocitySystem,
  PlayerLeaveSystem,
];
