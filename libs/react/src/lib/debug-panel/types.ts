import type { ECSRunner } from '@lagless/core';
import type { HashMismatchData } from '@lagless/core';
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

export interface LogEntry {
  tick: number;
  message: string;
}

export interface DebugPanelProps {
  runner: ECSRunner;
  toggleKey?: string;
  onDivergence?: (fn: (data: HashMismatchData) => void) => () => void;
  showConnectionControls?: boolean;
  children?: ReactNode;
}
