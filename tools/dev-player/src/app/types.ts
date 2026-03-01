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

export interface InstanceState {
  id: string;
  index: number;
  matchState: 'idle' | 'queuing' | 'connecting' | 'playing' | 'error';
  error?: string;
  ready: boolean;
  stats: InstanceStats | null;
}

export type DevPlayerAction =
  | { type: 'SET_PRESET'; preset: GamePreset }
  | { type: 'SET_COUNT'; count: number }
  | { type: 'START' }
  | { type: 'STOP' }
  | { type: 'INSTANCE_READY'; instanceId: string }
  | { type: 'INSTANCE_STATS'; instanceId: string; stats: InstanceStats }
  | { type: 'INSTANCE_MATCH_STATE'; instanceId: string; state: InstanceState['matchState']; error?: string }
  | { type: 'TICK' };

export interface DevPlayerState {
  preset: GamePreset;
  instanceCount: number;
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
];

export const PRESETS: GamePreset[] = _injected ?? MONOREPO_PRESETS;
