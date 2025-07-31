import { Physics2dConfig, Physics2dRunner } from '@lagless/physics2d';
import { CrazyBallsSimulationECSCore, CrazyBallsSimulationInputRegistry } from './schema/code-gen/index.js';
import { LocalInputProvider } from '@lagless/core';
import { CRAZY_BALLS_SYSTEMS_REGISTRY } from './systems/index.js';

export class CrazyBallsRunner extends Physics2dRunner {
  constructor(Config: Physics2dConfig) {
    const localInputProvider = new LocalInputProvider(Config, CrazyBallsSimulationInputRegistry);
    super(Config, localInputProvider, CRAZY_BALLS_SYSTEMS_REGISTRY, CrazyBallsSimulationECSCore);
  }
}
