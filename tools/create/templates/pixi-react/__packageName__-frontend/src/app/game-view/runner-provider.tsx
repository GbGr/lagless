import {
  <%= projectName %>Runner,
  <%= projectName %>Systems,
  <%= projectName %>Signals,
  DivergenceSignal,
  MoveInput,
  PlayerJoined,
  ReportHash,
  <%= projectName %>Arena,
<% if (simulationType !== 'raw') { -%>
  PhysicsRefs,
  PhysicsRefsFilter,
  PlayerFilter,
<% } -%>
} from '<%= packageName %>-simulation';
import { createContext, FC, ReactNode, useContext, useEffect, useState } from 'react';
import { useTick } from '@pixi/react';
import { useNavigate } from 'react-router-dom';
import { ProviderStore } from '../hooks/use-start-match';
import { ECSConfig, LocalInputProvider, RPC, createHashReporter } from '@lagless/core';
import { RelayInputProvider, RelayConnection } from '@lagless/relay-client';
import { getMatchInfo } from '../hooks/use-start-multiplayer-match';
import { UUID } from '@lagless/misc';
import { useDevBridge } from '@lagless/react';
<% if (simulationType === 'physics2d') { -%>
import { PhysicsWorldManager2d, type RapierModule2d } from '@lagless/physics2d';
<% } else if (simulationType === 'physics3d') { -%>
import { PhysicsWorldManager3d, type RapierModule3d } from '@lagless/physics3d';
<% } -%>

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const RunnerContext = createContext<<%= projectName %>Runner>(null!);

export const useRunner = () => {
  return useContext(RunnerContext);
};

interface RunnerProviderProps {
  children: ReactNode;
}

const SQRT2_INV = 1 / Math.sqrt(2);

export const RunnerProvider: FC<RunnerProviderProps> = ({ children }) => {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const [runner, setRunner] = useState<<%= projectName %>Runner>(null!);
  const [v, setV] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    return ProviderStore.onProvider(() => {
      setV((v) => v + 1);
    });
  }, []);

  useEffect(() => {
    let disposed = false;
    let _runner: <%= projectName %>Runner;
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

<% if (simulationType === 'physics2d') { -%>
      // Load Rapier 2D WASM
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const RAPIER = (await import('@dimforge/rapier2d-compat')).default as any;
      await RAPIER.init();
      const rapier = RAPIER as unknown as RapierModule2d;
      if (disposed) { inputProvider.dispose(); return; }

<% } else if (simulationType === 'physics3d') { -%>
      // Load Rapier 3D WASM
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const RAPIER = (await import('@dimforge/rapier3d-compat')).default as any;
      await RAPIER.init();
      const rapier = RAPIER as unknown as RapierModule3d;
      if (disposed) { inputProvider.dispose(); return; }

<% } -%>
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
              onStateResponse: (data) => inputProvider.handleStateResponse(data),
              onConnected: () => console.log('[Relay] Connected'),
              onDisconnected: () => console.log('[Relay] Disconnected'),
            },
          );

          inputProvider.setConnection(_connection);
          _connection.connect();

          const serverHello = await inputProvider.serverHello;
          if (disposed) { inputProvider.dispose(); return; }

          const seededConfig = new ECSConfig({ ...inputProvider.ecsConfig, seed: serverHello.seed });
<% if (simulationType === 'raw') { -%>
          _runner = new <%= projectName %>Runner(seededConfig, inputProvider, <%= projectName %>Systems, <%= projectName %>Signals);
<% } else { -%>
          _runner = new <%= projectName %>Runner(seededConfig, inputProvider, <%= projectName %>Systems, <%= projectName %>Signals, rapier);
<% } -%>
        } else {
<% if (simulationType === 'raw') { -%>
          _runner = new <%= projectName %>Runner(inputProvider.ecsConfig, inputProvider, <%= projectName %>Systems, <%= projectName %>Signals);
<% } else { -%>
          _runner = new <%= projectName %>Runner(inputProvider.ecsConfig, inputProvider, <%= projectName %>Systems, <%= projectName %>Signals, rapier);
<% } -%>
        }
      } else {
<% if (simulationType === 'raw') { -%>
        _runner = new <%= projectName %>Runner(inputProvider.ecsConfig, inputProvider, <%= projectName %>Systems, <%= projectName %>Signals);
<% } else { -%>
        _runner = new <%= projectName %>Runner(inputProvider.ecsConfig, inputProvider, <%= projectName %>Systems, <%= projectName %>Signals, rapier);
<% } -%>
      }

<% if (simulationType !== 'raw') { -%>
      // Hook state transfer to rebuild ColliderEntityMap after receiving external state
      const worldManager = _runner.PhysicsWorldManager;
      _runner.Simulation.addStateTransferHandler(() => {
        worldManager.colliderEntityMap.clear();
        const physicsFilter = _runner.DIContainer.resolve(PhysicsRefsFilter);
        const refs = _runner.DIContainer.resolve(PhysicsRefs);
        const refsUnsafe = refs.unsafe;
        for (const e of physicsFilter) {
          worldManager.registerCollider(refsUnsafe.colliderHandle[e], e);
        }
      });

<% } -%>
      // Set up keyboard input drainer with hash reporting
      const reportHash = createHashReporter(_runner, {
        reportInterval: <%= projectName %>Arena.hashReportInterval,
        reportHashRpc: ReportHash,
      });

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

        reportHash(addRPC);
      });

      _runner.Simulation.enableHashTracking(<%= projectName %>Arena.hashReportInterval);
      _runner.start();

      if (inputProvider instanceof RelayInputProvider) {
        const serverHello = await inputProvider.serverHello;
        if (serverHello.serverTick > 0) {
          _runner.Simulation.clock.setAccumulatedTime(serverHello.serverTick * _runner.Config.frameLength);
        }
      }

      if (inputProvider instanceof LocalInputProvider) {
        const playerId = UUID.generate().asUint8();
        const joinRpc = new RPC(PlayerJoined.id, {
          tick: 1,
          seq: 0,
          ordinal: 0,
          playerSlot: 255,
        }, {
          slot: 0,
          playerId,
        });
        inputProvider.addRemoteRpc(joinRpc);
      }

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

  useDevBridge(runner, { hashTrackingInterval: <%= projectName %>Arena.hashReportInterval });

  return !runner ? null : <RunnerContext.Provider value={runner}>{children}</RunnerContext.Provider>;
};

export const RunnerTicker: FC<{ children: ReactNode }> = ({ children }) => {
  const runner = useRunner();
  useTick((ticker) => {
    runner.update(ticker.deltaMS);
  });

  return children;
};
