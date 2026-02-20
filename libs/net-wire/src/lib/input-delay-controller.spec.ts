import { describe, it, expect } from 'vitest';
import { InputDelayController } from './input-delay-controller.js';

describe('InputDelayController', () => {
  const TICK_MS = 1000 / 60; // ~16.67ms

  describe('initial state', () => {
    it('should clamp initial value to min/max', () => {
      const ctrl = new InputDelayController(2, 8, 1);
      expect(ctrl.deltaTicks).toBe(2); // clamped to min

      const ctrl2 = new InputDelayController(2, 8, 10);
      expect(ctrl2.deltaTicks).toBe(8); // clamped to max
    });

    it('should use initial value when within bounds', () => {
      const ctrl = new InputDelayController(1, 8, 3);
      expect(ctrl.deltaTicks).toBe(3);
    });
  });

  describe('recompute formula', () => {
    it('should compute correct deltaTicks for known RTT/jitter values', () => {
      const ctrl = new InputDelayController(1, 10, 1);

      // needMs = 100 * 0.5 + 1.8 * 10 + 10 = 50 + 18 + 10 = 78
      // want = ceil(78 / 16.67) = ceil(4.68) = 5
      const result = ctrl.recompute(TICK_MS, 100, 10);
      expect(result).toBe(5);
    });

    it('should not add extra +1 (BUG 9 regression)', () => {
      const ctrl = new InputDelayController(1, 20, 1);

      // needMs = 60 * 0.5 + 1.8 * 5 + 10 = 30 + 9 + 10 = 49
      // want = ceil(49 / 16.67) = ceil(2.94) = 3 (NOT 4)
      const result = ctrl.recompute(TICK_MS, 60, 5);
      expect(result).toBe(3);
    });

    it('should compute ceil correctly at exact tick boundaries', () => {
      const ctrl = new InputDelayController(1, 20, 1);

      // needMs = 33.33 * 0.5 + 1.8 * 0 + 10 = 16.67 + 10 = 26.67
      // want = ceil(26.67 / 16.67) = ceil(1.6) = 2
      const result = ctrl.recompute(TICK_MS, 33.33, 0);
      expect(result).toBe(2);
    });
  });

  describe('min/max bounds', () => {
    it('should not go below min', () => {
      const ctrl = new InputDelayController(3, 8, 3);

      // Very low RTT: needMs ≈ 0.5 + 0 + 10 = 10.5, want = ceil(10.5/16.67) = 1
      const result = ctrl.recompute(TICK_MS, 1, 0);
      expect(result).toBe(3); // clamped to min
    });

    it('should not go above max', () => {
      const ctrl = new InputDelayController(1, 5, 3);

      // Very high RTT: needMs = 500*0.5 + 1.8*100 + 10 = 250+180+10 = 440
      // want = ceil(440/16.67) = 27
      const result = ctrl.recompute(TICK_MS, 500, 100);
      expect(result).toBe(5); // clamped to max
    });
  });

  describe('hysteresis', () => {
    it('should increase immediately when want > current', () => {
      const ctrl = new InputDelayController(1, 10, 2);

      // Force want=5 (need RTT that yields want=5)
      // needMs = rtt*0.5 + 1.8*jitter + 10
      // want = ceil(needMs / tickMs) = 5 → needMs in (66.67, 83.33]
      // 70 = rtt*0.5 + 10 → rtt=120, jitter=0
      ctrl.recompute(TICK_MS, 120, 0);
      expect(ctrl.deltaTicks).toBe(5); // jumped from 2 to 5 immediately
    });

    it('should decrease by 1 per step when want < current', () => {
      const ctrl = new InputDelayController(1, 10, 6);

      // want = 3 (lower than current 6)
      // Should decrease to 5 (6 - 1) not jump to 3
      ctrl.recompute(TICK_MS, 60, 5);
      expect(ctrl.deltaTicks).toBe(5);

      ctrl.recompute(TICK_MS, 60, 5);
      expect(ctrl.deltaTicks).toBe(4);

      ctrl.recompute(TICK_MS, 60, 5);
      expect(ctrl.deltaTicks).toBe(3);

      // At target, should stay
      ctrl.recompute(TICK_MS, 60, 5);
      expect(ctrl.deltaTicks).toBe(3);
    });
  });

  describe('custom parameters', () => {
    it('should accept custom k and safetyMs', () => {
      const ctrl = new InputDelayController(1, 20, 1);

      // needMs = 100*0.5 + 3.0*10 + 20 = 50 + 30 + 20 = 100
      // want = ceil(100 / 16.67) = 6
      const result = ctrl.recompute(TICK_MS, 100, 10, 3.0, 20);
      expect(result).toBe(6);
    });
  });
});
