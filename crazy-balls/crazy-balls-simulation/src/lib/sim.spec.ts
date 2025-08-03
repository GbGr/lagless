import { Physics2dConfig, Physics2dSimulation } from '@lagless/physics2d';
import { CrazyBallsRunner } from './runner.js';
import { FinishError } from './systems/level.system.js';

describe('Simulation', () => {
  it('test', async () => {
    await Physics2dSimulation.init();
    const RUNS = 100;
    const resultsMap = new Map<number, number>(); // entity -> count
    for (let i = 0; i < RUNS; i += 1) {
      // log progress every 100 runs
      if (i % 100 === 0) {
        console.log(`Progress: ${i}/${RUNS} (${(i/RUNS*100).toFixed(2)} %)`);
      }
      const res = simulate(Math.random() * Number.MAX_SAFE_INTEGER);
      if (res === undefined) {
        console.warn('Simulation finished without a result');
        continue;
      }
      resultsMap.set(res, (resultsMap.get(res) ?? 0) + 1);
    }

    console.log(resultsMap);
  });
});

function simulate(seed: number) {
  const config = new Physics2dConfig({
    gravity: { x: 0, y: -9.81 },
    seed,
    snapshotRate: 0,
  });
  const runner = new CrazyBallsRunner(config);
  runner.start();

  let finished = false;

  while (!finished) {
    try {
      runner.update(config.frameLength);
    } catch (e) {
      finished = true;
      if (e instanceof FinishError) {
        return e.entity;
      }
    }
  }

  return undefined;
}
