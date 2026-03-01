import { FC, ReactNode, useEffect, useState } from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { MathOps } from '@lagless/math';

export const App: FC = () => {
  return <Loading><RouterProvider router={router} /></Loading>;
};

let isMathLoadedPersisted = false;

const Loading: FC<{ children: ReactNode }> = ({ children }) => {
  const [ isMathLoaded, setIsMathLoaded] = useState(isMathLoadedPersisted);

  useEffect(() => {
    if (isMathLoaded) return;
    MathOps.init().then(
      () => {
        isMathLoadedPersisted = true;
        setIsMathLoaded(true);
      },
      (err) => {
        console.error('Failed to load math ops', err);
      }
    );
  }, []);

  return isMathLoaded ? children : null;
};
