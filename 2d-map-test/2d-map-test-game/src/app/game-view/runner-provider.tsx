import {
  MapTestRunnerWithMap,
  MoveInput,
  PlayerJoined,
  MapTestArena,
  PlayerFilter,
  PhysicsRefs,
} from '@lagless/2d-map-test-simulation';
import { createContext, FC, ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useTick } from '@pixi/react';
import { useNavigate } from 'react-router-dom';
import { ProviderStore } from '../hooks/use-start-match';
import { ECSConfig, LocalInputProvider, RPC, createHashReporter } from '@lagless/core';
import { RelayInputProvider, RelayConnection } from '@lagless/relay-client';
import { useDevBridge, useDiagnosticsControl } from '@lagless/react';
import { useDesyncDiagnostics } from '@lagless/desync-diagnostics';
import { getMatchInfo } from '../hooks/use-start-multiplayer-match';
import { UUID } from '@lagless/misc';
import { getFastHash } from '@lagless/binary';
import { PhysicsConfig2d, type RapierModule2d } from '@lagless/physics2d';
import RAPIER from '@lagless/rapier2d-deterministic-compat';

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const RunnerContext = createContext<MapTestRunnerWithMap>(null!);

export const useRunner = () => {
  return useContext(RunnerContext);
};

interface RunnerProviderProps {
  children: ReactNode;
}

const SQRT2_INV = 1 / Math.sqrt(2);

export const RunnerProvider: FC<RunnerProviderProps> = ({ children }) => {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const [runner, setRunner] = useState<MapTestRunnerWithMap>(null!);
  const [v, setV] = useState(0);
  const navigate = useNavigate();
  const diagnosticsEnabled = useDiagnosticsControl();
  const hashReporterRef = useRef<ReturnType<typeof createHashReporter> | null>(null);
  const connectionRef = useRef<RelayConnection | null>(null);

  useEffect(() => {
    return ProviderStore.onProvider(() => {
      setV((v) => v + 1);
    });
  }, []);

  useEffect(() => {
    let disposed = false;
    let _runner: MapTestRunnerWithMap;
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

      await RAPIER.init();
      const rapier = RAPIER as unknown as RapierModule2d;
      if (disposed) {
        inputProvider.dispose();
        return;
      }

      const physicsConfig = new PhysicsConfig2d({ gravityX: 0, gravityY: 0 });

      // Resolve ECS config (with seed from server in multiplayer)
      let ecsConfig: ECSConfig;
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
              onHashMismatch: (data) => hashReporterRef.current?.reportMismatch(data),
              onConnected: () => console.log('[Relay] Connected to relay server'),
              onDisconnected: () => console.log('[Relay] Disconnected from relay server'),
            }
          );

          connectionRef.current = _connection;
          inputProvider.setConnection(_connection);
          _connection.connect();

          const serverHello = await inputProvider.serverHello;
          if (disposed) {
            inputProvider.dispose();
            return;
          }
          console.log('[Relay] ServerHello received, serverTick =', serverHello.serverTick);

          ecsConfig = new ECSConfig({ ...inputProvider.ecsConfig, seed: serverHello.seed });
        } else {
          ecsConfig = inputProvider.ecsConfig;
        }
      } else {
        ecsConfig = inputProvider.ecsConfig;
      }

      _runner = new MapTestRunnerWithMap(ecsConfig, inputProvider, rapier, physicsConfig);

      inputProvider.drainInputs((addRPC) => {
        let dx = 0;
        let dy = 0;
        if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
        if (keys.has('d') || keys.has('arrowright')) dx += 1;
        if (keys.has('w') || keys.has('arrowup')) dy -= 1;
        if (keys.has('s') || keys.has('arrowdown')) dy += 1;

        if (dx !== 0 || dy !== 0) {
          if (dx !== 0 && dy !== 0) {
            dx *= SQRT2_INV;
            dy *= SQRT2_INV;
          }
          addRPC(MoveInput, { directionX: dx, directionY: dy });
        }
      });

      _runner.start();

      if (inputProvider instanceof RelayInputProvider) {
        const serverHello = await inputProvider.serverHello;
        if (serverHello.serverTick > 0) {
          _runner.Simulation.clock.setAccumulatedTime(serverHello.serverTick * _runner.Config.frameLength);
        }
      }

      if (inputProvider instanceof LocalInputProvider) {
        const playerId = UUID.generate().asUint8();
        const joinRpc = new RPC(
          PlayerJoined.id,
          {
            tick: 1,
            seq: 0,
            ordinal: 0,
            playerSlot: 255,
          },
          {
            slot: 0,
            playerId,
          }
        );
        inputProvider.addRemoteRpc(joinRpc);
      }

      setRunner(_runner);
    })();

    return () => {
      disposed = true;
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      connectionRef.current = null;
      _connection?.disconnect();
      _runner?.dispose();
    };
  }, [v, navigate]);

  // Diagnostics lifecycle: enable/disable hash tracking and hash reporter based on toggle
  useEffect(() => {
    if (!runner || !diagnosticsEnabled) {
      runner?.Simulation.disableHashTracking();
      hashReporterRef.current?.dispose();
      hashReporterRef.current = null;
      return;
    }
    runner.Simulation.enableHashTracking(MapTestArena.hashReportInterval);
    const reporter = createHashReporter(runner, {
      reportInterval: MapTestArena.hashReportInterval,
      send: (data) => connectionRef.current?.sendHashReport(data),
    });
    reporter.subscribeDivergence((data) => {
      console.warn(`[DIVERGENCE] Players ${data.slotA} vs ${data.slotB}: hash ${data.hashA} != ${data.hashB} at tick ${data.atTick}`);
    });
    hashReporterRef.current = reporter;
    return () => {
      reporter.dispose();
      hashReporterRef.current = null;
    };
  }, [runner, diagnosticsEnabled]);

  useDevBridge(runner, { hashTrackingInterval: MapTestArena.hashReportInterval, diagnosticsEnabled });

  const diagnosticsOptions = useMemo(() => {
    if (!runner) return undefined;
    const wm = runner.PhysicsWorldManager;
    const filter = runner.DIContainer.resolve(PlayerFilter);
    const physicsRefs = runner.DIContainer.resolve(PhysicsRefs);
    return {
      physicsHashFn: () => {
        const snap = wm.takeSnapshot();
        return getFastHash(snap.buffer);
      },
      velocityHashFn: () => {
        let hash = 0;
        for (const entity of filter) {
          const body = wm.getBody(physicsRefs.unsafe.bodyHandle[entity]);
          const vel = body.linvel();
          // Simple hash combining: FNV-like mix of float bits
          hash = (hash * 31 + (vel.x * 1e6) | 0) | 0;
          hash = (hash * 31 + (vel.y * 1e6) | 0) | 0;
          hash = (hash * 31 + (body.angvel() * 1e6) | 0) | 0;
        }
        return hash >>> 0;
      },
    };
  }, [runner]);

  useDesyncDiagnostics(runner, { ...diagnosticsOptions, enabled: diagnosticsEnabled });

  return !runner ? null : <RunnerContext.Provider value={runner}>{children}</RunnerContext.Provider>;
};

export const RunnerTicker: FC<{ children: ReactNode }> = ({ children }) => {
  const runner = useRunner();
  useTick((ticker) => {
    runner.update(ticker.deltaMS);
  });

  return children;
};
