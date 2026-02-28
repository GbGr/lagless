import {
  RobloxLikeRunner,
  RobloxLikeSystems,
  RobloxLikeSignals,
  CharacterMove,
  PlayerJoined,
  ReportHash,
  ROBLOX_LIKE_CONFIG,
  CHARACTER_CONFIG,
  createRobloxLikeCollisionLayers,
  PhysicsRefs,
  PhysicsRefsFilter,
  CharacterFilter,
} from '@lagless/roblox-like-simulation';
import { CharacterControllerManager } from '@lagless/character-controller-3d';
import { createContext, FC, ReactNode, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProviderStore } from '../hooks/use-start-match';
import { ECSConfig, LocalInputProvider, ReplayInputProvider, RPC, createHashReporter, DivergenceSignal, SignalEvent, DivergenceData } from '@lagless/core';
import { RelayInputProvider, RelayConnection } from '@lagless/relay-client';
import { useDevBridge } from '@lagless/react';
import { getMatchInfo } from '../hooks/use-start-multiplayer-match';
import { UUID } from '@lagless/misc';
import { PhysicsWorldManager3d, type RapierModule3d } from '@lagless/physics3d';

interface RunnerContextValue {
  runner: RobloxLikeRunner;
  kccManager: CharacterControllerManager;
  worldManager: PhysicsWorldManager3d;
}

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const RunnerContext = createContext<RunnerContextValue>(null!);

export const useRunnerContext = () => useContext(RunnerContext);

interface RunnerProviderProps {
  children: ReactNode;
  cameraYawRef: React.RefObject<number>;
}

const SQRT2_INV = 1 / Math.sqrt(2);

export const RunnerProvider: FC<RunnerProviderProps> = ({ children, cameraYawRef }) => {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const [ctx, setCtx] = useState<RunnerContextValue>(null!);
  const [v, setV] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    return ProviderStore.onProvider(() => {
      setV((v) => v + 1);
    });
  }, []);

  useEffect(() => {
    let disposed = false;
    let _runner: RobloxLikeRunner;
    let _connection: RelayConnection | undefined;
    const inputProvider = ProviderStore.getInvalidate();

    if (!inputProvider) {
      navigate('/');
      return;
    }

    // Keyboard state
    const keys = new Set<string>();
    const onKeyDown = (e: KeyboardEvent) => keys.add(e.code);
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    (async () => {
      if (disposed) {
        inputProvider.dispose();
        return;
      }

      // Load Rapier WASM
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const RAPIER = (await import('@dimforge/rapier3d-compat')).default as any;
      await RAPIER.init();
      const rapier = RAPIER as unknown as RapierModule3d;
      if (disposed) { inputProvider.dispose(); return; }

      // Handle multiplayer ServerHello
      let seededConfig: ECSConfig;
      if (inputProvider instanceof RelayInputProvider) {
        const matchInfo = getMatchInfo(inputProvider);
        if (matchInfo) {
          _connection = new RelayConnection(
            { serverUrl: matchInfo.serverUrl, matchId: matchInfo.matchId, token: matchInfo.token },
            {
              onServerHello: (data) => inputProvider.handleServerHello(data),
              onTickInputFanout: (data) => inputProvider.handleTickInputFanout(data),
              onCancelInput: (data) => inputProvider.handleCancelInput(data),
              onPong: (data) => inputProvider.handlePong(data),
              onStateRequest: (requestId) => inputProvider.handleStateRequest(requestId),
              onStateResponse: (data) => inputProvider.handleStateResponse(data),
              onConnected: () => console.log('[Relay] Connected'),
              onDisconnected: () => console.log('[Relay] Disconnected'),
            },
          );
          inputProvider.setConnection(_connection);
          _connection.connect();

          const serverHello = await inputProvider.serverHello;
          if (disposed) { inputProvider.dispose(); return; }
          seededConfig = new ECSConfig({ ...inputProvider.ecsConfig, seed: serverHello.seed });
        } else {
          seededConfig = inputProvider.ecsConfig;
        }
      } else {
        seededConfig = inputProvider.ecsConfig;
      }

      // Create CharacterControllerManager with a lazy worldManager ref.
      // PhysicsRunner3d creates the worldManager internally, but we need
      // KCCManager registered in DI before systems are resolved.
      // We use a deferred init: create KCCManager now, it will get the worldManager after runner init.
      const kccManager = new CharacterControllerManager(CHARACTER_CONFIG);

      // Create collision layers
      const collisionLayers = createRobloxLikeCollisionLayers();

      // Create runner with KCCManager as extra DI registration
      _runner = new RobloxLikeRunner(
        seededConfig, inputProvider, RobloxLikeSystems, RobloxLikeSignals, rapier,
        undefined, collisionLayers,
        [[CharacterControllerManager, kccManager]],
      );

      // Now that runner exists, init KCCManager with the actual world manager
      kccManager.init(_runner.PhysicsWorldManager);

      // Hook into rollback and state transfer for KCC + physics reconstruction
      const sim = _runner.Simulation;
      const worldManager = _runner.PhysicsWorldManager;

      sim.addRollbackHandler(() => {
        kccManager.recreateAll();
      });

      sim.addStateTransferHandler(() => {
        // Rebuild ColliderEntityMap from ECS PhysicsRefs after state transfer
        worldManager.colliderEntityMap.clear();
        const physicsFilter = _runner.DIContainer.resolve(PhysicsRefsFilter);
        const refs = _runner.DIContainer.resolve(PhysicsRefs);
        const refsUnsafe = refs.unsafe;
        for (const e of physicsFilter) {
          worldManager.registerCollider(refsUnsafe.colliderHandle[e], e);
        }

        // Recreate KCCs for ALL character entities from the transferred state.
        // Cannot use recreateAll() because _controllers may be empty
        // (pre-transfer simulation might not have received PlayerJoined events).
        const charFilter = _runner.DIContainer.resolve(CharacterFilter);
        kccManager.recreateFromEntities(charFilter);
      });

      // Enable hash tracking for verified-tick-based hash reporting
      _runner.Simulation.enableHashTracking(ROBLOX_LIKE_CONFIG.hashReportInterval);

      // Set up input drainer
      if (!(inputProvider instanceof ReplayInputProvider)) {
        const reportHash = createHashReporter(_runner, {
          reportInterval: ROBLOX_LIKE_CONFIG.hashReportInterval,
          reportHashRpc: ReportHash,
        });

        inputProvider.drainInputs((addRPC) => {
          let dx = 0;
          let dz = 0;
          if (keys.has('KeyA')) dx -= 1;
          if (keys.has('KeyD')) dx += 1;
          if (keys.has('KeyW')) dz += 1;
          if (keys.has('KeyS')) dz -= 1;

          // Normalize diagonal
          if (dx !== 0 && dz !== 0) {
            dx *= SQRT2_INV;
            dz *= SQRT2_INV;
          }

          const jump = keys.has('Space') ? 1 : 0;
          const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 1 : 0;
          const cameraYaw = cameraYawRef.current ?? 0;

          addRPC(CharacterMove, {
            directionX: dx,
            directionZ: dz,
            cameraYaw,
            jump,
            sprint,
          });

          reportHash(addRPC);
        });
      }

      // Start runner
      _runner.start();

      if (inputProvider instanceof RelayInputProvider) {
        const serverHello = await inputProvider.serverHello;
        if (serverHello.serverTick > 0) {
          _runner.Simulation.clock.setAccumulatedTime(serverHello.serverTick * _runner.Config.frameLength);
        }
      }

      // For local play, inject PlayerJoined
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

      // Subscribe to divergence signal
      const divergenceSignal = _runner.DIContainer.resolve(DivergenceSignal);
      divergenceSignal.Predicted.subscribe((e: SignalEvent<DivergenceData>) => {
        console.warn(`[DIVERGENCE] Players ${e.data.slotA} vs ${e.data.slotB} at tick ${e.data.atTick}`);
      });

      setCtx({ runner: _runner, kccManager, worldManager: _runner.PhysicsWorldManager });
    })();

    return () => {
      disposed = true;
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      _connection?.disconnect();
      _runner?.dispose();
    };
  }, [v, navigate, cameraYawRef]);

  useDevBridge(ctx?.runner ?? null, { hashTrackingInterval: ROBLOX_LIKE_CONFIG.hashReportInterval });

  return !ctx ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>Loading...</div>
    : <RunnerContext.Provider value={ctx}>{children}</RunnerContext.Provider>;
};
