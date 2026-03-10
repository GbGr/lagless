import { useCallback, useEffect, useState } from 'react';
import type { ECSRunner } from '@lagless/core';
import { RelayInputProvider } from '@lagless/relay-client';
import type { NetStats } from './types.js';

const EMPTY_STATS: NetStats = {
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

export function useNetStats(runner: ECSRunner) {
  const [stats, setStats] = useState<NetStats>(EMPTY_STATS);

  const relayProvider =
    runner.InputProviderInstance instanceof RelayInputProvider
      ? runner.InputProviderInstance
      : null;

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

  return { stats, relayProvider };
}
