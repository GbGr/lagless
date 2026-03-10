import { PerformanceProfiler } from './performance-profiler.js';
import type { IECSSystem } from '@lagless/core';

function createMockSystems(): IECSSystem[] {
  return [
    {
      update(_tick: number) {
        // Simulate ~0.1ms of work
        const start = performance.now();
        while (performance.now() - start < 0.1) { /* spin */ }
      },
      constructor: { name: 'PhysicsSystem' } as unknown as { name: string },
    } as unknown as IECSSystem,
    {
      update(_tick: number) {
        // Simulate ~0.05ms of work
        const start = performance.now();
        while (performance.now() - start < 0.05) { /* spin */ }
      },
      constructor: { name: 'MovementSystem' } as unknown as { name: string },
    } as unknown as IECSSystem,
  ];
}

/**
 * Creates a mock runner that simulates the ECSSimulation tick loop.
 * The simulate() method runs all systems, and saveSnapshot() is a no-op.
 * addTickHandler() registers handlers called at the end of each tick.
 */
function createMockRunner(systems: IECSSystem[], opts?: { snapshotRate?: number }) {
  const tickHandlers = new Set<(tick: number) => void>();
  const snapshotRate = opts?.snapshotRate ?? 5;

  const simulation = {
    registeredSystems: systems as ReadonlyArray<IECSSystem>,
    addTickHandler(handler: (tick: number) => void): () => void {
      tickHandlers.add(handler);
      return () => { tickHandlers.delete(handler); };
    },
    simulate(tick: number): void {
      for (const sys of systems) {
        sys.update(tick);
      }
    },
    saveSnapshot(_tick: number): void {
      // Simulate ~0.05ms of snapshot work
      const start = performance.now();
      while (performance.now() - start < 0.05) { /* spin */ }
    },
  };

  /**
   * Runs one full tick: simulate → extra work → conditionally saveSnapshot → tick handlers.
   * Mirrors ECSSimulation.simulationTicks() loop body.
   */
  function runTick(tick: number): void {
    (simulation as any).simulate(tick);
    // Simulate non-system work (hash tracking, signals) ~0.02ms
    const start = performance.now();
    while (performance.now() - start < 0.02) { /* spin */ }
    // Conditionally save snapshot
    if (snapshotRate > 0 && tick % snapshotRate === 0) {
      (simulation as any).saveSnapshot(tick);
    }
    // Call tick handlers
    for (const handler of tickHandlers) handler(tick);
  }

  return {
    Simulation: simulation,
    runTick,
  } as any;
}

describe('PerformanceProfiler', () => {
  it('should attach and wrap system update methods', () => {
    const systems = createMockSystems();
    const originalUpdates = systems.map((s) => s.update);
    const profiler = new PerformanceProfiler();
    const runner = createMockRunner(systems);

    profiler.attach(runner);

    // update methods should be wrapped (different references)
    for (let i = 0; i < systems.length; i++) {
      expect(systems[i].update).not.toBe(originalUpdates[i]);
    }

    profiler.dispose();
  });

  it('should detach and restore original update methods', () => {
    const systems = createMockSystems();
    const originalUpdates = systems.map((s) => s.update);
    const profiler = new PerformanceProfiler();
    const runner = createMockRunner(systems);

    profiler.attach(runner);
    profiler.detach();

    for (let i = 0; i < systems.length; i++) {
      expect(systems[i].update).toBe(originalUpdates[i]);
    }

    profiler.dispose();
  });

  it('should collect per-system timing stats', () => {
    const systems = createMockSystems();
    const profiler = new PerformanceProfiler();
    const runner = createMockRunner(systems);

    profiler.attach(runner);

    // Run full ticks through the mock tick loop
    for (let tick = 1; tick <= 5; tick++) {
      runner.runTick(tick);
    }

    const stats = profiler.getStats();
    expect(stats.systems).toHaveLength(2);
    expect(stats.systems[0].name).toBe('PhysicsSystem');
    expect(stats.systems[1].name).toBe('MovementSystem');

    // Each system should have positive timing values
    for (const sys of stats.systems) {
      expect(sys.latest).toBeGreaterThan(0);
      expect(sys.min).toBeGreaterThan(0);
      expect(sys.max).toBeGreaterThanOrEqual(sys.min);
      expect(sys.avg).toBeGreaterThan(0);
    }

    profiler.dispose();
  });

  it('should compute aggregate tick time', () => {
    const systems = createMockSystems();
    const profiler = new PerformanceProfiler();
    const runner = createMockRunner(systems);

    profiler.attach(runner);

    for (let tick = 1; tick <= 3; tick++) {
      runner.runTick(tick);
    }

    const stats = profiler.getStats();
    // Tick time should be positive
    expect(stats.tickTime.latest).toBeGreaterThan(0);
    expect(stats.tickTime.avg).toBeGreaterThan(0);
    expect(stats.tickTime.min).toBeGreaterThan(0);
    expect(stats.tickTime.max).toBeGreaterThanOrEqual(stats.tickTime.min);

    profiler.dispose();
  });

  it('should return zeroed stats when no ticks have run', () => {
    const systems = createMockSystems();
    const profiler = new PerformanceProfiler();
    const runner = createMockRunner(systems);

    profiler.attach(runner);

    const stats = profiler.getStats();
    expect(stats.systems).toHaveLength(2);
    for (const sys of stats.systems) {
      expect(sys.latest).toBe(0);
      expect(sys.min).toBe(0);
      expect(sys.max).toBe(0);
      expect(sys.avg).toBe(0);
    }
    expect(stats.tickTime.latest).toBe(0);

    profiler.dispose();
  });

  it('should still call original update when wrapped', () => {
    let callCount = 0;
    const systems: IECSSystem[] = [
      {
        update() { callCount++; },
        constructor: { name: 'TestSystem' } as unknown as { name: string },
      } as unknown as IECSSystem,
    ];
    const profiler = new PerformanceProfiler();
    const runner = createMockRunner(systems);

    profiler.attach(runner);
    systems[0].update(1);
    systems[0].update(2);

    expect(callCount).toBe(2);

    profiler.dispose();
  });

  it('should handle rolling window correctly', () => {
    let duration = 0.1;
    const systems: IECSSystem[] = [
      {
        update() {
          const start = performance.now();
          while (performance.now() - start < duration) { /* spin */ }
        },
        constructor: { name: 'VaryingSystem' } as unknown as { name: string },
      } as unknown as IECSSystem,
    ];
    const profiler = new PerformanceProfiler(8); // small window
    const runner = createMockRunner(systems);

    profiler.attach(runner);

    // Run 8 ticks with 0.1ms duration
    for (let i = 1; i <= 8; i++) {
      runner.runTick(i);
    }

    const stats1 = profiler.getStats();
    const avg1 = stats1.systems[0].avg;

    // Run 8 more ticks with 0.3ms duration — old values should be overwritten
    duration = 0.3;
    for (let i = 9; i <= 16; i++) {
      runner.runTick(i);
    }

    const stats2 = profiler.getStats();
    // Average should now be higher since all window entries are ~0.3ms
    expect(stats2.systems[0].avg).toBeGreaterThan(avg1);

    profiler.dispose();
  });

  // --- NEW TESTS for tick time and snapshot time ---

  it('should measure real total tick time greater than sum of system times', () => {
    const systems = createMockSystems();
    const profiler = new PerformanceProfiler();
    const runner = createMockRunner(systems, { snapshotRate: 1 });

    profiler.attach(runner);

    // Run 10 ticks (with snapshot every tick to include snapshot overhead)
    for (let tick = 1; tick <= 10; tick++) {
      runner.runTick(tick);
    }

    const stats = profiler.getStats();
    const systemSum = stats.systems.reduce((sum, s) => sum + s.avg, 0);

    // Real tick time should be greater than system sum (includes non-system work + snapshot)
    expect(stats.tickTime.avg).toBeGreaterThan(systemSum);

    profiler.dispose();
  });

  it('should include snapshotTime in stats', () => {
    const systems = createMockSystems();
    const profiler = new PerformanceProfiler();
    const runner = createMockRunner(systems, { snapshotRate: 1 });

    profiler.attach(runner);

    // Run ticks — snapshot happens every tick with snapshotRate=1
    for (let tick = 1; tick <= 5; tick++) {
      runner.runTick(tick);
    }

    const stats = profiler.getStats();
    expect(stats.snapshotTime).toBeDefined();
    expect(stats.snapshotTime.latest).toBeGreaterThan(0);
    expect(stats.snapshotTime.min).toBeGreaterThan(0);
    expect(stats.snapshotTime.max).toBeGreaterThanOrEqual(stats.snapshotTime.min);
    expect(stats.snapshotTime.avg).toBeGreaterThan(0);

    profiler.dispose();
  });

  it('should record snapshot time only when snapshot happens', () => {
    const systems = createMockSystems();
    const profiler = new PerformanceProfiler();
    // snapshotRate=5 means snapshot on tick 5, 10, 15, ...
    const runner = createMockRunner(systems, { snapshotRate: 5 });

    profiler.attach(runner);

    // Run 4 ticks — no snapshot should happen
    for (let tick = 1; tick <= 4; tick++) {
      runner.runTick(tick);
    }

    let stats = profiler.getStats();
    expect(stats.snapshotTime.latest).toBe(0);
    expect(stats.snapshotTime.avg).toBe(0);

    // Run tick 5 — snapshot should happen
    runner.runTick(5);

    stats = profiler.getStats();
    expect(stats.snapshotTime.latest).toBeGreaterThan(0);
    expect(stats.snapshotTime.avg).toBeGreaterThan(0);

    profiler.dispose();
  });

  it('should detach and restore simulate() and saveSnapshot()', () => {
    const systems = createMockSystems();
    const profiler = new PerformanceProfiler();
    const runner = createMockRunner(systems);

    const originalSimulate = runner.Simulation.simulate;
    const originalSaveSnapshot = runner.Simulation.saveSnapshot;

    profiler.attach(runner);

    // Methods should be monkey-patched
    expect(runner.Simulation.simulate).not.toBe(originalSimulate);
    expect(runner.Simulation.saveSnapshot).not.toBe(originalSaveSnapshot);

    profiler.detach();

    // Methods should be restored
    expect(runner.Simulation.simulate).toBe(originalSimulate);
    expect(runner.Simulation.saveSnapshot).toBe(originalSaveSnapshot);

    profiler.dispose();
  });

  // --- overheadTime tests ---

  it('should include overheadTime in stats reflecting non-system non-snapshot work', () => {
    const systems = createMockSystems();
    const profiler = new PerformanceProfiler();
    // snapshotRate=0 means no snapshots — overhead = tickTime - simulateTime
    const runner = createMockRunner(systems, { snapshotRate: 0 });

    profiler.attach(runner);

    for (let tick = 1; tick <= 10; tick++) {
      runner.runTick(tick);
    }

    const stats = profiler.getStats();
    // The mock tick loop has ~0.02ms of non-system work between simulate and tick handlers
    expect(stats.overheadTime).toBeDefined();
    expect(stats.overheadTime.avg).toBeGreaterThan(0);
    expect(stats.overheadTime.min).toBeGreaterThanOrEqual(0);
    expect(stats.overheadTime.max).toBeGreaterThanOrEqual(stats.overheadTime.min);

    profiler.dispose();
  });

  it('should return zeroed overheadTime when no ticks have run', () => {
    const systems = createMockSystems();
    const profiler = new PerformanceProfiler();
    const runner = createMockRunner(systems);

    profiler.attach(runner);

    const stats = profiler.getStats();
    expect(stats.overheadTime.latest).toBe(0);
    expect(stats.overheadTime.avg).toBe(0);

    profiler.dispose();
  });

  it('should reset overheadTime state on detach', () => {
    const systems = createMockSystems();
    const profiler = new PerformanceProfiler();
    const runner = createMockRunner(systems);

    profiler.attach(runner);

    for (let tick = 1; tick <= 5; tick++) {
      runner.runTick(tick);
    }

    profiler.detach();

    const stats = profiler.getStats();
    expect(stats.overheadTime.latest).toBe(0);
    expect(stats.overheadTime.avg).toBe(0);

    profiler.dispose();
  });

  it('should remove tick handler on detach', () => {
    const systems = createMockSystems();
    const profiler = new PerformanceProfiler();
    const runner = createMockRunner(systems);

    profiler.attach(runner);

    // Run some ticks
    for (let tick = 1; tick <= 3; tick++) {
      runner.runTick(tick);
    }

    profiler.detach();

    // Run more ticks — tick time should NOT accumulate
    for (let tick = 4; tick <= 6; tick++) {
      runner.runTick(tick);
    }

    // After detach, getStats should return zeroed (entries cleared)
    const stats = profiler.getStats();
    expect(stats.tickTime.latest).toBe(0);

    profiler.dispose();
  });
});
