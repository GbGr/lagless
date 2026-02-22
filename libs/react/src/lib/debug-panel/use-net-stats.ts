import { useCallback, useEffect, useMemo, useState } from 'react';
import { ECSConfig, PlayerResources, type ECSRunner, type IPlayerResourceConstructor } from '@lagless/core';
import { RelayInputProvider } from '@lagless/relay-client';
import type { NetStats, HashTableEntry } from './types.js';

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

interface HashPlayerResourceProxy {
  connected: number;
  lastReportedHash: number;
  lastReportedHashTick: number;
}

export function useNetStats(
  runner: ECSRunner,
  playerResourceClass?: IPlayerResourceConstructor,
) {
  const [stats, setStats] = useState<NetStats>(EMPTY_STATS);
  const [hashTable, setHashTable] = useState<HashTableEntry[]>([]);

  const relayProvider =
    runner.InputProviderInstance instanceof RelayInputProvider
      ? runner.InputProviderInstance
      : null;

  const ecsConfig = useMemo(() => runner.DIContainer.resolve(ECSConfig), [runner]);
  const playerResources = useMemo(() => runner.DIContainer.resolve(PlayerResources), [runner]);

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

    if (playerResourceClass) {
      const maxPlayers = ecsConfig.maxPlayers;
      const table: HashTableEntry[] = [];
      for (let i = 0; i < maxPlayers; i++) {
        const pr = playerResources.get(playerResourceClass, i);
        const safe = pr.safe as unknown as HashPlayerResourceProxy;
        if (safe.connected || safe.lastReportedHashTick > 0) {
          table.push({
            slot: i,
            hash: safe.lastReportedHash.toString(16).padStart(8, '0'),
            tick: safe.lastReportedHashTick,
          });
        }
      }
      setHashTable(table);
    }
  }, [relayProvider, runner, playerResourceClass, ecsConfig, playerResources]);

  useEffect(() => {
    if (!relayProvider) return;
    return runner.Simulation.addTickHandler(updateStats);
  }, [relayProvider, runner, updateStats]);

  return { stats, hashTable, relayProvider };
}
