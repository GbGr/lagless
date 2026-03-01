import { useEffect, useRef } from 'react';
import type { ECSRunner } from '@lagless/core';
import { RelayInputProvider } from '@lagless/relay-client';
import { DevBridge } from './dev-bridge.js';

const REPORT_EVERY_N_TICKS = 6;

export interface UseDevBridgeOptions {
  /** Hash tracking interval (same value passed to enableHashTracking). Enables verified hash reporting for the timeline. */
  hashTrackingInterval?: number;
}

/**
 * Sends simulation stats to the dev-player parent via postMessage.
 * No-op if `?devBridge=true` is not in the URL.
 */
export function useDevBridge(runner: ECSRunner | null, options?: UseDevBridgeOptions): void {
  const bridgeRef = useRef<DevBridge | null>(null);
  const tickCountRef = useRef(0);

  useEffect(() => {
    if (!runner) return;

    const bridge = DevBridge.fromUrlParams();
    if (!bridge) return;

    bridgeRef.current = bridge;
    bridge.sendReady();

    const relayProvider = runner.InputProviderInstance instanceof RelayInputProvider
      ? runner.InputProviderInstance
      : null;

    const hashInterval = options?.hashTrackingInterval;

    const cleanup = runner.Simulation.addTickHandler(() => {
      tickCountRef.current++;
      if (tickCountRef.current % REPORT_EVERY_N_TICKS !== 0) return;

      const sim = runner.Simulation;
      const frameLength = runner.Config.frameLength;

      // Compute verified hash (same logic as createHashReporter)
      let verifiedHashTick: number | undefined;
      let verifiedHash: number | undefined;
      if (hashInterval && hashInterval > 0) {
        const vt = relayProvider ? relayProvider.verifiedTick : sim.tick;
        const latestTick = Math.floor(vt / hashInterval) * hashInterval;
        if (latestTick > 0) {
          const h = sim.getHashAtTick(latestTick);
          if (h !== undefined) {
            verifiedHashTick = latestTick;
            verifiedHash = h;
          }
        }
      }

      if (relayProvider) {
        const cs = relayProvider.clockSync;
        bridge.sendStats({
          tick: sim.tick,
          hash: sim.mem.getHash(),
          rtt: cs.rttEwmaMs,
          jitter: cs.jitterEwmaMs,
          inputDelay: relayProvider.currentInputDelay,
          rollbacks: relayProvider.rollbackCount,
          fps: Math.round(1000 / frameLength),
          verifiedTick: relayProvider.verifiedTick,
          playerSlot: relayProvider.playerSlot,
          connected: true,
          clockReady: cs.isReady,
          verifiedHashTick,
          verifiedHash,
        });
      } else {
        bridge.sendStats({
          tick: sim.tick,
          hash: sim.mem.getHash(),
          rtt: 0,
          jitter: 0,
          inputDelay: 0,
          rollbacks: 0,
          fps: Math.round(1000 / frameLength),
          verifiedTick: sim.tick,
          playerSlot: 0,
          connected: false,
          clockReady: false,
          verifiedHashTick,
          verifiedHash,
        });
      }
    });

    return () => {
      cleanup();
      bridgeRef.current = null;
    };
  }, [runner]);
}
