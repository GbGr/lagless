import type { ECSRunner } from '../ecs-runner.js';

export interface HashReporterConfig {
  reportInterval: number;
  send: (data: { hash: number; atTick: number }) => void;
}

export interface HashMismatchData {
  slotA: number;
  slotB: number;
  hashA: number;
  hashB: number;
  atTick: number;
}

export interface HashReporter {
  dispose(): void;
  subscribeDivergence(fn: (data: HashMismatchData) => void): () => void;
  reportMismatch(data: HashMismatchData): void;
}

/**
 * Creates a hash reporter that sends simulation state hashes
 * via a dedicated protocol channel (not through RPCHistory).
 *
 * Hash reports are sent for verified ticks only, ensuring
 * they reflect finalized simulation state.
 */
export function createHashReporter(runner: ECSRunner, config: HashReporterConfig): HashReporter {
  let lastReportedTick = -1;
  let lastReportedHash = 0;
  const subscribers: Array<(data: HashMismatchData) => void> = [];

  const disposeTickHandler = runner.Simulation.addTickHandler(() => {
    const verifiedTick = runner.Simulation.inputProvider.verifiedTick;
    const latestReportTick = Math.floor(verifiedTick / config.reportInterval) * config.reportInterval;
    if (latestReportTick <= 0) return;

    const hash = runner.Simulation.getHashAtTick(latestReportTick);
    if (hash === undefined) return;

    if (latestReportTick > lastReportedTick ||
        (latestReportTick === lastReportedTick && hash !== lastReportedHash)) {
      lastReportedTick = latestReportTick;
      lastReportedHash = hash;
      config.send({ hash, atTick: latestReportTick });
    }
  });

  return {
    dispose() {
      disposeTickHandler();
      subscribers.length = 0;
    },

    subscribeDivergence(fn: (data: HashMismatchData) => void): () => void {
      subscribers.push(fn);
      return () => {
        const idx = subscribers.indexOf(fn);
        if (idx >= 0) subscribers.splice(idx, 1);
      };
    },

    reportMismatch(data: HashMismatchData): void {
      for (const fn of subscribers) {
        fn(data);
      }
    },
  };
}
