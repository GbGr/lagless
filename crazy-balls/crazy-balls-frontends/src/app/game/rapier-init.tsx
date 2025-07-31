import { FC, ReactNode, useEffect, useState } from 'react';
import Rapier from '@dimforge/rapier2d-deterministic-compat';

const initRapierPromise = Rapier.init();

export const RapierInit: FC<{ children: ReactNode }> = ({ children }) => {
  const [ initialized, setInitialized ] = useState(false);

  useEffect(() => {
    initRapierPromise.then(() => {
      setInitialized(true);
    })
  }, []);

  return initialized ? children : null;
};
