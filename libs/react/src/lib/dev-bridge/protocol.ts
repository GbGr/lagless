// ─── Instance → Parent ───────────────────────────────────────

export interface DevBridgeReadyMessage {
  type: 'dev-bridge:ready';
  instanceId: string;
}

export interface DevBridgeStatsMessage {
  type: 'dev-bridge:stats';
  instanceId: string;
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
  verifiedHashTick?: number;
  verifiedHash?: number;
}

export interface DevBridgeMatchStateMessage {
  type: 'dev-bridge:match-state';
  instanceId: string;
  state: 'idle' | 'queuing' | 'connecting' | 'playing' | 'error';
  error?: string;
}

export type DevBridgeChildMessage =
  | DevBridgeReadyMessage
  | DevBridgeStatsMessage
  | DevBridgeMatchStateMessage;

// ─── Parent → Instance ───────────────────────────────────────

export interface DevBridgeStartMatchMessage {
  type: 'dev-bridge:start-match';
}

export interface DevBridgeResetMessage {
  type: 'dev-bridge:reset';
}

export interface DevBridgeSetDiagnosticsMessage {
  type: 'dev-bridge:set-diagnostics';
  enabled: boolean;
}

export type DevBridgeParentMessage =
  | DevBridgeStartMatchMessage
  | DevBridgeResetMessage
  | DevBridgeSetDiagnosticsMessage;
