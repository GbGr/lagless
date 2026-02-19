import './net-debug.scss';
import { FC, useCallback, useEffect, useState } from 'react';
import { useRunner } from '../../runner-provider';
import { RelayInputProvider } from '@lagless/relay-client';

interface NetDebugStats {
  connected: boolean;
  clockReady: boolean;
  sampleCount: number;
  rttMs: number;
  jitterMs: number;
  inputDelayTicks: number;
  inputDelayMs: number;
  nudgerActive: boolean;
  nudgerDebtMs: number;
  localTick: number;
  rollbackCount: number;
  fps: number;
}

const EMPTY_STATS: NetDebugStats = {
  connected: false,
  clockReady: false,
  sampleCount: 0,
  rttMs: 0,
  jitterMs: 0,
  inputDelayTicks: 0,
  inputDelayMs: 0,
  nudgerActive: false,
  nudgerDebtMs: 0,
  localTick: 0,
  rollbackCount: 0,
  fps: 0,
};

export const NetDebug: FC = () => {
  const runner = useRunner();
  const [visible, setVisible] = useState(false);
  const [stats, setStats] = useState<NetDebugStats>(EMPTY_STATS);

  // Check if this is a multiplayer session
  const relayProvider = runner.InputProviderInstance instanceof RelayInputProvider
    ? runner.InputProviderInstance
    : null;

  // F3 toggle
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F3') {
        e.preventDefault();
        setVisible((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Tick-driven stats update
  const updateStats = useCallback(() => {
    if (!relayProvider) return;

    const clockSync = relayProvider.clockSync;
    const nudger = runner.Simulation.clock.phaseNudger;
    const frameLength = runner.Config.frameLength;

    setStats({
      connected: true,
      clockReady: clockSync.isReady,
      sampleCount: clockSync.sampleCount,
      rttMs: clockSync.rttEwmaMs,
      jitterMs: clockSync.jitterEwmaMs,
      inputDelayTicks: relayProvider.currentInputDelay,
      inputDelayMs: relayProvider.currentInputDelay * frameLength,
      nudgerActive: nudger.isActive,
      nudgerDebtMs: nudger.currentDebtMs,
      localTick: runner.Simulation.tick,
      rollbackCount: relayProvider.rollbackCount,
      fps: 1000 / frameLength,
    });
  }, [relayProvider, runner]);

  useEffect(() => {
    if (!relayProvider) return;
    return runner.Simulation.addTickHandler(updateStats);
  }, [relayProvider, runner, updateStats]);

  // Hide in local play or when toggled off
  if (!relayProvider || !visible) return null;

  const s = stats;

  return (
    <div className="net-debug">
      <div className="net-debug__section">
        <span className="net-debug__label">CONN </span>
        {s.clockReady ? 'ready' : `warmup (${s.sampleCount})`}
      </div>
      <div className="net-debug__section">
        <span className="net-debug__label">RTT  </span>
        {s.rttMs.toFixed(1)}ms ({s.sampleCount})
      </div>
      <div className="net-debug__section">
        <span className="net-debug__label">JIT  </span>
        {s.jitterMs.toFixed(1)}ms
      </div>
      <div className="net-debug__section">
        <span className="net-debug__label">IDLY </span>
        {s.inputDelayTicks}t / {s.inputDelayMs.toFixed(0)}ms
      </div>
      <div className="net-debug__section">
        <span className="net-debug__label">NUDG </span>
        {s.nudgerActive ? `${s.nudgerDebtMs.toFixed(1)}ms` : 'off'}
      </div>
      <div className="net-debug__section">
        <span className="net-debug__label">TICK </span>
        {s.localTick}
        <span className="net-debug__label"> RB </span>
        {s.rollbackCount}
      </div>
      <div className="net-debug__section">
        <span className="net-debug__label">FPS  </span>
        {s.fps.toFixed(0)}
      </div>
    </div>
  );
};
