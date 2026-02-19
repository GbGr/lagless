export interface RelayConnectionConfig {
  readonly serverUrl: string;
  readonly matchId: string;
  readonly token: string;
}

export const PING_WARMUP_INTERVAL_MS = 150;
export const PING_WARMUP_COUNT = 5;
export const PING_STEADY_INTERVAL_MS = 1000;
