import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { InMemoryQueueStore } from './queue-store.js';
import { tryFormMatch } from './match-formation.js';
import { MatchmakingService } from './matchmaking-service.js';
import type {
  QueueEntry, ScopeConfig, FormedMatch,
  MatchmakingMessage, MatchFoundPlayerData,
} from './types.js';

// ─── Helpers ────────────────────────────────────────────────

function makeEntry(
  playerId: string,
  mmr = 1000,
  joinedAt = performance.now(),
): QueueEntry {
  return { playerId, mmr, metadata: {}, joinedAt };
}

function noop() { /* test stub */ }

function createNotifySpy(): { notify: (msg: MatchmakingMessage) => void; messages: MatchmakingMessage[] } {
  const messages: MatchmakingMessage[] = [];
  return {
    notify: (msg: MatchmakingMessage) => messages.push(msg),
    messages,
  };
}

// ─────────────────────────────────────────────────────────────
// InMemoryQueueStore
// ─────────────────────────────────────────────────────────────

describe('InMemoryQueueStore', () => {
  let store: InMemoryQueueStore;

  beforeEach(() => {
    store = new InMemoryQueueStore();
  });

  it('should add and retrieve entries', () => {
    const entry = makeEntry('p1');
    store.add('scope-a', entry);

    expect(store.getCount('scope-a')).toBe(1);
    expect(store.getAll('scope-a')[0].playerId).toBe('p1');
  });

  it('should separate scopes', () => {
    store.add('scope-a', makeEntry('p1'));
    store.add('scope-b', makeEntry('p2'));

    expect(store.getCount('scope-a')).toBe(1);
    expect(store.getCount('scope-b')).toBe(1);
    expect(store.getCount('scope-c')).toBe(0);
  });

  it('should remove entry by playerId', () => {
    store.add('s', makeEntry('p1'));
    store.add('s', makeEntry('p2'));

    const removed = store.remove('s', 'p1');
    expect(removed).toBe(true);
    expect(store.getCount('s')).toBe(1);
    expect(store.getAll('s')[0].playerId).toBe('p2');
  });

  it('should return false when removing non-existent entry', () => {
    expect(store.remove('s', 'nobody')).toBe(false);
  });

  it('should clean up empty scope', () => {
    store.add('s', makeEntry('p1'));
    store.remove('s', 'p1');

    expect(store.getActiveScopes().length).toBe(0);
  });

  it('should check if player exists in scope', () => {
    store.add('s', makeEntry('p1'));

    expect(store.has('s', 'p1')).toBe(true);
    expect(store.has('s', 'p2')).toBe(false);
    expect(store.has('other', 'p1')).toBe(false);
  });

  it('should list active scopes', () => {
    store.add('scope-a', makeEntry('p1'));
    store.add('scope-b', makeEntry('p2'));

    const scopes = store.getActiveScopes();
    expect(scopes).toContain('scope-a');
    expect(scopes).toContain('scope-b');
    expect(scopes.length).toBe(2);
  });

  it('should clear all data', () => {
    store.add('s1', makeEntry('p1'));
    store.add('s2', makeEntry('p2'));
    store.clear();

    expect(store.getActiveScopes().length).toBe(0);
    expect(store.getCount('s1')).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────
// tryFormMatch (match formation logic)
// ─────────────────────────────────────────────────────────────

describe('tryFormMatch', () => {
  const config: ScopeConfig = {
    minPlayersToStart: 2,
    maxPlayers: 4,
    waitTimeoutMs: 5000,
  };

  it('should return null for empty queue', () => {
    expect(tryFormMatch([], config, performance.now())).toBeNull();
  });

  it('should return null when not enough players and no timeout', () => {
    const now = performance.now();
    const entries = [makeEntry('p1', 1000, now)];
    expect(tryFormMatch(entries, config, now)).toBeNull();
  });

  it('should form match immediately when enough players', () => {
    const entries = [
      makeEntry('p1', 1000),
      makeEntry('p2', 1100),
      makeEntry('p3', 900),
      makeEntry('p4', 1050),
    ];

    const result = tryFormMatch(entries, config, performance.now());
    expect(result).not.toBeNull();
    expect(result?.players.length).toBe(4);
    expect(result?.botsNeeded).toBe(0);
  });

  it('should pick by MMR proximity when more players than needed', () => {
    const now = performance.now();
    const entries = [
      makeEntry('p1', 1000, now - 10000), // anchor (oldest)
      makeEntry('p2', 2000, now - 5000),  // far MMR
      makeEntry('p3', 1050, now - 4000),  // close MMR
      makeEntry('p4', 1100, now - 3000),  // close MMR
      makeEntry('p5', 950, now - 2000),   // close MMR
      makeEntry('p6', 3000, now - 1000),  // far MMR
    ];

    const result = tryFormMatch(entries, config, now);
    expect(result).not.toBeNull();
    expect(result?.players.length).toBe(4);

    // Should include p1 (anchor) and 3 closest by MMR
    const ids = result?.players.map(p => p.playerId) ?? [];
    expect(ids).toContain('p1'); // always included (anchor)
    expect(ids).toContain('p5'); // 950 → distance 50
    expect(ids).toContain('p3'); // 1050 → distance 50
    expect(ids).toContain('p4'); // 1100 → distance 100

    // p2 (distance 1000) and p6 (distance 2000) should NOT be picked
    expect(ids).not.toContain('p2');
    expect(ids).not.toContain('p6');
  });

  it('should form match with bots on timeout', () => {
    const now = performance.now();
    const entries = [
      makeEntry('p1', 1000, now - 6000), // joined 6s ago (> 5s timeout)
      makeEntry('p2', 1100, now - 5500),
    ];

    const result = tryFormMatch(entries, config, now);
    expect(result).not.toBeNull();
    expect(result?.players.length).toBe(2);
    expect(result?.botsNeeded).toBe(2); // 4 - 2 = 2 bots needed
  });

  it('should not form match on timeout if below minimum', () => {
    const now = performance.now();
    const entries = [
      makeEntry('p1', 1000, now - 6000), // only 1 player, min is 2
    ];

    expect(tryFormMatch(entries, config, now)).toBeNull();
  });

  it('should handle minPlayers = 1 (solo + bots)', () => {
    const soloConfig: ScopeConfig = { minPlayersToStart: 1, maxPlayers: 4, waitTimeoutMs: 5000 };
    const now = performance.now();
    const entries = [makeEntry('p1', 1000, now - 6000)];

    const result = tryFormMatch(entries, soloConfig, now);
    expect(result).not.toBeNull();
    expect(result?.players.length).toBe(1);
    expect(result?.botsNeeded).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────
// MatchmakingService
// ─────────────────────────────────────────────────────────────

describe('MatchmakingService', () => {
  let store: InMemoryQueueStore;
  let service: MatchmakingService;

  beforeEach(() => {
    store = new InMemoryQueueStore();
    service = new MatchmakingService(store);
    service.registerScope('test-game', {
      minPlayersToStart: 2,
      maxPlayers: 4,
      waitTimeoutMs: 5000,
    });
  });

  afterEach(() => {
    service.dispose();
  });

  describe('addPlayer', () => {
    it('should add player to queue and notify position', () => {
      const spy = createNotifySpy();
      service.addPlayer('p1', 'test-game', 1000, {}, spy.notify);

      expect(store.getCount('test-game')).toBe(1);
      expect(spy.messages.length).toBe(1);
      expect(spy.messages[0]).toEqual({ type: 'queued', position: 1, total: 1 });
    });

    it('should reject unknown scope', () => {
      const spy = createNotifySpy();
      const ok = service.addPlayer('p1', 'unknown', 1000, {}, spy.notify);

      expect(ok).toBe(false);
      expect(spy.messages[0].type).toBe('error');
    });

    it('should reject duplicate player', () => {
      const spy1 = createNotifySpy();
      const spy2 = createNotifySpy();

      service.addPlayer('p1', 'test-game', 1000, {}, spy1.notify);
      const ok = service.addPlayer('p1', 'test-game', 1000, {}, spy2.notify);

      expect(ok).toBe(false);
      expect(spy2.messages[0].type).toBe('error');
    });

    it('should update positions for all players when new player joins', () => {
      const spy1 = createNotifySpy();
      const spy2 = createNotifySpy();

      service.addPlayer('p1', 'test-game', 1000, {}, spy1.notify);
      service.addPlayer('p2', 'test-game', 1000, {}, spy2.notify);

      // p1 gets initial position, then updated position when p2 joins
      expect(spy1.messages).toEqual([
        { type: 'queued', position: 1, total: 1 },
        { type: 'queued', position: 1, total: 2 },
      ]);

      expect(spy2.messages).toEqual([
        { type: 'queued', position: 2, total: 2 },
      ]);
    });
  });

  describe('removePlayer', () => {
    it('should remove player from queue', () => {
      const spy = createNotifySpy();
      service.addPlayer('p1', 'test-game', 1000, {}, spy.notify);
      service.removePlayer('p1');

      expect(store.getCount('test-game')).toBe(0);
      expect(service.isPlayerQueued('p1')).toBe(false);
    });

    it('should update positions for remaining players', () => {
      const spy1 = createNotifySpy();
      const spy2 = createNotifySpy();
      const spy3 = createNotifySpy();

      service.addPlayer('p1', 'test-game', 1000, {}, spy1.notify);
      service.addPlayer('p2', 'test-game', 1000, {}, spy2.notify);
      service.addPlayer('p3', 'test-game', 1000, {}, spy3.notify);

      spy2.messages.length = 0; // clear prior messages
      spy3.messages.length = 0;

      service.removePlayer('p1');

      // p2 moves from position 2 → 1, p3 from 3 → 2
      expect(spy2.messages).toEqual([
        { type: 'queued', position: 1, total: 2 },
      ]);
      expect(spy3.messages).toEqual([
        { type: 'queued', position: 2, total: 2 },
      ]);
    });

    it('should return false for unknown player', () => {
      expect(service.removePlayer('nobody')).toBe(false);
    });
  });

  describe('match formation', () => {
    it('should form match when enough players join', async () => {
      const formedMatches: FormedMatch[] = [];

      service.setOnMatchFormed(async (match) => {
        formedMatches.push(match);
        const result = new Map<string, MatchFoundPlayerData>();
        let slot = 0;
        for (const p of match.players) {
          result.set(p.playerId, { playerSlot: slot++, token: `token-${p.playerId}` });
        }
        return result;
      });

      const spies = Array.from({ length: 4 }, () => createNotifySpy());

      for (let i = 0; i < 4; i++) {
        service.addPlayer(`p${i}`, 'test-game', 1000, {}, spies[i].notify);
      }

      // Trigger check manually
      service.checkAllScopes();

      // Wait for async match formation
      await vi.waitFor(() => {
        expect(formedMatches.length).toBe(1);
      });

      expect(formedMatches[0].players.length).toBe(4);
      expect(formedMatches[0].scope).toBe('test-game');
      expect(formedMatches[0].botsNeeded).toBe(0);

      // All players should receive match_found
      for (const spy of spies) {
        const matchMsg = spy.messages.find(m => m.type === 'match_found');
        expect(matchMsg).toBeDefined();
      }

      // Queue should be empty
      expect(store.getCount('test-game')).toBe(0);
    });

    it('should not form match with insufficient players', () => {
      const formedMatches: FormedMatch[] = [];
      service.setOnMatchFormed(async (match) => {
        formedMatches.push(match);
        return new Map();
      });

      const spy = createNotifySpy();
      service.addPlayer('p1', 'test-game', 1000, {}, spy.notify);

      service.checkAllScopes();

      expect(formedMatches.length).toBe(0);
      expect(store.getCount('test-game')).toBe(1);
    });

    it('should include matchId (UUID) in formed match', async () => {
      service.setOnMatchFormed(async (match) => {
        // UUID format check: 8-4-4-4-12
        expect(match.matchId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
        const result = new Map<string, MatchFoundPlayerData>();
        for (const p of match.players) {
          result.set(p.playerId, { playerSlot: 0, token: 'tok' });
        }
        return result;
      });

      for (let i = 0; i < 4; i++) {
        service.addPlayer(`p${i}`, 'test-game', 1000, {}, noop);
      }

      service.checkAllScopes();
      await vi.waitFor(() => expect(store.getCount('test-game')).toBe(0));
    });

    it('should handle onMatchFormed errors gracefully', async () => {
      service.setOnMatchFormed(async () => {
        throw new Error('DB connection failed');
      });

      const spies = Array.from({ length: 4 }, () => createNotifySpy());

      for (let i = 0; i < 4; i++) {
        service.addPlayer(`p${i}`, 'test-game', 1000, {}, spies[i].notify);
      }

      service.checkAllScopes();

      await vi.waitFor(() => {
        // Players should be notified of error
        for (const spy of spies) {
          const errorMsg = spy.messages.find(m => m.type === 'error');
          expect(errorMsg).toBeDefined();
        }
      });

      // Players should be removed from registry
      for (let i = 0; i < 4; i++) {
        expect(service.isPlayerQueued(`p${i}`)).toBe(false);
      }
    });
  });

  describe('periodic checking', () => {
    it('should auto-check scopes when started', async () => {
      service.setCheckInterval(50);

      service.setOnMatchFormed(async (match) => {
        const result = new Map<string, MatchFoundPlayerData>();
        let slot = 0;
        for (const p of match.players) {
          result.set(p.playerId, { playerSlot: slot++, token: 'tok' });
        }
        return result;
      });

      for (let i = 0; i < 4; i++) {
        service.addPlayer(`p${i}`, 'test-game', 1000, {}, noop);
      }

      service.start();

      await vi.waitFor(() => {
        expect(store.getCount('test-game')).toBe(0);
      }, { timeout: 1000 });

      service.stop();
    });
  });

  describe('multiple scopes', () => {
    it('should handle independent scopes', async () => {
      service.registerScope('game-b', {
        minPlayersToStart: 1,
        maxPlayers: 2,
        waitTimeoutMs: 5000,
      });

      const matches: FormedMatch[] = [];
      service.setOnMatchFormed(async (match) => {
        matches.push(match);
        const result = new Map<string, MatchFoundPlayerData>();
        let slot = 0;
        for (const p of match.players) {
          result.set(p.playerId, { playerSlot: slot++, token: 'tok' });
        }
        return result;
      });

      // 2 players in game-b (full match)
      service.addPlayer('b1', 'game-b', 1000, {}, noop);
      service.addPlayer('b2', 'game-b', 1000, {}, noop);

      // 2 players in test-game (not enough for 4)
      service.addPlayer('a1', 'test-game', 1000, {}, noop);
      service.addPlayer('a2', 'test-game', 1000, {}, noop);

      service.checkAllScopes();

      await vi.waitFor(() => {
        expect(matches.length).toBe(1);
      });

      expect(matches[0].scope).toBe('game-b');
      expect(matches[0].players.length).toBe(2);

      // test-game queue should be untouched
      expect(store.getCount('test-game')).toBe(2);
    });
  });

  describe('edge cases', () => {
    it('should handle player disconnect during match formation', async () => {
      service.setOnMatchFormed(async (match) => {
        // Simulate player disconnect during callback
        service.removePlayer('p0');

        const result = new Map<string, MatchFoundPlayerData>();
        let slot = 0;
        for (const p of match.players) {
          result.set(p.playerId, { playerSlot: slot++, token: 'tok' });
        }
        return result;
      });

      const spies = Array.from({ length: 4 }, () => createNotifySpy());

      for (let i = 0; i < 4; i++) {
        service.addPlayer(`p${i}`, 'test-game', 1000, {}, spies[i].notify);
      }

      service.checkAllScopes();

      await vi.waitFor(() => {
        // p0 was removed during callback, so won't get match_found
        // p1-p3 should get match_found
        for (let i = 1; i < 4; i++) {
          const matchMsg = spies[i].messages.find(m => m.type === 'match_found');
          expect(matchMsg).toBeDefined();
        }
      });
    });

    it('should clean up stale store entries on duplicate add', () => {
      // Simulate stale entry in store (from crashed connection)
      store.add('test-game', makeEntry('p1'));

      const spy = createNotifySpy();
      const ok = service.addPlayer('p1', 'test-game', 1000, {}, spy.notify);

      expect(ok).toBe(true);
      expect(store.getCount('test-game')).toBe(1); // not 2
    });
  });

  describe('late-join', () => {
    it('should call tryLateJoin before tryFormMatch', () => {
      const tryLateJoin = vi.fn(() => null);
      service.setTryLateJoin(tryLateJoin);

      const spy = createNotifySpy();
      service.addPlayer('p1', 'test-game', 1000, {}, spy.notify);

      service.checkAllScopes();

      expect(tryLateJoin).toHaveBeenCalledOnce();
      expect(tryLateJoin).toHaveBeenCalledWith('p1', 'test-game', {});
    });

    it('should remove player from queue on successful late-join', () => {
      service.setTryLateJoin((playerId) => ({
        matchId: 'existing-match',
        playerData: { playerSlot: 2, token: `token-${playerId}` },
      }));

      const spy = createNotifySpy();
      service.addPlayer('p1', 'test-game', 1000, {}, spy.notify);

      service.checkAllScopes();

      expect(store.getCount('test-game')).toBe(0);
      expect(service.isPlayerQueued('p1')).toBe(false);
    });

    it('should notify player with match_found on late-join', () => {
      service.setTryLateJoin(() => ({
        matchId: 'existing-match',
        playerData: { playerSlot: 2, token: 'tok-late', serverUrl: 'ws://test' },
      }));

      const spy = createNotifySpy();
      service.addPlayer('p1', 'test-game', 1000, {}, spy.notify);

      service.checkAllScopes();

      const matchMsg = spy.messages.find(m => m.type === 'match_found');
      expect(matchMsg).toBeDefined();
      expect(matchMsg!.matchId).toBe('existing-match');
      expect((matchMsg as any).playerSlot).toBe(2);
      expect((matchMsg as any).token).toBe('tok-late');
    });

    it('should update queue positions after late-join', () => {
      let callCount = 0;
      service.setTryLateJoin((playerId) => {
        // Only accept first player
        if (callCount++ === 0) {
          return {
            matchId: 'existing-match',
            playerData: { playerSlot: 2, token: 'tok' },
          };
        }
        return null;
      });

      const spy1 = createNotifySpy();
      const spy2 = createNotifySpy();
      service.addPlayer('p1', 'test-game', 1000, {}, spy1.notify);
      service.addPlayer('p2', 'test-game', 1000, {}, spy2.notify);

      spy2.messages.length = 0;
      service.checkAllScopes();

      // p2 should have updated position (now position 1 of 1)
      const queueMsg = spy2.messages.find(m => m.type === 'queued');
      expect(queueMsg).toBeDefined();
      expect(queueMsg).toEqual({ type: 'queued', position: 1, total: 1 });
    });

    it('should fall through to normal match formation when tryLateJoin returns null', async () => {
      service.setTryLateJoin(() => null);

      const formedMatches: FormedMatch[] = [];
      service.setOnMatchFormed(async (match) => {
        formedMatches.push(match);
        const result = new Map<string, MatchFoundPlayerData>();
        let slot = 0;
        for (const p of match.players) {
          result.set(p.playerId, { playerSlot: slot++, token: `tok-${p.playerId}` });
        }
        return result;
      });

      for (let i = 0; i < 4; i++) {
        service.addPlayer(`p${i}`, 'test-game', 1000, {}, noop);
      }

      service.checkAllScopes();

      await vi.waitFor(() => {
        expect(formedMatches.length).toBe(1);
      });

      expect(formedMatches[0].players.length).toBe(4);
    });

    it('should place multiple players via late-join in one checkScope', () => {
      service.setTryLateJoin((playerId) => ({
        matchId: 'existing-match',
        playerData: { playerSlot: Number(playerId.replace('p', '')) + 2, token: `tok-${playerId}` },
      }));

      const spies = Array.from({ length: 3 }, () => createNotifySpy());
      for (let i = 0; i < 3; i++) {
        service.addPlayer(`p${i}`, 'test-game', 1000, {}, spies[i].notify);
      }

      service.checkAllScopes();

      // All 3 should have match_found
      for (const spy of spies) {
        const matchMsg = spy.messages.find(m => m.type === 'match_found');
        expect(matchMsg).toBeDefined();
      }

      expect(store.getCount('test-game')).toBe(0);
    });
  });
});
