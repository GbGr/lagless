import { FC, ReactNode, useEffect, useState } from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { MathOps } from '@lagless/math';

let globalMathInitialized = false;

export const App: FC = () => {
  return (
    <LoaderProvider>
      <RouterProvider router={router} />
    </LoaderProvider>
  );
};

const LoaderProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [mathInitialized, setMathInitialized] = useState(globalMathInitialized);

  useEffect(() => {
    if (globalMathInitialized) {
      setMathInitialized(true);
      return;
    }
    MathOps.init().then(() => {
      globalMathInitialized = true;
      setMathInitialized(true);
    });
  }, []);

  return mathInitialized ? children : null;
};
