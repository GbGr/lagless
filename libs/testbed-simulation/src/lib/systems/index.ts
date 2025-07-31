import { IECSSystemConstructor } from '@lagless/types';
import { TestSystem } from './test.system.js';
import { FullTestSystem } from './full-test-system.js';

export const SYSTEMS_REGISTRY: IECSSystemConstructor[] = [
  TestSystem,
  FullTestSystem,
];
