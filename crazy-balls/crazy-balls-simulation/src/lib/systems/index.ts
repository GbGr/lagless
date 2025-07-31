import { IECSSystemConstructor } from '@lagless/types';
import { LevelSystem } from './level.system.js';

export const CRAZY_BALLS_SYSTEMS_REGISTRY: IECSSystemConstructor[] = [
  LevelSystem,
];
