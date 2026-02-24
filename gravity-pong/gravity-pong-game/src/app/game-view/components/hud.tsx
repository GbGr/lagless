import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { useRunner } from '../runner-provider';
import { PlayerResources, ECSConfig, ReplayInputProvider } from '@lagless/core';
import { MatchState, PlayerResource, GravityPongArena } from '@lagless/gravity-pong-simulation';

const PHASE_NAMES = ['Setup', 'Aiming', 'Flight', 'Round End', 'Match Over'];

export const HUD: FC = () => {
  const runner = useRunner();

  const [scoreP0, setScoreP0] = useState(0);
  const [scoreP1, setScoreP1] = useState(0);
  const [phase, setPhase] = useState(0);
  const [roundNumber, setRoundNumber] = useState(0);
  const [aimTimer, setAimTimer] = useState(0);
  const [localHasShot, setLocalHasShot] = useState(false);
  const [matchOverWinner, setMatchOverWinner] = useState(-1);

  const isReplay = useMemo(() => runner.InputProviderInstance instanceof ReplayInputProvider, [runner]);
  const _MatchState = useMemo(() => runner.DIContainer.resolve(MatchState), [runner]);
  const _PlayerResources = useMemo(() => runner.DIContainer.resolve(PlayerResources), [runner]);

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
    a.download = `gravity-pong-replay-${Date.now()}.replay`;
    a.click();
    URL.revokeObjectURL(url);
  }, [runner]);

  const updateStats = useCallback(() => {
    const currentTick = runner.Simulation.tick;
    setScoreP0(_MatchState.safe.scoreP0);
    setScoreP1(_MatchState.safe.scoreP1);
    setPhase(_MatchState.safe.phase);
    setRoundNumber(_MatchState.safe.roundNumber);

    if (_MatchState.safe.phase === 1) {
      const elapsed = currentTick - _MatchState.safe.phaseStartTick;
      const remaining = Math.max(0, GravityPongArena.aimPhaseTicks - elapsed);
      setAimTimer(Math.ceil(remaining / 60));
    } else {
      setAimTimer(0);
    }

    if (_MatchState.safe.phase === 4) {
      setMatchOverWinner(_MatchState.safe.scoreP0 >= GravityPongArena.scoreToWin ? 0 : 1);
    } else {
      setMatchOverWinner(-1);
    }

    const pr = _PlayerResources.get(PlayerResource, 0);
    setLocalHasShot(pr.safe.hasShot === 1);
  }, [runner, _MatchState, _PlayerResources]);

  useEffect(() => {
    return runner.Simulation.addTickHandler(updateStats);
  }, [runner, updateStats]);

  return (
    <div style={styles.container}>
      <div style={styles.scoreRow}>
        <span style={{ ...styles.score, color: '#ff6644' }}>P0: {scoreP0}</span>
        <span style={styles.vs}>vs</span>
        <span style={{ ...styles.score, color: '#4488ff' }}>P1: {scoreP1}</span>
      </div>
      <div style={styles.infoRow}>
        {isReplay && <span style={styles.replayBadge}>REPLAY</span>}
        <span style={styles.label}>Round {roundNumber}</span>
        <span style={styles.phase}>{PHASE_NAMES[phase] || 'Unknown'}</span>
        {phase === 1 && aimTimer > 0 && <span style={styles.timer}>{aimTimer}s</span>}
        {phase === 1 && localHasShot && <span style={styles.waiting}>Waiting...</span>}
        {!isReplay && (
          <button style={styles.replayButton} onClick={downloadReplay}>
            Save Replay
          </button>
        )}
      </div>
      {matchOverWinner >= 0 && (
        <div style={styles.matchOver}>
          P{matchOverWinner} WINS!
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'fixed',
    top: 8,
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(0,0,0,0.75)',
    borderRadius: 8,
    padding: '8px 16px',
    fontFamily: "'Courier New', monospace",
    fontSize: 13,
    color: '#e0e0e0',
    zIndex: 100,
    pointerEvents: 'none',
    userSelect: 'none',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    minWidth: 260,
  },
  scoreRow: {
    display: 'flex',
    gap: 16,
    alignItems: 'center',
    fontSize: 20,
    fontWeight: 'bold',
  },
  score: {
    minWidth: 60,
    textAlign: 'center' as const,
  },
  vs: {
    color: '#666',
    fontSize: 14,
  },
  infoRow: {
    display: 'flex',
    gap: 10,
    alignItems: 'center',
    fontSize: 12,
  },
  label: {
    color: '#aaa',
  },
  phase: {
    color: '#88aaff',
    fontWeight: 'bold',
  },
  timer: {
    color: '#ffaa44',
    fontWeight: 'bold',
  },
  waiting: {
    color: '#888',
    fontStyle: 'italic',
  },
  matchOver: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffcc00',
    textAlign: 'center' as const,
    padding: '4px 0',
  },
  replayBadge: {
    background: '#ff4444',
    color: '#fff',
    padding: '1px 6px',
    borderRadius: 3,
    fontWeight: 'bold',
    fontSize: 10,
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
  },
};
