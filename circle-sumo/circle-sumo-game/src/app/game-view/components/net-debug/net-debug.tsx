import { FC } from 'react';
import { useRunner } from '../../runner-provider';
import { DebugPanel } from '@lagless/react';

export const NetDebug: FC = () => {
  const runner = useRunner();

  return <DebugPanel runner={runner} />;
};
