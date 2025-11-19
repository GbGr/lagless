import {
  CircleSumoInputRegistry,
  CircleSumoRunner,
  CircleSumoSignals,
  CircleSumoSystems,
  GameOverSignal,
  PlayerFinishedGameSignal,
} from '@lagless/circle-sumo-simulation';
import { ECSConfig } from '@lagless/core';
import { createContext, FC, ReactNode, useContext, useEffect, useState } from 'react';
import { useTick } from '@pixi/react';
import { MathOps } from '@lagless/math';
import { Matchmaking, RelayInputProvider } from '@lagless/relay-input-provider';
import { AuthTokenStore } from '@lagless/react';

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const RunnerContext = createContext<CircleSumoRunner>(null!);

export const useRunner = () => {
  return useContext(RunnerContext);
};

interface RunnerProviderProps {
  children: ReactNode;
}

export const RunnerProvider: FC<RunnerProviderProps> = ({ children }) => {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const [runner, setRunner] = useState<CircleSumoRunner>(null!);

  useEffect(() => {
    let disposed = false;
    let _runner: CircleSumoRunner;
    const token = AuthTokenStore.get();

    if (!token) throw new Error('No auth token found');

    (async () => {
      await MathOps.init();
      const ecsConfig = new ECSConfig({ fps: 60 });
      // const inputProvider = new LocalInputProvider(ecsConfig, CircleSumoInputRegistry);
      const matchmaking = new Matchmaking();
      const { client, seatReservation } = await matchmaking.connectAndFindMatch(
        import.meta.env.VITE_RELAY_URL,
        ecsConfig,
        token
      );
      const inputProvider = await RelayInputProvider.connect(
        ecsConfig,
        CircleSumoInputRegistry,
        client,
        seatReservation
      );
      if (disposed) {
        inputProvider.dispose();
        return;
      }

      _runner = new CircleSumoRunner(inputProvider.ecsConfig, inputProvider, CircleSumoSystems, CircleSumoSignals);

      _runner.start();

      const _PlayerFinishedGameSignal = _runner.DIContainer.resolve(PlayerFinishedGameSignal);
      _PlayerFinishedGameSignal.addListener((data) => {
        inputProvider.sendPlayerFinishedGame(data);
      });

      const _GameOverSignal = _runner.DIContainer.resolve(GameOverSignal);
      _GameOverSignal.addListener((data) => {
        console.log(`Game over signal received at tick ${data.tick}`);
        inputProvider.dispose();
      });

      // for (let i = 0; i < ecsConfig.maxPlayers; i++) {
      //   const uuid = UUID.generate();
      //
      //   console.log(`Player joined: ${uuid.asString()}`);
      //   inputProvider['playerSlot'] = i;
      //   inputProvider['addRpc'](PlayerJoined, { playerId: uuid.asUint8() });
      // }

      setRunner(_runner);
    })();

    return () => {
      disposed = true;
      _runner?.dispose();
    };
  }, []);

  return !runner ? null : <RunnerContext.Provider value={runner}>{children}</RunnerContext.Provider>;
};

export const RunnerTicker: FC<{ children: ReactNode }> = ({ children }) => {
  const runner = useRunner();
  useTick((ticker) => {
    runner.update(ticker.deltaMS);
  });

  return children;
};

// function createFinishGameDrainer(DIContainer: Container): (tick: number) => void {
//   const _ECSConfig = DIContainer.resolve(ECSConfig);
//   const _PlayerResources = DIContainer.resolve(PlayerResources);
//   const _GameState = DIContainer.resolve(GameState);
//   const playerResources = Array.from(
//     { length: _ECSConfig.maxPlayers },
//     (_, i) => _PlayerResources.get(PlayerResource, i)
//   );
//   const tickShift = _ECSConfig.maxInputDelayTick;
//   return (tick) => {
//     const adjustedTick = tick - tickShift;
//     if (adjustedTick < 0) return;
//     for (const playerResource of playerResources) {
//       if (playerResource.safe.finishedAtTick === tick) {
//         console.log(`Draining player finished game at tick ${tick}`);
//       }
//     }
//
//     if (_GameState.safe.finishedAtTick === tick) {
//       console.log(`Draining game finished at tick ${tick}`);
//     }
//   };
// }
