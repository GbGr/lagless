export const now: () => number =
  typeof globalThis.performance?.now === 'function'
    ? globalThis.performance.now.bind(globalThis.performance)
    : (() => {
        const { performance } = require('node:perf_hooks');
        return performance.now.bind(performance);
      })();
