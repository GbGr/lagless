import {
  SyncTestRunner,
  SyncTestSystems,
  SyncTestSignals,
  CollectSignal,
  DivergenceSignal,
  MoveInput,
  PlayerJoined,
  ReportHash,
  SyncTestArena,
} from '@lagless/sync-test-simulation';
import { createContext, FC, ReactNode, useContext, useEffect, useState } from 'react';
import { useTick } from '@pixi/react';
import { useNavigate } from 'react-router-dom';
import { ProviderStore } from '../hooks/use-start-match';
import { LocalInputProvider } from '@lagless/core';
import { RPC } from '@lagless/core';
import { createHashReporter } from '@lagless/core';
import { RelayInputProvider, RelayConnection } from '@lagless/relay-client';
import { getMatchInfo } from '../hooks/use-start-multiplayer-match';
import { UUID } from '@lagless/misc';

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const RunnerContext = createContext<SyncTestRunner>(null!);

export const useRunner = () => {
  return useContext(RunnerContext);
};

interface RunnerProviderProps {
  children: ReactNode;
}

const SQRT2_INV = 1 / Math.sqrt(2);

export const RunnerProvider: FC<RunnerProviderProps> = ({ children }) => {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const [runner, setRunner] = useState<SyncTestRunner>(null!);
  const [v, setV] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    return ProviderStore.onProvider(() => {
      setV((v) => v + 1);
    });
  }, []);

  useEffect(() => {
    let disposed = false;
    let _runner: SyncTestRunner;
    let _connection: RelayConnection | undefined;
    const inputProvider = ProviderStore.getInvalidate();

    if (!inputProvider) {
      navigate('/');
      return;
    }

    // Keyboard state
    const keys = new Set<string>();
    const onKeyDown = (e: KeyboardEvent) => keys.add(e.key.toLowerCase());
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    (async () => {
      if (disposed) {
        inputProvider.dispose();
        return;
      }

      _runner = new SyncTestRunner(
        inputProvider.ecsConfig,
        inputProvider,
        SyncTestSystems,
        SyncTestSignals,
      );

      // Set up keyboard input drainer with hash reporting
      const reportHash = createHashReporter(_runner, {
        reportInterval: SyncTestArena.hashReportInterval,
        reportHashRpc: ReportHash,
      });

      inputProvider.drainInputs((addRPC) => {
        // Movement input
        let dx = 0;
        let dy = 0;
        if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
        if (keys.has('d') || keys.has('arrowright')) dx += 1;
        if (keys.has('w') || keys.has('arrowup')) dy -= 1;
        if (keys.has('s') || keys.has('arrowdown')) dy += 1;

        if (dx !== 0 || dy !== 0) {
          // Normalize diagonal
          if (dx !== 0 && dy !== 0) {
            dx *= SQRT2_INV;
            dy *= SQRT2_INV;
          }
          addRPC(MoveInput, { directionX: dx, directionY: dy });
        }

        // Hash reporting
        reportHash(addRPC);
      });

      // If multiplayer, connect to relay server
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
              onServerHello: (data) => {
                inputProvider.handleServerHello(data);
                console.log('[Relay] ServerHello received, synced to tick', data.serverTick);
              },
              onTickInputFanout: (data) => {
                inputProvider.handleTickInputFanout(data);
              },
              onCancelInput: (data) => {
                inputProvider.handleCancelInput(data);
              },
              onPong: (data) => {
                inputProvider.handlePong(data);
              },
              onStateRequest: (requestId) => {
                inputProvider.handleStateRequest(requestId);
              },
              onStateResponse: (data) => {
                inputProvider.handleStateResponse(data);
                console.log('[Relay] StateResponse received, state transfer at tick', data.tick);
              },
              onConnected: () => {
                console.log('[Relay] Connected to relay server');
              },
              onDisconnected: () => {
                console.log('[Relay] Disconnected from relay server');
              },
            },
          );

          inputProvider.setConnection(_connection);
          _connection.connect();
        }
      }

      _runner.start();

      // For local play, inject PlayerJoined RPC manually
      if (inputProvider instanceof LocalInputProvider) {
        const playerId = UUID.generate().asUint8();
        const joinRpc = new RPC(PlayerJoined.id, {
          tick: 1,
          seq: 0,
          ordinal: 0,
          playerSlot: 255, // SERVER_SLOT
        }, {
          slot: 0,
          playerId,
        });
        inputProvider.addRemoteRpc(joinRpc);
      }

      // Subscribe to signals
      const collectSignal = _runner.DIContainer.resolve(CollectSignal);
      collectSignal.Predicted.subscribe((e) => {
        console.log(`[Collect] Player ${e.data.playerSlot} collected coin at (${e.data.x.toFixed(0)}, ${e.data.y.toFixed(0)}) +${e.data.value}`);
      });

      const divergenceSignal = _runner.DIContainer.resolve(DivergenceSignal);
      divergenceSignal.Predicted.subscribe((e) => {
        console.warn(`[DIVERGENCE] Players ${e.data.slotA} vs ${e.data.slotB}: hash ${e.data.hashA} != ${e.data.hashB} at tick ${e.data.atTick}`);
      });

      setRunner(_runner);
    })();

    return () => {
      disposed = true;
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
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
