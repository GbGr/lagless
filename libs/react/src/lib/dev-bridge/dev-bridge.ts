import type { DevBridgeChildMessage, DevBridgeParentMessage, DevBridgeStatsMessage } from './protocol.js';

export interface DevBridgeParams {
  instanceId: string;
  serverUrl: string;
  scope: string;
  autoMatch: boolean;
}

// Cache at module load — before React Router navigation strips query params
const _initialSearch = typeof window !== 'undefined' ? window.location.search : '';
const _initialParams = new URLSearchParams(_initialSearch);

export class DevBridge {
  private readonly _instanceId: string;

  private constructor(instanceId: string) {
    this._instanceId = instanceId;
  }

  /** True if running inside dev-player iframe (`?devBridge=true` in URL). */
  static isActive(): boolean {
    return _initialParams.get('devBridge') === 'true';
  }

  /** Parse dev-bridge params from URL. Returns null if not active. */
  static fromUrlParams(): DevBridge | null {
    if (!DevBridge.isActive()) return null;
    return new DevBridge(_initialParams.get('instanceId') || '0');
  }

  /** Get URL params for dev-bridge. */
  static getUrlParams(): DevBridgeParams | null {
    if (!DevBridge.isActive()) return null;
    return {
      instanceId: _initialParams.get('instanceId') || '0',
      serverUrl: _initialParams.get('serverUrl') || '',
      scope: _initialParams.get('scope') || '',
      autoMatch: _initialParams.get('autoMatch') === 'true',
    };
  }

  sendReady(): void {
    window.parent.postMessage({ type: 'dev-bridge:ready', instanceId: this._instanceId } satisfies DevBridgeChildMessage, '*');
  }

  sendStats(stats: Omit<DevBridgeStatsMessage, 'type' | 'instanceId'>): void {
    window.parent.postMessage({ type: 'dev-bridge:stats', instanceId: this._instanceId, ...stats } satisfies DevBridgeChildMessage, '*');
  }

  sendMatchState(state: 'idle' | 'queuing' | 'connecting' | 'playing' | 'error', error?: string): void {
    window.parent.postMessage({
      type: 'dev-bridge:match-state',
      instanceId: this._instanceId,
      state,
      ...(error !== undefined ? { error } : {}),
    } satisfies DevBridgeChildMessage, '*');
  }

  onParentMessage(handler: (msg: DevBridgeParentMessage) => void): () => void {
    const listener = (event: MessageEvent) => {
      const data = event.data;
      if (data && typeof data.type === 'string' && data.type.startsWith('dev-bridge:')) {
        handler(data as DevBridgeParentMessage);
      }
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }
}
