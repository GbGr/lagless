import { FC, useEffect } from 'react';
import { useRunner } from './runner-provider';

export const InputDrainer: FC = () => {
  const runner = useRunner();

  useEffect(() => {
    console.log('InputDrainer');
  }, [runner]);

  return null;
};
