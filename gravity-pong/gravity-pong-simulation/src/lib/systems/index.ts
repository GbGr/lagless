import { IECSSystemConstructor } from '@lagless/core';
import { SavePrevTransformSystem } from './save-prev-transform.system.js';
import { PlayerConnectionSystem } from './player-connection.system.js';
import { PlayerLeaveSystem } from './player-leave.system.js';
import { MapSetupSystem } from './map-setup.system.js';
import { ShootSystem } from './shoot.system.js';
import { GravitySystem } from './gravity.system.js';
import { IntegrateSystem } from './integrate.system.js';
import { BallCollisionSystem } from './ball-collision.system.js';
import { BlackHoleSystem } from './black-hole.system.js';
import { GoalDetectionSystem } from './goal-detection.system.js';
import { MatchStateSystem } from './match-state.system.js';
import { HashVerificationSystem } from './hash-verification.system.js';

export const GravityPongSystems: IECSSystemConstructor[] = [
  SavePrevTransformSystem,
  PlayerConnectionSystem,
  PlayerLeaveSystem,
  MapSetupSystem,
  ShootSystem,
  GravitySystem,
  IntegrateSystem,
  BallCollisionSystem,
  BlackHoleSystem,
  GoalDetectionSystem,
  MatchStateSystem,
  HashVerificationSystem,
];
