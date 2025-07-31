import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { cpus } from 'os';
import Rapier from '@dimforge/rapier2d-deterministic-compat';
import { Physics2dConfig } from '@lagless/physics2d';
import { CrazyBallsRunner } from './runner.js';
import { FinishError } from './systems/level.system.js';

// Функция симуляции (одинаковая для главного потока и воркеров)
function simulate(seed: number) {
  const config = new Physics2dConfig({
    gravity: { x: 0, y: -9.81 },
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

// Код для воркера
if (!isMainThread) {
  (async () => {
    await Rapier.init();
    const { seeds } = workerData;

    for (const seed of seeds) {
      const result = simulate(seed);
      parentPort?.postMessage({ seed, result });
    }
  })();
}

// Главный код
else {
  async function runSimulations() {
    await Rapier.init();

    const RUNS = 10000; // Измените на нужное количество
    const numWorkers = cpus().length;
    const runsPerWorker = Math.ceil(RUNS / numWorkers);

    console.log(`🚀 Running ${RUNS} simulations on ${numWorkers} threads...`);

    const resultsMap = new Map<number, number>();
    let completed = 0;
    const startTime = Date.now();

    // Создаем воркеры
    const workers = Array.from({ length: numWorkers }, (_, i) => {
      const start = i * runsPerWorker;
      const end = Math.min(start + runsPerWorker, RUNS);
      const seeds = Array.from({ length: end - start }, () =>
        Math.random() * Number.MAX_SAFE_INTEGER
      );

      const worker = new Worker(__filename, { workerData: { seeds } });

      worker.on('message', ({ result }) => {
        completed++;

        if (result !== undefined) {
          resultsMap.set(result, (resultsMap.get(result) ?? 0) + 1);
        }

        // Показываем прогресс каждые 100 симуляций
        if (completed % 100 === 0) {
          const progress = (completed / RUNS * 100).toFixed(1);
          const elapsed = (Date.now() - startTime) / 1000;
          const rate = completed / elapsed;
          console.log(`Progress: ${completed}/${RUNS} (${progress}%) | ${rate.toFixed(1)}/s`);
        }
      });

      return worker;
    });

    // Ждем завершения всех воркеров
    await Promise.all(workers.map(worker =>
      new Promise(resolve => worker.on('exit', resolve))
    ));

    const totalTime = (Date.now() - startTime) / 1000;
    console.log(`\n✅ Completed in ${totalTime.toFixed(1)}s`);
    console.log('Results:', resultsMap);
  }

  runSimulations().catch(console.error);
}
