import { describe, it, expect } from 'vitest';
import { MatchmakingService } from './matchmaking.service.js';
import type { MatchmakingConfig, MatchGroup } from './matchmaking.types.js';

type TestSession = { id: string };

function createBaseConfig(options?: Partial<MatchmakingConfig>): MatchmakingConfig {
  return {
    virtualCapacity: options?.virtualCapacity || 4,
    maxHumans: options?.maxHumans || 4,

    softMinHumans: options?.softMinHumans || 2,
    hardMinHumans: options?.hardMinHumans || 1,

    startDelayByHumans: options?.startDelayByHumans || {
      1: 5000,
      2: 3000,
      3: 2000,
      4: 1000,
      default: 2000,
    },

    baseMmrWindow: options?.baseMmrWindow || 100,
    maxMmrWindow: options?.maxMmrWindow || 600,

    baseMaxPing: options?.baseMaxPing || 50,
    maxMaxPing: options?.maxMaxPing || 200,

    loadTargetQueueSize: options?.loadTargetQueueSize || 10,
  };
}

describe('MatchmakingService (Quick Play)', () => {
  it('creates a single match when enough players with similar mmr and ping', async () => {
    const config = createBaseConfig();
    const matches: MatchGroup<TestSession>[] = [];

    const service = new MatchmakingService<TestSession>(config, async (group) => {
      matches.push(group);
    });

    const s1: TestSession = { id: 's1' };
    const s2: TestSession = { id: 's2' };
    const s3: TestSession = { id: 's3' };
    const s4: TestSession = { id: 's4' };

    const t1 = service.enqueue(s1, {
      userId: 'u1',
      displayName: 'P1',
      mmr: 1500,
      pingMs: 40,
    });
    const t2 = service.enqueue(s2, {
      userId: 'u2',
      displayName: 'P2',
      mmr: 1500,
      pingMs: 45,
    });
    const t3 = service.enqueue(s3, {
      userId: 'u3',
      displayName: 'P3',
      mmr: 1490,
      pingMs: 55,
    });
    const t4 = service.enqueue(s4, {
      userId: 'u4',
      displayName: 'P4',
      mmr: 1510,
      pingMs: 50,
    });

    const oldest = Math.min(t1.createdAt, t2.createdAt, t3.createdAt, t4.createdAt);
    const now = oldest + 10_000; // large enough to exceed any start delay

    await service.tick(now);

    expect(matches.length).toBe(1);
    expect(matches[0].tickets.length).toBe(4);
    expect(service.getQueueSize()).toBe(0);

    const userIds = matches[0].tickets.map((t) => t.playerId).sort();
    expect(userIds).toEqual(['u1', 'u2', 'u3', 'u4']);
  });

  it('does not start with one player before delay, but starts after delay', async () => {
    const config = createBaseConfig({
      startDelayByHumans: {
        1: 5000,
        default: 5000,
      },
    });

    const matches: MatchGroup<TestSession>[] = [];
    const service = new MatchmakingService<TestSession>(config, async (g) => {
      matches.push(g);
    });

    const s: TestSession = { id: 'solo' };
    const ticket = service.enqueue(s, {
      userId: 'u1',
      displayName: 'Solo',
      mmr: 1500,
      pingMs: 40,
    });

    // Before delay
    const beforeNow = ticket.createdAt + 1000; // 1s < 5s delay
    await service.tick(beforeNow);
    expect(matches.length).toBe(0);
    expect(service.getQueueSize()).toBe(1);

    // After delay
    const afterNow = ticket.createdAt + 6000; // 6s > 5s delay
    await service.tick(afterNow);

    expect(matches.length).toBe(1);
    expect(matches[0].tickets.length).toBe(1);
    expect(matches[0].tickets[0].playerId).toBe('u1');
    expect(service.getQueueSize()).toBe(0);
  });

  it('starts earlier when there are at least softMinHumans players', async () => {
    const config = createBaseConfig({
      softMinHumans: 2,
      hardMinHumans: 1,
      startDelayByHumans: {
        1: 5000,
        2: 3000,
        3: 2000,
        4: 1000,
        default: 3000,
      },
    });

    const matches: MatchGroup<TestSession>[] = [];
    const service = new MatchmakingService<TestSession>(config, async (g) => {
      matches.push(g);
    });

    const s1: TestSession = { id: 's1' };
    const s2: TestSession = { id: 's2' };
    const s3: TestSession = { id: 's3' };

    const t1 = service.enqueue(s1, {
      userId: 'u1',
      displayName: 'P1',
      mmr: 1500,
      pingMs: 40,
    });
    const t2 = service.enqueue(s2, {
      userId: 'u2',
      displayName: 'P2',
      mmr: 1505,
      pingMs: 42,
    });
    const t3 = service.enqueue(s3, {
      userId: 'u3',
      displayName: 'P3',
      mmr: 1510,
      pingMs: 45,
    });

    const oldest = Math.min(t1.createdAt, t2.createdAt, t3.createdAt);
    const delayFor3 = config.startDelayByHumans[3] ?? config.startDelayByHumans.default;
    const halfDelay = delayFor3 * 0.5;

    // Before half delay: no match
    const beforeNow = oldest + halfDelay - 100;
    await service.tick(beforeNow);
    expect(matches.length).toBe(0);

    // After half delay: should start (because humans >= softMinHumans)
    const afterNow = oldest + halfDelay + 50;
    await service.tick(afterNow);

    expect(matches.length).toBe(1);
    expect(matches[0].tickets.length).toBe(3);
  });

  it('respects mmr window: too large difference at low wait, but matches after long wait', async () => {
    const config = createBaseConfig({
      baseMmrWindow: 100,
      maxMmrWindow: 600,
    });

    const matches: MatchGroup<TestSession>[] = [];
    const service = new MatchmakingService<TestSession>(config, async (g) => {
      matches.push(g);
    });

    const s1: TestSession = { id: 's1' };
    const s2: TestSession = { id: 's2' };

    const t1 = service.enqueue(s1, {
      userId: 'u1',
      displayName: 'LowMMR',
      mmr: 1000,
      pingMs: 40,
    });
    const t2 = service.enqueue(s2, {
      userId: 'u2',
      displayName: 'HighMMR',
      mmr: 1300, // diff = 300 > base (100), < max window (600)
      pingMs: 42,
    });

    const oldest = Math.min(t1.createdAt, t2.createdAt);

    // Very early tick: mmrWindow ~ base, should not match yet
    await service.tick(oldest + 10);
    expect(matches.length).toBe(0);

    // Long wait: mmrWindow grows towards maxMmrWindow, diff=300 becomes acceptable
    await service.tick(oldest + 20_000);

    expect(matches.length).toBe(1);
    const group = matches[0];
    const userIds = group.tickets.map((t) => t.playerId).sort();
    expect(userIds).toEqual(['u1', 'u2']);
  });

  it('keeps players with extremely different mmr in separate matches', async () => {
    const config = createBaseConfig({
      baseMmrWindow: 100,
      maxMmrWindow: 600,
    });

    const matches: MatchGroup<TestSession>[] = [];
    const service = new MatchmakingService<TestSession>(config, async (g) => {
      matches.push(g);
    });

    const s1: TestSession = { id: 's1' };
    const s2: TestSession = { id: 's2' };

    const t1 = service.enqueue(s1, {
      userId: 'u1',
      displayName: 'VeryLowMMR',
      mmr: 1000,
      pingMs: 40,
    });
    const t2 = service.enqueue(s2, {
      userId: 'u2',
      displayName: 'VeryHighMMR',
      mmr: 2200, // diff = 1200 > maxMmrWindow (600)
      pingMs: 42,
    });

    const oldest = Math.min(t1.createdAt, t2.createdAt);

    // Long wait to hit max mmr window
    await service.tick(oldest + 25_000);

    // Both should have been put into matches, but not in the same one.
    expect(matches.length).toBe(2);
    const sizes = matches.map((g) => g.tickets.length);
    expect(sizes).toEqual([1, 1]);

    const allUserIds = matches.flatMap((g) => g.tickets.map((t) => t.playerId)).sort();
    expect(allUserIds).toEqual(['u1', 'u2']);
  });

  it('respects ping window: players with big ping diff only match after long wait', async () => {
    const config = createBaseConfig({
      baseMaxPing: 50,
      maxMaxPing: 200,
    });

    const matches: MatchGroup<TestSession>[] = [];
    const service = new MatchmakingService<TestSession>(config, async (g) => {
      matches.push(g);
    });

    const s1: TestSession = { id: 's1' };
    const s2: TestSession = { id: 's2' };

    const t1 = service.enqueue(s1, {
      userId: 'u1',
      displayName: 'LowPing',
      mmr: 1500,
      pingMs: 40,
    });
    const t2 = service.enqueue(s2, {
      userId: 'u2',
      displayName: 'HighPing',
      mmr: 1500,
      pingMs: 170, // diff ~130 > baseMaxPing (50), < possible max window (~200)
    });

    const oldest = Math.min(t1.createdAt, t2.createdAt);

    // Early tick: ping window ~ base, should not match
    await service.tick(oldest + 10);
    expect(matches.length).toBe(0);

    // Long wait: ping window grows, diff becomes acceptable
    await service.tick(oldest + 20_000);

    expect(matches.length).toBe(1);
    const group = matches[0];
    const userIds = group.tickets.map((t) => t.playerId).sort();
    expect(userIds).toEqual(['u1', 'u2']);
  });

  it('keeps strict mmr window under high load (loadFactor ~ 1)', async () => {
    const config: MatchmakingConfig = {
      virtualCapacity: 4,
      maxHumans: 4,
      softMinHumans: 1,
      hardMinHumans: 1,
      startDelayByHumans: {
        1: 0,
        2: 0,
        3: 0,
        4: 0,
        default: 0,
      },
      baseMmrWindow: 50,
      maxMmrWindow: 200,
      baseMaxPing: 50,
      maxMaxPing: 200,
      loadTargetQueueSize: 2, // small => 2 tickets => loadFactor = 1
    };

    const matches: MatchGroup<TestSession>[] = [];
    const service = new MatchmakingService<TestSession>(config, async (g) => {
      matches.push(g);
    });

    const s1: TestSession = { id: 's1' };
    const s2: TestSession = { id: 's2' };

    const t1 = service.enqueue(s1, {
      userId: 'u1',
      displayName: 'LowMMR',
      mmr: 1000,
      pingMs: 50,
    });
    const t2 = service.enqueue(s2, {
      userId: 'u2',
      displayName: 'HighMMR',
      mmr: 1200, // diff = 200 (would be ok if window grew, but loadFactor=1 keeps it tight at 50)
      pingMs: 52,
    });

    const oldest = Math.min(t1.createdAt, t2.createdAt);

    // Any wait we choose, loadFactor remains ~1, so mmrWindow = baseMmrWindow (50).
    await service.tick(oldest + 10_000);

    // They should not be matched together: expect two separate matches.
    expect(matches.length).toBe(2);
    const sizes = matches.map((g) => g.tickets.length);
    expect(sizes).toEqual([1, 1]);

    const allUserIds = matches.flatMap((g) => g.tickets.map((t) => t.playerId)).sort();
    expect(allUserIds).toEqual(['u1', 'u2']);
  });

  it('honors virtualCapacity and maxHumans when many players search', async () => {
    const config = createBaseConfig({
      virtualCapacity: 4,
      maxHumans: 4,
      startDelayByHumans: {
        1: 0,
        2: 0,
        3: 0,
        4: 0,
        default: 0,
      },
    });

    const matches: MatchGroup<TestSession>[] = [];
    const service = new MatchmakingService<TestSession>(config, async (g) => {
      matches.push(g);
    });

    const tickets = [];

    for (let i = 0; i < 10; i += 1) {
      const s: TestSession = { id: `s${i}` };
      const t = service.enqueue(s, {
        userId: `u${i}`,
        displayName: `P${i}`,
        mmr: 1500,
        pingMs: 50 + i, // slightly different pings, all within base window
      });
      tickets.push(t);
    }

    const oldest = Math.min(...tickets.map((t) => t.createdAt));
    await service.tick(oldest + 1000);

    const totalMatched = matches.map((g) => g.tickets.length).reduce((sum, n) => sum + n, 0);

    expect(totalMatched).toBe(10);
    for (const g of matches) {
      expect(g.tickets.length).toBeLessThanOrEqual(config.virtualCapacity);
    }
    expect(service.getQueueSize()).toBe(0);
  });

  it('does not start a match if hardMinHumans is not satisfied', async () => {
    const config = createBaseConfig({
      softMinHumans: 2,
      hardMinHumans: 2,
      startDelayByHumans: {
        1: 1000,
        2: 0,
        default: 0,
      },
    });

    const matches: MatchGroup<TestSession>[] = [];
    const service = new MatchmakingService<TestSession>(config, async (g) => {
      matches.push(g);
    });

    const s1: TestSession = { id: 's1' };

    const t1 = service.enqueue(s1, {
      userId: 'u1',
      displayName: 'Solo',
      mmr: 1500,
      pingMs: 40,
    });

    const oldest = t1.createdAt;

    // Even after long wait, with only 1 human and hardMinHumans=2, no match should start.
    await service.tick(oldest + 10_000);

    expect(matches.length).toBe(0);
    expect(service.getQueueSize()).toBe(1);
  });
});
