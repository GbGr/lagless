import {
  CircleSumoRunner,
  CircleSumoSignals,
  CircleSumoSystems,
  GameOverSignal,
  PlayerFinishedGameSignal,
} from '@lagless/circle-sumo-simulation';
import { createContext, FC, ReactNode, useContext, useEffect, useState } from 'react';
import { useTick } from '@pixi/react';
import { RelayInputProvider, RelayInputProviderV2 } from '@lagless/relay-input-provider';
import { useNavigate } from 'react-router-dom';
import { ProviderStore } from '../hooks/use-start-match';

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
  const [ v, setV ] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    return ProviderStore.onProvider(() => {
      setV((v) => v + 1);
    });
  }, []);

  useEffect(() => {
    let disposed = false;
    let _runner: CircleSumoRunner;
    const inputProvider = ProviderStore.getInvalidate();

    if (!inputProvider) {
      navigate('/');
      return;
    }

    (async () => {
      if (disposed) {
        inputProvider.dispose();
        return;
      }

      _runner = new CircleSumoRunner(inputProvider.ecsConfig, inputProvider, CircleSumoSystems, CircleSumoSignals);

      _runner.start();

      if (inputProvider instanceof RelayInputProviderV2) {
        await inputProvider.waitForReady();
        if (disposed) {
          inputProvider.dispose();
          return;
        }
      }

      const _PlayerFinishedGameSignal = _runner.DIContainer.resolve(PlayerFinishedGameSignal);
      _PlayerFinishedGameSignal.Predicted.subscribe(({ data }) => {
        if (inputProvider instanceof RelayInputProvider || inputProvider instanceof RelayInputProviderV2) {
          inputProvider.sendPlayerFinishedGame(data);
        }
      });

      const _GameOverSignal = _runner.DIContainer.resolve(GameOverSignal);
      _GameOverSignal.Cancelled.subscribe((e) => console.log(`Cancelled Game Over at tick ${e.tick}`));
      _GameOverSignal.Verified.subscribe((e) => console.log(`Verified Game Over at tick ${e.tick}`));
      _GameOverSignal.Predicted.subscribe((e) => console.log(`Predicted Game Over at tick ${e.tick}`));
      _GameOverSignal.Verified.subscribe((data) => {
        console.log(`Game over signal received at tick ${data.tick}`);
        inputProvider.dispose();
      });

      // for (let i = 0; i < ecsConfig.maxPlayers; i++) {
      //   const uuid = UUID.generateMasked();
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
  }, [v, navigate]);

  return !runner ? null : <RunnerContext.Provider value={runner}>{children}</RunnerContext.Provider>;
};

export const RunnerTicker: FC<{ children: ReactNode }> = ({ children }) => {
  const runner = useRunner();
  useTick((ticker) => {
    runner.update(ticker.deltaMS);
  });

  return children;
};
