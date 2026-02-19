import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LatencySimulator } from './latency-simulator.js';

describe('LatencySimulator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls callback immediately when delay is 0', () => {
    const sim = new LatencySimulator({ delayMs: 0, jitterMs: 0, packetLossPercent: 0 });
    const fn = vi.fn();

    sim.apply(fn);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('delays callback by configured delay', () => {
    const sim = new LatencySimulator({ delayMs: 100, jitterMs: 0, packetLossPercent: 0 });
    const fn = vi.fn();

    sim.apply(fn);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(99);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('applies jitter within range', () => {
    const sim = new LatencySimulator({ delayMs: 100, jitterMs: 50, packetLossPercent: 0 });
    const calls: number[] = [];

    // Run many samples to verify jitter range
    for (let i = 0; i < 100; i++) {
      const fn = vi.fn();
      sim.apply(fn);

      // Advance enough to cover max possible delay (100 + 50 = 150)
      vi.advanceTimersByTime(200);
      expect(fn).toHaveBeenCalledOnce();
    }
  });

  it('drops packets based on packetLossPercent', () => {
    const sim = new LatencySimulator({ delayMs: 0, jitterMs: 0, packetLossPercent: 50 });
    let callCount = 0;

    // Seed random to get deterministic behavior... well, we can't really,
    // so run enough samples to verify statistically
    const totalRuns = 1000;
    for (let i = 0; i < totalRuns; i++) {
      sim.apply(() => callCount++);
    }

    // With 50% loss, expect roughly half to be called (within reasonable margin)
    expect(callCount).toBeGreaterThan(totalRuns * 0.3);
    expect(callCount).toBeLessThan(totalRuns * 0.7);
  });

  it('drops all packets at 100% loss', () => {
    const sim = new LatencySimulator({ delayMs: 0, jitterMs: 0, packetLossPercent: 100 });
    const fn = vi.fn();

    for (let i = 0; i < 100; i++) {
      sim.apply(fn);
    }

    expect(fn).not.toHaveBeenCalled();
  });

  it('updates config via setters', () => {
    const sim = new LatencySimulator({ delayMs: 0, jitterMs: 0, packetLossPercent: 0 });

    sim.setDelay(200);
    sim.setJitter(30);
    sim.setPacketLoss(10);

    expect(sim.config).toEqual({
      delayMs: 200,
      jitterMs: 30,
      packetLossPercent: 10,
    });
  });

  it('clamps negative values', () => {
    const sim = new LatencySimulator({ delayMs: 0, jitterMs: 0, packetLossPercent: 0 });

    sim.setDelay(-10);
    sim.setJitter(-5);
    sim.setPacketLoss(-1);

    expect(sim.config.delayMs).toBe(0);
    expect(sim.config.jitterMs).toBe(0);
    expect(sim.config.packetLossPercent).toBe(0);
  });

  it('clamps packetLoss to 100', () => {
    const sim = new LatencySimulator({ delayMs: 0, jitterMs: 0, packetLossPercent: 0 });
    sim.setPacketLoss(150);
    expect(sim.config.packetLossPercent).toBe(100);
  });
});
