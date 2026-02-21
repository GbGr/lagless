import type { ECSRunner, IPlayerResourceConstructor, ISignalConstructor } from '@lagless/core';
import type { ReactNode } from 'react';

export interface NetStats {
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

export interface HashTableEntry {
  slot: number;
  hash: string;
  tick: number;
}

export interface LogEntry {
  tick: number;
  message: string;
}

export interface DebugPanelProps {
  runner: ECSRunner;
  toggleKey?: string;
  hashVerification?: {
    playerResourceClass: IPlayerResourceConstructor;
    divergenceSignalClass: ISignalConstructor;
  };
  showConnectionControls?: boolean;
  children?: ReactNode;
}
