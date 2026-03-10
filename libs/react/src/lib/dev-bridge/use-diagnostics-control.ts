import { useState, useEffect } from 'react';
import { DevBridge } from './dev-bridge.js';
import type { DevBridgeSetDiagnosticsMessage } from './protocol.js';

/**
 * Hook that manages diagnostics toggle state from dev-player.
 *
 * - Returns `true` when DevBridge is NOT active (standalone play — diagnostics always on).
 * - When inside dev-player: reads initial state from `diagnostics` URL param (default: false).
 * - Listens for `dev-bridge:set-diagnostics` messages to toggle at runtime.
 */
export function useDiagnosticsControl(): boolean {
  const active = DevBridge.isActive();

  const [enabled, setEnabled] = useState<boolean>(() => {
    if (!active) return true;
    const params = DevBridge.getUrlParams();
    return params?.diagnostics ?? false;
  });

  useEffect(() => {
    if (!active) return;

    const listener = (event: MessageEvent) => {
      const data = event.data;
      if (data && data.type === 'dev-bridge:set-diagnostics') {
        setEnabled((data as DevBridgeSetDiagnosticsMessage).enabled);
      }
    };

    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [active]);

  return enabled;
}
