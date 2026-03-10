export interface GamePreset {
  label: string;
  gameUrl: string;
  serverUrl: string;
  scope: string;
}

export interface InstanceStats {
  tick: number;
  hash: number;
  rtt: number;
  jitter: number;
  inputDelay: number;
  rollbacks: number;
  fps: number;
  verifiedTick: number;
  playerSlot: number;
  connected: boolean;
  clockReady: boolean;
  lastUpdate: number;
  verifiedHashTick?: number;
  verifiedHash?: number;
}

export interface DiagnosticsSummary {
  rollbackCount: number;
  lastRollbackTick: number;
  verifiedTickGapCount: number;
  ticksRecorded: number;
  latestHash: number;
  latestPhysicsHash: number;
  latestVelocityHash: number;
}

export interface SystemTimingEntry {
  name: string;
  latest: number;
  min: number;
  max: number;
  avg: number;
}

export interface PerformanceStatsData {
  tickTime: { latest: number; min: number; max: number; avg: number };
  snapshotTime: { latest: number; min: number; max: number; avg: number } | null;
  overheadTime: { latest: number; min: number; max: number; avg: number } | null;
  systems: SystemTimingEntry[];
}

export interface InstanceState {
  id: string;
  index: number;
  matchState: 'idle' | 'queuing' | 'connecting' | 'playing' | 'error';
  error?: string;
  ready: boolean;
  stats: InstanceStats | null;
  diagnosticsSummary: DiagnosticsSummary | null;
  performanceStats: PerformanceStatsData | null;
}

export type DevPlayerAction =
  | { type: 'SET_PRESET'; preset: GamePreset }
  | { type: 'SET_COUNT'; count: number }
  | { type: 'SET_DIAGNOSTICS'; enabled: boolean }
  | { type: 'START' }
  | { type: 'STOP' }
  | { type: 'INSTANCE_READY'; instanceId: string }
  | { type: 'INSTANCE_STATS'; instanceId: string; stats: InstanceStats }
  | { type: 'INSTANCE_MATCH_STATE'; instanceId: string; state: InstanceState['matchState']; error?: string }
  | { type: 'INSTANCE_DIAGNOSTICS_SUMMARY'; instanceId: string; summary: DiagnosticsSummary }
  | { type: 'INSTANCE_PERFORMANCE_STATS'; instanceId: string; performanceStats: PerformanceStatsData }
  | { type: 'TICK' };

export interface DevPlayerState {
  preset: GamePreset;
  instanceCount: number;
  diagnosticsEnabled: boolean;
  running: boolean;
  sessionScope: string;
  instances: Map<string, InstanceState>;
}

// CLI injects presets via window.__LAGLESS_DEV_PLAYER_CONFIG__
const _injected: GamePreset[] | undefined =
  typeof window !== 'undefined'
    ? (window as unknown as Record<string, unknown>).__LAGLESS_DEV_PLAYER_CONFIG__ as GamePreset[] | undefined
    : undefined;

const MONOREPO_PRESETS: GamePreset[] = [
  { label: 'Sync Test',   gameUrl: 'http://localhost:4201', serverUrl: 'ws://localhost:3334', scope: 'sync-test' },
  { label: 'Circle Sumo', gameUrl: 'http://localhost:4200', serverUrl: 'ws://localhost:3333', scope: 'circle-sumo' },
  { label: 'Roblox-Like', gameUrl: 'http://localhost:4202', serverUrl: 'ws://localhost:3335', scope: 'roblox-like' },
  { label: '2D Map Test', gameUrl: 'http://localhost:4203', serverUrl: 'ws://localhost:3336', scope: '2d-map-test' },
];

export const PRESETS: GamePreset[] = _injected ?? MONOREPO_PRESETS;
