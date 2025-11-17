import { IECSSystemConstructor } from '@lagless/core';
import { Transform2dSystem } from './transform2d.system.js';
import { PlayerConnectionSystem } from './player-connection.system.js';
import { PlayerLeaveSystem } from './player-leave.system.js';
import { FinishGameSystem } from './finish-game.system.js';
import { PlayerFinishGameSystem } from './player-finish-game.system.js';

export const CircleSumoSystems: IECSSystemConstructor[] = [
  Transform2dSystem,

  PlayerConnectionSystem,
  PlayerLeaveSystem,
  PlayerFinishGameSystem,
  FinishGameSystem,
];
