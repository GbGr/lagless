import { FC } from 'react';
import { useRunner } from '../runner-provider';
import { DebugPanel as SharedDebugPanel } from '@lagless/react';
import { PlayerResource, DivergenceSignal } from '@lagless/sync-test-simulation';

export const DebugPanel: FC = () => {
  const runner = useRunner();

  return (
    <SharedDebugPanel
      runner={runner}
      hashVerification={{
        playerResourceClass: PlayerResource,
        divergenceSignalClass: DivergenceSignal,
      }}
    />
  );
};
