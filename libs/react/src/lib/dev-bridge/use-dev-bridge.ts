import { useEffect, useRef } from 'react';
import type { ECSRunner } from '@lagless/core';
import { RelayInputProvider } from '@lagless/relay-client';
import { DevBridge } from './dev-bridge.js';

const REPORT_EVERY_N_TICKS = 6;

export interface UseDevBridgeOptions {
  /** Hash tracking interval (same value passed to enableHashTracking). Enables verified hash reporting for the timeline. */
  hashTrackingInterval?: number;
  /** When false, skips expensive hash computation (mem.getHash(), getHashAtTick). Defaults to true. */
  diagnosticsEnabled?: boolean;
}

/**
 * Sends simulation stats to the dev-player parent via postMessage.
 * No-op if `?devBridge=true` is not in the URL.
 */
export function useDevBridge(runner: ECSRunner | null, options?: UseDevBridgeOptions): void {
  const bridgeRef = useRef<DevBridge | null>(null);
  const tickCountRef = useRef(0);
  const diagnosticsEnabledRef = useRef(options?.diagnosticsEnabled ?? true);
  diagnosticsEnabledRef.current = options?.diagnosticsEnabled ?? true;

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
      const diagEnabled = diagnosticsEnabledRef.current;

      // Compute verified hash only when diagnostics are enabled
      let verifiedHashTick: number | undefined;
      let verifiedHash: number | undefined;
      if (diagEnabled && hashInterval && hashInterval > 0) {
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

      // Skip expensive mem.getHash() when diagnostics are off
      const hash = diagEnabled ? sim.mem.getHash() : 0;

      if (relayProvider) {
        const cs = relayProvider.clockSync;
        bridge.sendStats({
          tick: sim.tick,
          hash,
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
          hash,
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
