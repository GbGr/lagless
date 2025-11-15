import {
  CircleRaceSimulationInputRegistry,
  CircleRaceSimulationRunner,
  CircleRaceSimulationSystems,
} from '@lagless/circle-race-simulation';
import { ECSConfig } from '@lagless/core';
import { createContext, FC, ReactNode, useContext, useEffect, useState } from 'react';
import { useTick } from '@pixi/react';
import { MathOps } from '@lagless/math';
import { Matchmaking, RelayInputProvider } from '@lagless/relay-input-provider';
import { AuthTokenStore } from '@lagless/react';

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const RunnerContext = createContext<CircleRaceSimulationRunner>(null!);

export const useRunner = () => {
  return useContext(RunnerContext);
};

interface RunnerProviderProps {
  children: ReactNode;
}

export const RunnerProvider: FC<RunnerProviderProps> = ({ children }) => {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const [runner, setRunner] = useState<CircleRaceSimulationRunner>(null!);

  useEffect(() => {
    let disposed = false;
    let _runner: CircleRaceSimulationRunner;
    const token = AuthTokenStore.get();

    if (!token) throw new Error('No auth token found');

    (async () => {
      await MathOps.init();
      const ecsConfig = new ECSConfig({ fps: 60 });
      // const inputProvider = new LocalInputProvider(ecsConfig, CircleRaceSimulationInputRegistry);
      const matchmaking = new Matchmaking();
      const { client, seatReservation } = await matchmaking.connectAndFindMatch(import.meta.env.VITE_RELAY_URL, ecsConfig, token);
      const inputProvider = await RelayInputProvider.connect(ecsConfig, CircleRaceSimulationInputRegistry, client, seatReservation);
      if (disposed) {
        inputProvider.dispose();
        return;
      }

      _runner = new CircleRaceSimulationRunner(inputProvider.ecsConfig, inputProvider, CircleRaceSimulationSystems);

      _runner.start();

      // const uuid = UUID.generate();

      // console.log(`Player joined: ${uuid.asString()}`);
      // inputProvider['addRpc'](PlayerJoined, { playerId: uuid.asUint8() });

      setRunner(_runner);
    })();

    return () => {
      disposed = true;
      _runner?.dispose();
    };
  }, []);

  return !runner ? null : (
    <RunnerContext.Provider value={runner}>
      {children}
    </RunnerContext.Provider>
  );
};

export const RunnerTicker: FC<{ children: ReactNode }> = ({ children }) => {
  const runner = useRunner();
  useTick((ticker) => {
    runner.update(ticker.deltaMS);
  });

  return children;
}
