import {
  CircleSumoRunner,
  CircleSumoSignals,
  CircleSumoSystems,
  GameOverSignal,
  PlayerFinishedGameSignal,
} from '@lagless/circle-sumo-simulation';
import { ECSConfig } from '@lagless/core';
import { createContext, FC, ReactNode, useContext, useEffect, useState } from 'react';
import { useTick } from '@pixi/react';
import { useNavigate } from 'react-router-dom';
import { ProviderStore } from '../hooks/use-start-match';
import { RelayInputProvider, RelayConnection } from '@lagless/relay-client';
import { getMatchInfo } from '../hooks/use-start-multiplayer-match';

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
  const [v, setV] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    return ProviderStore.onProvider(() => {
      setV((v) => v + 1);
    });
  }, []);

  useEffect(() => {
    let disposed = false;
    let _runner: CircleSumoRunner;
    let _connection: RelayConnection | undefined;
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

      // If this is a multiplayer match, connect and await ServerHello
      // before creating the runner so the simulation starts with the correct PRNG seed.
      if (inputProvider instanceof RelayInputProvider) {
        const matchInfo = getMatchInfo(inputProvider);
        if (matchInfo) {
          _connection = new RelayConnection(
            {
              serverUrl: matchInfo.serverUrl,
              matchId: matchInfo.matchId,
              token: matchInfo.token,
            },
            {
              onServerHello: (data) => inputProvider.handleServerHello(data),
              onTickInputFanout: (data) => {
                inputProvider.handleTickInputFanout(data);
                console.log('[Relay] TickInputFanout received for tick', data.inputs[0].tick);
              },
              onCancelInput: (data) => inputProvider.handleCancelInput(data),
              onPong: (data) => inputProvider.handlePong(data),
              onStateRequest: (requestId) => inputProvider.handleStateRequest(requestId),
              onStateResponse: (data) => inputProvider.handleStateResponse(data),
              onConnected: () => console.log('[Relay] Connected to relay server'),
              onDisconnected: () => console.log('[Relay] Disconnected from relay server'),
            },
          );

          inputProvider.setConnection(_connection);
          _connection.connect();

          const serverHello = await inputProvider.serverHello;
          if (disposed) { inputProvider.dispose(); return; }
          console.log('[Relay] ServerHello received, serverTick =', serverHello.serverTick);

          const seededConfig = new ECSConfig({ ...inputProvider.ecsConfig, seed: serverHello.seed });
          _runner = new CircleSumoRunner(seededConfig, inputProvider, CircleSumoSystems, CircleSumoSignals);
          _runner.start();

          if (serverHello.serverTick > 0) {
            _runner.Simulation.clock.setAccumulatedTime(serverHello.serverTick * seededConfig.frameLength);
          }
        } else {
          // Relay provider without match info — should not happen
          _runner = new CircleSumoRunner(inputProvider.ecsConfig, inputProvider, CircleSumoSystems, CircleSumoSignals);
          _runner.start();
        }
      } else {
        // Local play — no seed needed, start immediately
        _runner = new CircleSumoRunner(inputProvider.ecsConfig, inputProvider, CircleSumoSystems, CircleSumoSignals);
        _runner.start();
      }

      // Subscribe to signals
      const playerFinishedSignal = _runner.DIContainer.resolve(PlayerFinishedGameSignal);
      playerFinishedSignal.Predicted.subscribe(() => {
        // In multiplayer, could send PlayerFinished to server
        // if (inputProvider instanceof RelayInputProvider && _connection) {
        //   _connection.sendPlayerFinished({ tick, playerSlot, payload });
        // }
      });

      const gameOverSignal = _runner.DIContainer.resolve(GameOverSignal);
      gameOverSignal.Cancelled.subscribe((e) => console.log(`Cancelled Game Over at tick ${e.tick}`));
      gameOverSignal.Verified.subscribe((e) => console.log(`Verified Game Over at tick ${e.tick}`));
      gameOverSignal.Predicted.subscribe((e) => console.log(`Predicted Game Over at tick ${e.tick}`));
      gameOverSignal.Verified.subscribe(() => {
        inputProvider.dispose();
        _connection?.disconnect();
      });

      setRunner(_runner);
    })();

    return () => {
      disposed = true;
      _connection?.disconnect();
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
