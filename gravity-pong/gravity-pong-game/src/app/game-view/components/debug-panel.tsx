import { FC } from 'react';
import { useRunner } from '../runner-provider';
import { DebugPanel as SharedDebugPanel } from '@lagless/react';
import { PlayerResource, DivergenceSignal } from '@lagless/gravity-pong-simulation';

export const DebugPanelWrapper: FC = () => {
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
