import {
  <%= projectName %>Runner,
  <%= projectName %>Systems,
  <%= projectName %>Signals,
  MoveInput,
  PlayerJoined,
  <%= projectName %>Arena,
} from '<%= packageName %>-simulation';
import { createContext, FC, ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useTick } from '@pixi/react';
import { useNavigate } from 'react-router-dom';
import { ProviderStore } from '../hooks/use-start-match';
import { ECSConfig, LocalInputProvider, RPC, createHashReporter } from '@lagless/core';
import { RelayInputProvider, RelayConnection } from '@lagless/relay-client';
import { getMatchInfo } from '../hooks/use-start-multiplayer-match';
import { UUID } from '@lagless/misc';
import { useDevBridge, useDiagnosticsControl } from '@lagless/react';
import { useDesyncDiagnostics } from '@lagless/desync-diagnostics';
<% if (simulationType !== 'raw') { -%>
import { getFastHash } from '@lagless/binary';
<% } -%>
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
      const RAPIER = (await import('@lagless/rapier2d-deterministic-compat')).default as any;
      await RAPIER.init();
      const rapier = RAPIER as unknown as RapierModule2d;
      if (disposed) { inputProvider.dispose(); return; }

<% } else if (simulationType === 'physics3d') { -%>
      // Load Rapier 3D WASM
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const RAPIER = (await import('@dimforge/rapier3d-deterministic-compat')).default as any;
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
              onHashMismatch: (data) => hashReporterRef.current?.reportMismatch(data),
              onConnected: () => console.log('[Relay] Connected'),
              onDisconnected: () => console.log('[Relay] Disconnected'),
            },
          );

          connectionRef.current = _connection;
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
    runner.Simulation.enableHashTracking(<%= projectName %>Arena.hashReportInterval);
    const reporter = createHashReporter(runner, {
      reportInterval: <%= projectName %>Arena.hashReportInterval,
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

  useDevBridge(runner, { hashTrackingInterval: <%= projectName %>Arena.hashReportInterval, diagnosticsEnabled });

<% if (simulationType === 'physics2d') { -%>
  const diagnosticsOptions = useMemo(() => {
    if (!runner) return undefined;
    const wm = runner.PhysicsWorldManager;
    return {
      physicsHashFn: () => {
        const snap = wm.takeSnapshot();
        return getFastHash(snap.buffer);
      },
    };
  }, [runner]);

  useDesyncDiagnostics(runner, { ...diagnosticsOptions, enabled: diagnosticsEnabled });
<% } else if (simulationType === 'physics3d') { -%>
  const diagnosticsOptions = useMemo(() => {
    if (!runner) return undefined;
    const wm = runner.PhysicsWorldManager;
    return {
      physicsHashFn: () => {
        const snap = wm.takeSnapshot();
        return getFastHash(snap.buffer);
      },
    };
  }, [runner]);

  useDesyncDiagnostics(runner, { ...diagnosticsOptions, enabled: diagnosticsEnabled });
<% } else { -%>
  useDesyncDiagnostics(runner, { enabled: diagnosticsEnabled });
<% } -%>

  return !runner ? null : <RunnerContext.Provider value={runner}>{children}</RunnerContext.Provider>;
};

export const RunnerTicker: FC<{ children: ReactNode }> = ({ children }) => {
  const runner = useRunner();
  useTick((ticker) => {
    runner.update(ticker.deltaMS);
  });

  return children;
};
