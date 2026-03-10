import { IECSSystemConstructor } from '@lagless/core';
import { SavePrevTransformSystem } from './save-prev-transform.system.js';
import { PlayerConnectionSystem } from './player-connection.system.js';
import { PlayerLeaveSystem } from './player-leave.system.js';
import { ApplyMoveInputSystem } from './apply-move-input.system.js';
import { IntegrateSystem } from './integrate.system.js';
import { DampingSystem } from './damping.system.js';
import { BoundarySystem } from './boundary.system.js';
import { CollectibleSpawnSystem } from './collectible-spawn.system.js';
import { CollectionSystem } from './collection.system.js';

export const SyncTestSystems: IECSSystemConstructor[] = [
  SavePrevTransformSystem,
  PlayerConnectionSystem,
  PlayerLeaveSystem,
  ApplyMoveInputSystem,
  IntegrateSystem,
  DampingSystem,
  BoundarySystem,
  CollectibleSpawnSystem,
  CollectionSystem,
];
