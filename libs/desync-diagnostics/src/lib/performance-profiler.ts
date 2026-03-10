import type { ECSRunner, ECSSimulation, IECSSystem } from '@lagless/core';

export interface TimingStats {
  latest: number;
  min: number;
  max: number;
  avg: number;
}

export interface SystemTimingStats extends TimingStats {
  name: string;
}

export interface PerformanceStats {
  tickTime: TimingStats;
  snapshotTime: TimingStats;
  overheadTime: TimingStats;
  systems: SystemTimingStats[];
}

interface SystemEntry {
  name: string;
  original: (tick: number) => void;
  system: IECSSystem;
  buffer: Float64Array;
  writeIndex: number;
  count: number;
}

/** Runtime shape of ECSSimulation with protected methods accessible via monkey-patching */
interface SimulationRuntime {
  simulate: (tick: number) => void;
  saveSnapshot: (tick: number) => void;
}

const DEFAULT_WINDOW_SIZE = 600;
const ZERO_TIMING: TimingStats = { latest: 0, min: 0, max: 0, avg: 0 };

function computeBufferStats(buffer: Float64Array, writeIndex: number, count: number, windowSize: number): TimingStats {
  if (count === 0) return { ...ZERO_TIMING };
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (let i = 0; i < count; i++) {
    const idx = (writeIndex - count + i + windowSize) % windowSize;
    const v = buffer[idx];
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  const latestIdx = (writeIndex - 1 + windowSize) % windowSize;
  return {
    latest: buffer[latestIdx],
    min,
    max,
    avg: sum / count,
  };
}

export class PerformanceProfiler {
  private readonly _windowSize: number;
  private _entries: SystemEntry[] = [];
  private _attached = false;

  // Tick time ring buffer
  private _tickTimeBuffer!: Float64Array;
  private _tickTimeWriteIndex = 0;
  private _tickTimeCount = 0;
  private _tickStartTime = 0;

  // Snapshot time ring buffer
  private _snapshotTimeBuffer!: Float64Array;
  private _snapshotTimeWriteIndex = 0;
  private _snapshotTimeCount = 0;

  // Overhead time ring buffer (tickTime - simulateElapsed - snapshotElapsed)
  private _overheadTimeBuffer!: Float64Array;
  private _overheadTimeWriteIndex = 0;
  private _overheadTimeCount = 0;

  // Per-tick elapsed tracking for overhead computation
  private _lastSimulateElapsed = -1; // sentinel: -1 = no data yet (first-tick guard)
  private _lastSnapshotElapsed = 0;

  // Cleanup references
  private _originalSimulate: ((tick: number) => void) | null = null;
  private _originalSaveSnapshot: ((tick: number) => void) | null = null;
  private _removeTickHandler: (() => void) | null = null;
  private _simulation: ECSSimulation | null = null;

  constructor(windowSize = DEFAULT_WINDOW_SIZE) {
    this._windowSize = windowSize;
  }

  public attach(runner: ECSRunner): void {
    if (this._attached) return;
    this._attached = true;

    const simulation = runner.Simulation;
    this._simulation = simulation;
    const sim = simulation as unknown as SimulationRuntime;
    const systems = simulation.registeredSystems;
    this._entries = [];

    // Initialize ring buffers
    this._tickTimeBuffer = new Float64Array(this._windowSize);
    this._tickTimeWriteIndex = 0;
    this._tickTimeCount = 0;
    this._snapshotTimeBuffer = new Float64Array(this._windowSize);
    this._snapshotTimeWriteIndex = 0;
    this._snapshotTimeCount = 0;
    this._overheadTimeBuffer = new Float64Array(this._windowSize);
    this._overheadTimeWriteIndex = 0;
    this._overheadTimeCount = 0;
    this._lastSimulateElapsed = -1;
    this._lastSnapshotElapsed = 0;

    // Monkey-patch per-system update methods
    for (const system of systems) {
      const name = system.constructor.name;
      const original = system.update;
      const entry: SystemEntry = {
        name,
        original,
        system,
        buffer: new Float64Array(this._windowSize),
        writeIndex: 0,
        count: 0,
      };
      this._entries.push(entry);

      system.update = (tick: number) => {
        const start = performance.now();
        original.call(system, tick);
        const elapsed = performance.now() - start;
        entry.buffer[entry.writeIndex % this._windowSize] = elapsed;
        entry.writeIndex++;
        entry.count = Math.min(entry.count + 1, this._windowSize);
      };
    }

    // Monkey-patch simulate() to record tick start time
    const originalSimulate = sim.simulate;
    this._originalSimulate = originalSimulate;
    sim.simulate = (tick: number) => {
      this._lastSnapshotElapsed = 0; // Reset before saveSnapshot() might or might not run this tick
      this._tickStartTime = performance.now();
      originalSimulate.call(simulation, tick);
      this._lastSimulateElapsed = performance.now() - this._tickStartTime;
    };

    // Monkey-patch saveSnapshot() to measure snapshot time
    const originalSaveSnapshot = sim.saveSnapshot;
    this._originalSaveSnapshot = originalSaveSnapshot;
    sim.saveSnapshot = (tick: number) => {
      const start = performance.now();
      originalSaveSnapshot.call(simulation, tick);
      const elapsed = performance.now() - start;
      this._lastSnapshotElapsed = elapsed;
      this._snapshotTimeBuffer[this._snapshotTimeWriteIndex % this._windowSize] = elapsed;
      this._snapshotTimeWriteIndex++;
      this._snapshotTimeCount = Math.min(this._snapshotTimeCount + 1, this._windowSize);
    };

    // Add tick handler to compute total tick time and overhead
    this._removeTickHandler = simulation.addTickHandler(() => {
      const elapsed = performance.now() - this._tickStartTime;
      this._tickTimeBuffer[this._tickTimeWriteIndex % this._windowSize] = elapsed;
      this._tickTimeWriteIndex++;
      this._tickTimeCount = Math.min(this._tickTimeCount + 1, this._windowSize);

      // Compute overhead: tickTime - simulateElapsed - snapshotElapsed
      // Skip first tick after attach (sentinel: _lastSimulateElapsed === -1)
      if (this._lastSimulateElapsed >= 0) {
        const overhead = Math.max(0, elapsed - this._lastSimulateElapsed - this._lastSnapshotElapsed);
        this._overheadTimeBuffer[this._overheadTimeWriteIndex % this._windowSize] = overhead;
        this._overheadTimeWriteIndex++;
        this._overheadTimeCount = Math.min(this._overheadTimeCount + 1, this._windowSize);
      }
    });
  }

  public detach(): void {
    if (!this._attached) return;

    // Restore per-system update methods
    for (const entry of this._entries) {
      entry.system.update = entry.original;
    }
    this._entries = [];

    // Restore simulate() and saveSnapshot()
    const sim = this._simulation as unknown as SimulationRuntime;
    if (sim && this._originalSimulate) {
      sim.simulate = this._originalSimulate;
    }
    if (sim && this._originalSaveSnapshot) {
      sim.saveSnapshot = this._originalSaveSnapshot;
    }

    // Remove tick handler
    if (this._removeTickHandler) {
      this._removeTickHandler();
      this._removeTickHandler = null;
    }

    this._originalSimulate = null;
    this._originalSaveSnapshot = null;
    this._simulation = null;
    this._tickTimeWriteIndex = 0;
    this._tickTimeCount = 0;
    this._snapshotTimeWriteIndex = 0;
    this._snapshotTimeCount = 0;
    this._overheadTimeWriteIndex = 0;
    this._overheadTimeCount = 0;
    this._lastSimulateElapsed = -1;
    this._lastSnapshotElapsed = 0;
    this._attached = false;
  }

  public getStats(): PerformanceStats {
    const systems: SystemTimingStats[] = this._entries.map((entry) => {
      const stats = computeBufferStats(entry.buffer, entry.writeIndex, entry.count, this._windowSize);
      return { name: entry.name, ...stats };
    });

    const tickTime = computeBufferStats(
      this._tickTimeBuffer, this._tickTimeWriteIndex, this._tickTimeCount, this._windowSize,
    );

    const snapshotTime = computeBufferStats(
      this._snapshotTimeBuffer, this._snapshotTimeWriteIndex, this._snapshotTimeCount, this._windowSize,
    );

    const overheadTime = computeBufferStats(
      this._overheadTimeBuffer, this._overheadTimeWriteIndex, this._overheadTimeCount, this._windowSize,
    );

    return { tickTime, snapshotTime, overheadTime, systems };
  }

  public dispose(): void {
    this.detach();
  }
}
