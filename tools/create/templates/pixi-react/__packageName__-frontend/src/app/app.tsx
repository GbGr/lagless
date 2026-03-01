import { FC, ReactNode, useEffect, useState } from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { MathOps } from '@lagless/math';

let mathInitPersisted = false;

const MathLoader: FC<{ children: ReactNode }> = ({ children }) => {
  const [ready, setReady] = useState(mathInitPersisted);

  useEffect(() => {
    if (ready) return;
    MathOps.init().then(() => {
      mathInitPersisted = true;
      setReady(true);
    }, (err) => console.error('Failed to init MathOps', err));
  }, []);

  return ready ? children : null;
};

export const App: FC = () => {
  return <MathLoader><RouterProvider router={router} /></MathLoader>;
};
