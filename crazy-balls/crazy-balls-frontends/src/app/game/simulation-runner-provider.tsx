import { createContext, FC, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { CrazyBallsRunner } from '@lagless/crazy-balls-simulation';
import { Physics2dConfig } from '@lagless/physics2d';

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
export const SimulationRunnerContext = createContext<{ runner: CrazyBallsRunner }>(null!);

export const useSimulationRunner = () => {
  return useContext(SimulationRunnerContext);
}

const useMemTestRunner = () => {
  const [ runner, setRunner ] = useState<CrazyBallsRunner | null>(null);

  useEffect(() => {
    const intervalId = setInterval(() => {
      const config = new Physics2dConfig({
        fps: 30,
        seed: Math.random() * Number.MAX_SAFE_INTEGER,
        gravity: { x: 0, y: -9.81 },
        snapshotHistorySize: 0
      });
      const runner = new CrazyBallsRunner(config);
      setRunner(runner);
      for (let i = 0; i < Math.floor(2500 / 30); i++) {
        runner.update(config.frameLength);
      }
    }, 500);

    return () => {
      clearInterval(intervalId);
      setRunner(null);
    }
  }, []);

  return runner;
};

export const SimulationRunnerProvider: FC<{ children: ReactNode }> = ({ children }) => {
  // const runner = useMemo(() => {
  //   const config = new Physics2dConfig({
  //     fps: 30,
  //     seed: Math.random() * Number.MAX_SAFE_INTEGER,
  //     gravity: { x: 0, y: -9.81 },
  //   });
  //   return new CrazyBallsRunner(config);
  // }, []);
  const runner = useMemTestRunner();

  if (!runner) {
    return null;
  }

  return (
    <SimulationRunnerContext.Provider value={{ runner }}>
      {children}
    </SimulationRunnerContext.Provider>
  );
};
