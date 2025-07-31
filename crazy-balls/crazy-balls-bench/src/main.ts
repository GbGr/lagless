import { isMainThread, parentPort, workerData } from 'worker_threads';
import { Physics2dConfig, Physics2dSimulation } from '@lagless/physics2d';
import { CrazyBallsRunner, FinishError } from '@lagless/crazy-balls-simulation';
import { cpus } from 'os';
import { Worker } from 'node:worker_threads';

function simulate(seed: number) {
  const config = new Physics2dConfig({
    maxEntities: 301,
    fps: 30,
    gravity: { x: 0, y: -9.81 },
    snapshotRate: 0,
    seed,
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


if (!isMainThread) {
  const { seeds } = workerData;
  Physics2dSimulation.init().then(() => {
    for (let i = 0; i < seeds; i++) {
      const seed = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
      const result = simulate(seed);
      parentPort?.postMessage({ seed, result });
    }
  });
}

else {
  async function runSimulations() {
    const RUNS = 15_000;
    const numWorkers = cpus().length;
    const runsPerWorker = Math.ceil(RUNS / numWorkers);

    console.log(`🚀 Running ${RUNS} simulations on ${numWorkers} threads...`);

    const resultsMap = new Map<number, number>();
    let completed = 0;
    const startTime = Date.now();

    const workers = Array.from({ length: numWorkers }, (_, i) => {
      const start = i * runsPerWorker;
      const end = Math.min(start + runsPerWorker, RUNS);

      const worker = new Worker(__filename, { workerData: { seeds: end - start } });

      worker.on('message', ({ result }) => {
        completed++;

        if (result !== undefined) {
          resultsMap.set(result, (resultsMap.get(result) ?? 0) + 1);
        }

        if (completed % 2000 === 0) {
          const progress = (completed / RUNS * 100).toFixed(1);
          const elapsed = (Date.now() - startTime) / 1000;
          const rate = completed / elapsed;
          console.log(`Progress: ${completed}/${RUNS} (${progress}%) | ${rate.toFixed(1)}/s`);
        }
      });

      return worker;
    });

    await Promise.all(workers.map(worker =>
      new Promise(resolve => worker.on('exit', resolve))
    ));

    const totalTime = (Date.now() - startTime) / 1000;
    console.log(`\n✅ Completed in ${totalTime.toFixed(1)}s`);
    // console.log('Results:', resultsMap);
    //   print results in a table format
    console.table(Array.from(resultsMap.entries()).map(([entity, count]) => ({ entity, count })));
    //   write results to a file
    const fs = require('fs');
    const resultsArray = Array.from(resultsMap.entries()).map(([entity, count]) => ({ entity, count }));
    // fs.writeFileSync('results.json', JSON.stringify(resultsArray, null, 2));
  //   append csv file
    const csvContent = resultsArray.map(({ entity, count }) => `${entity},${count}`).join('\n');
    fs.appendFileSync('results.csv', csvContent + '\n');
  }

  runSimulations().catch(console.error);

  // async function runSimulationsInPlace() {
  //   const RUNS = 100_000;
  //   const startTime = Date.now();
  //   const resultsMap = new Map<number, number>();
  //   for (let i = 0; i < RUNS; i += 1) {
  //     const seed = Math.random() * Number.MAX_SAFE_INTEGER;
  //     const result = await simulate(seed);
  //     if (result !== undefined) {
  //       resultsMap.set(result, (resultsMap.get(result) ?? 0) + 1);
  //       if (i % 1000 === 0) {
  //         const progress = ((i + 1) / RUNS * 100).toFixed(1);
  //         console.log(`Progress: ${i + 1}/${RUNS} (${progress}%)`);
  //         const currentTime = Date.now();
  //         const elapsed = (currentTime - startTime) / 1000;
  //         const rate = (i + 1) / elapsed;
  //         console.log(`Rate: ${rate.toFixed(1)} runs/s`);
  //       }
  //     }
  //   }
  //   console.log(`\n✅ Completed ${RUNS} runs`);
  //   console.table(Array.from(resultsMap.entries()).map(([entity, count]) => ({ entity, count })));
  // }
  //
  // runSimulationsInPlace().catch(console.error);
}

