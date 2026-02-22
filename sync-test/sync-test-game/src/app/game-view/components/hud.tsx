import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { useRunner } from '../runner-provider';
import { PlayerResources, ECSConfig, ReplayInputProvider } from '@lagless/core';
import { GameState, PlayerResource, DivergenceSignal, SyncTestArena } from '@lagless/sync-test-simulation';

interface PlayerHudData {
  slot: number;
  connected: boolean;
  score: number;
  collectCount: number;
  lastHash: number;
  lastHashTick: number;
  mismatchCount: number;
}

export const HUD: FC = () => {
  const runner = useRunner();

  const [tick, setTick] = useState(0);
  const [localHash, setLocalHash] = useState(0);
  const [totalCollected, setTotalCollected] = useState(0);
  const [players, setPlayers] = useState<PlayerHudData[]>([]);
  const [hasDivergence, setHasDivergence] = useState(false);
  const [divergenceInfo, setDivergenceInfo] = useState('');

  const isReplay = useMemo(() => runner.InputProviderInstance instanceof ReplayInputProvider, [runner]);
  const _ECSConfig = useMemo(() => runner.DIContainer.resolve(ECSConfig), [runner]);
  const _GameState = useMemo(() => runner.DIContainer.resolve(GameState), [runner]);
  const _PlayerResources = useMemo(() => runner.DIContainer.resolve(PlayerResources), [runner]);

  useEffect(() => {
    const signal = runner.DIContainer.resolve(DivergenceSignal);
    const unsub = signal.Predicted.subscribe((e) => {
      setHasDivergence(true);
      setDivergenceInfo(
        `P${e.data.slotA} vs P${e.data.slotB}: ${e.data.hashA.toString(16)} != ${e.data.hashB.toString(16)} @ tick ${e.data.atTick}`,
      );
    });
    return () => unsub();
  }, [runner]);

  const updateStats = useCallback(() => {
    const currentTick = runner.Simulation.tick;
    setTick(currentTick);
    setTotalCollected(_GameState.safe.totalCollected);

    if (currentTick > 0 && currentTick % SyncTestArena.hashReportInterval === 0) {
      setLocalHash(runner.Simulation.mem.getHash());
    }

    const maxPlayers = _ECSConfig.maxPlayers;
    const playerData: PlayerHudData[] = [];
    for (let i = 0; i < maxPlayers; i++) {
      const pr = _PlayerResources.get(PlayerResource, i);
      if (pr.safe.connected || pr.safe.score > 0) {
        playerData.push({
          slot: i,
          connected: pr.safe.connected === 1,
          score: pr.safe.score,
          collectCount: pr.safe.collectCount,
          lastHash: pr.safe.lastReportedHash,
          lastHashTick: pr.safe.lastReportedHashTick,
          mismatchCount: pr.safe.hashMismatchCount,
        });
      }
    }
    setPlayers(playerData);
  }, [runner, _GameState, _ECSConfig, _PlayerResources]);

  useEffect(() => {
    return runner.Simulation.addTickHandler(updateStats);
  }, [runner, updateStats]);

  const downloadReplay = useCallback(() => {
    const ip = runner.InputProviderInstance;
    const rpcData = ip.rpcHistory.export(ip.inputRegistry);
    const replay = ReplayInputProvider.exportReplay(
      runner.Config.seed,
      runner.Config.maxPlayers,
      runner.Config.fps,
      rpcData,
    );
    const blob = new Blob([replay], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `replay-${Date.now()}.replay`;
    a.click();
    URL.revokeObjectURL(url);
  }, [runner]);

  return (
    <div style={styles.container}>
      <div style={styles.row}>
        {isReplay && <span style={styles.replayBadge}>REPLAY</span>}
        <span style={styles.label}>TICK</span>
        <span style={styles.value}>{tick}</span>
        <span style={styles.label}>COLLECTED</span>
        <span style={styles.value}>{totalCollected}</span>
        <span style={styles.label}>HASH</span>
        <span style={styles.value}>{localHash.toString(16).padStart(8, '0')}</span>
        {!isReplay && (
          <button style={styles.replayButton} onClick={downloadReplay}>
            Save Replay
          </button>
        )}
      </div>

      <div style={styles.playersRow}>
        {players.map((p) => (
          <div key={p.slot} style={styles.playerCard}>
            <span style={{ ...styles.playerSlot, color: p.connected ? '#44ff44' : '#ff4444' }}>
              P{p.slot}
            </span>
            <span style={styles.playerStat}>Score: {p.score}</span>
            <span style={styles.playerStat}>x{p.collectCount}</span>
          </div>
        ))}
      </div>

      <div style={{ ...styles.syncStatus, color: hasDivergence ? '#ff4444' : '#44ff44' }}>
        {hasDivergence ? `DIVERGENCE: ${divergenceInfo}` : 'IN SYNC'}
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'fixed',
    top: 8,
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(0,0,0,0.7)',
    borderRadius: 6,
    padding: '6px 12px',
    fontFamily: "'Courier New', monospace",
    fontSize: 12,
    color: '#e0e0e0',
    zIndex: 100,
    pointerEvents: 'none',
    userSelect: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    minWidth: 400,
  },
  row: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
  },
  label: {
    color: '#88aaff',
    marginRight: 2,
  },
  value: {
    marginRight: 8,
  },
  playersRow: {
    display: 'flex',
    gap: 12,
  },
  playerCard: {
    display: 'flex',
    gap: 6,
    alignItems: 'center',
  },
  playerSlot: {
    fontWeight: 'bold',
  },
  playerStat: {
    color: '#cccccc',
  },
  syncStatus: {
    textAlign: 'center' as const,
    fontWeight: 'bold',
    fontSize: 11,
  },
  replayBadge: {
    background: '#ff4444',
    color: '#fff',
    padding: '1px 6px',
    borderRadius: 3,
    fontWeight: 'bold',
    fontSize: 10,
    marginRight: 8,
  },
  replayButton: {
    pointerEvents: 'auto' as const,
    cursor: 'pointer',
    background: '#1a3a6a',
    color: '#88aaff',
    border: '1px solid #4488ff',
    borderRadius: 3,
    padding: '2px 8px',
    fontSize: 11,
    fontFamily: "'Courier New', monospace",
    marginLeft: 8,
  },
};
