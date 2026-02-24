import {
  GravityPongRunner,
  GravityPongSystems,
  GravityPongSignals,
  GoalSignal,
  BallAbsorbedSignal,
  MatchOverSignal,
  DivergenceSignal,
  Shoot,
  PlayerJoined,
  ReportHash,
  GravityPongArena,
} from '@lagless/gravity-pong-simulation';
import { createContext, FC, ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { useTick } from '@pixi/react';
import { useNavigate } from 'react-router-dom';
import { ProviderStore } from '../hooks/use-start-match';
import { ECSConfig, LocalInputProvider, ReplayInputProvider, RPC, createHashReporter } from '@lagless/core';
import { RelayInputProvider, RelayConnection } from '@lagless/relay-client';
import { getMatchInfo } from '../hooks/use-start-multiplayer-match';
import { UUID } from '@lagless/misc';

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const RunnerContext = createContext<GravityPongRunner>(null!);

export const useRunner = () => {
  return useContext(RunnerContext);
};

interface RunnerProviderProps {
  children: ReactNode;
}

export interface ShootInput {
  angle: number;
  power: number;
}

// Shared mutable ref for slingshot input from aim-view
export const pendingShootRef = { current: null as ShootInput | null };

export const RunnerProvider: FC<RunnerProviderProps> = ({ children }) => {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const [runner, setRunner] = useState<GravityPongRunner>(null!);
  const [v, setV] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    return ProviderStore.onProvider(() => {
      setV((v) => v + 1);
    });
  }, []);

  useEffect(() => {
    let disposed = false;
    let _runner: GravityPongRunner;
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
              onTickInputFanout: (data) => inputProvider.handleTickInputFanout(data),
              onCancelInput: (data) => inputProvider.handleCancelInput(data),
              onPong: (data) => inputProvider.handlePong(data),
              onStateRequest: (requestId) => inputProvider.handleStateRequest(requestId),
              onStateResponse: (data) => {
                inputProvider.handleStateResponse(data);
                console.log('[Relay] StateResponse received, state transfer at tick', data.tick);
              },
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
          _runner = new GravityPongRunner(seededConfig, inputProvider, GravityPongSystems, GravityPongSignals);
        } else {
          _runner = new GravityPongRunner(inputProvider.ecsConfig, inputProvider, GravityPongSystems, GravityPongSignals);
        }
      } else if (inputProvider instanceof ReplayInputProvider) {
        _runner = new GravityPongRunner(inputProvider.ecsConfig, inputProvider, GravityPongSystems, GravityPongSignals);
      } else {
        _runner = new GravityPongRunner(inputProvider.ecsConfig, inputProvider, GravityPongSystems, GravityPongSignals);
      }

      // Set up input drainer (skip for replay)
      if (!(inputProvider instanceof ReplayInputProvider)) {
        const reportHash = createHashReporter(_runner, {
          reportInterval: GravityPongArena.hashReportInterval,
          reportHashRpc: ReportHash,
        });

        inputProvider.drainInputs((addRPC) => {
          // Check for pending shoot input
          const shoot = pendingShootRef.current;
          if (shoot) {
            pendingShootRef.current = null;
            addRPC(Shoot, { angle: shoot.angle, power: shoot.power });
          }

          reportHash(addRPC);
        });
      }

      _runner.start();

      if (inputProvider instanceof RelayInputProvider) {
        const serverHello = await inputProvider.serverHello;
        if (serverHello.serverTick > 0) {
          _runner.Simulation.clock.setAccumulatedTime(serverHello.serverTick * _runner.Config.frameLength);
        }
      }

      // For local play, inject only P0 (P1 stays disconnected so game starts immediately on P0's shot)
      if (inputProvider instanceof LocalInputProvider) {
        const playerId0 = UUID.generate().asUint8();
        inputProvider.addRemoteRpc(new RPC(PlayerJoined.id, {
          tick: 1, seq: 0, ordinal: 0, playerSlot: 255,
        }, { slot: 0, playerId: playerId0 }));
      }

      // Subscribe to signals
      const goalSignal = _runner.DIContainer.resolve(GoalSignal);
      goalSignal.Predicted.subscribe((e) => {
        console.log(`[Goal] P${e.data.scorerSlot} scored!`);
      });

      const absorbSignal = _runner.DIContainer.resolve(BallAbsorbedSignal);
      absorbSignal.Predicted.subscribe((e) => {
        console.log(`[BlackHole] P${e.data.ownerSlot}'s ball absorbed`);
      });

      const matchOverSignal = _runner.DIContainer.resolve(MatchOverSignal);
      matchOverSignal.Predicted.subscribe((e) => {
        console.log(`[MatchOver] P${e.data.winnerSlot} wins! ${e.data.scoreP0}-${e.data.scoreP1}`);
      });

      const divergenceSignal = _runner.DIContainer.resolve(DivergenceSignal);
      divergenceSignal.Predicted.subscribe((e) => {
        console.warn(`[DIVERGENCE] Players ${e.data.slotA} vs ${e.data.slotB}: hash ${e.data.hashA} != ${e.data.hashB} at tick ${e.data.atTick}`);
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
