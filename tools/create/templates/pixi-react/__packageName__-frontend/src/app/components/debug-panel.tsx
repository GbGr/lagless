import { FC } from 'react';
import { useRunner } from '../game-view/runner-provider';
import { DebugPanel as SharedDebugPanel } from '@lagless/react';

export const DebugPanel: FC = () => {
  const runner = useRunner();

  return (
    <SharedDebugPanel
      runner={runner}
    />
  );
};
