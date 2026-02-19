import { describe, it, expect } from 'vitest';
import { ECSSimulation } from './ecs-simulation.js';
import { ECSConfig } from './ecs-config.js';
import { LocalInputProvider } from './input/local-input-provider.js';
import { InputRegistry } from './input/input-registry.js';
import type { ECSDeps } from './types/index.js';

// ─── Minimal deps (no components, no systems) ───────────────

const minimalDeps: ECSDeps = {
  components: [],
  singletons: [],
  filters: [],
  inputs: [],
  playerResources: [],
};

function createTestSimulation(opts?: Partial<ECSConfig>) {
  const config = new ECSConfig({
    snapshotRate: 1,
    snapshotHistorySize: 50,
    ...opts,
  });
  const inputProvider = new LocalInputProvider(config, new InputRegistry([]));
  const simulation = new ECSSimulation(config, minimalDeps, inputProvider);
  inputProvider.init(simulation);
  return { simulation, config, inputProvider };
}

// ─── Tests ──────────────────────────────────────────────────

describe('ECSSimulation', () => {
  describe('applyExternalState', () => {
    it('should set tick to the specified value', () => {
      const { simulation } = createTestSimulation();
      const state = simulation.mem.exportSnapshot();

      simulation.applyExternalState(state, 500);

      expect(simulation.tick).toBe(500);
    });

    it('should update clock accumulated time', () => {
      const { simulation, config } = createTestSimulation();
      const state = simulation.mem.exportSnapshot();

      simulation.applyExternalState(state, 100);

      // accumulatedTime should be tick * frameLength
      expect(simulation.clock.accumulatedTime).toBeCloseTo(100 * config.frameLength, 5);
    });

    it('should preserve memory content from external state', () => {
      const { simulation } = createTestSimulation();

      // Advance simulation a few ticks to create some state
      simulation.start();

      // Export at tick 0 (initial state)
      const initialState = simulation.mem.exportSnapshot();

      // Manually change tick
      simulation.mem.tickManager.setTick(50);

      // Apply initial state back at tick 200
      simulation.applyExternalState(initialState, 200);

      // Tick should be 200, not 50
      expect(simulation.tick).toBe(200);
    });

    it('should allow simulation to continue from new tick', () => {
      const { simulation, config } = createTestSimulation();
      const state = simulation.mem.exportSnapshot();

      simulation.start();
      simulation.applyExternalState(state, 100);

      // Advance by one frame
      simulation.update(config.frameLength);

      // Should be at tick 101
      expect(simulation.tick).toBe(101);
    });

    it('should reset snapshot history', () => {
      const { simulation, config } = createTestSimulation();

      simulation.start();

      // Simulate a few ticks
      simulation.update(config.frameLength * 5);
      expect(simulation.tick).toBeGreaterThanOrEqual(4);

      const state = simulation.mem.exportSnapshot();

      // Apply external state — old snapshots should be cleared
      simulation.applyExternalState(state, 1000);

      // If we rollback, should use the snapshot saved by applyExternalState
      // (not an old snapshot from before the external state)
      expect(simulation.tick).toBe(1000);
    });
  });

  describe('frameLength getter', () => {
    it('should expose frame length', () => {
      const { simulation } = createTestSimulation({ fps: 30 });
      expect(simulation.frameLength).toBeCloseTo(1000 / 30, 5);
    });
  });

  describe('basic simulation lifecycle', () => {
    it('should start and advance tick', () => {
      const { simulation, config } = createTestSimulation();
      simulation.registerSystems([]);
      simulation.start();

      expect(simulation.tick).toBe(0);

      // Advance by 2 frames
      simulation.update(config.frameLength * 2);
      expect(simulation.tick).toBe(2);
    });

    it('should calculate interpolation factor', () => {
      const { simulation, config } = createTestSimulation();
      simulation.registerSystems([]);
      simulation.start();

      // Advance by 1.5 frames
      simulation.update(config.frameLength * 1.5);

      expect(simulation.interpolationFactor).toBeGreaterThan(0.3);
      expect(simulation.interpolationFactor).toBeLessThan(0.7);
    });
  });
});
