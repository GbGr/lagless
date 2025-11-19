import { IECSSystemConstructor } from '@lagless/core';
import { Transform2dSystem } from './transform2d.system.js';
import { PlayerConnectionSystem } from './player-connection.system.js';
import { PlayerLeaveSystem } from './player-leave.system.js';
import { FinishGameSystem } from './finish-game.system.js';
import { ApplyImpulseSystem } from './apply-impulse.system.js';
import { IntegrateSystem } from './integrate.system.js';
import { DampingSystem } from './damping.system.js';
import { CollisionSystem } from './collision.system.js';
import { ApplyMoveInputSystem } from './apply-move-input.system.js';
import { ApplyLookAtInputSystem } from './apply-look-at-input.system.js';
import { CheckPlayersInsideArenaSystem } from './check-players-inside-arena.system.js';

export const CircleSumoSystems: IECSSystemConstructor[] = [
  Transform2dSystem,

  ApplyLookAtInputSystem,
  ApplyMoveInputSystem,
  ApplyImpulseSystem,
  IntegrateSystem,
  DampingSystem,
  CollisionSystem,

  PlayerConnectionSystem,
  PlayerLeaveSystem,
  CheckPlayersInsideArenaSystem,
  FinishGameSystem,
];
