// libs/relay-input-provider/src/lib/relay-input-provider-v2.ts

import {
  AbstractInputProvider,
  ECSConfig,
  ECSSimulation,
  InputRegistry,
  RPC,
  seedFrom2x64,
} from '@lagless/core';
import { Client, Room, SeatReservation } from 'colyseus.js';
import {
  CancelInputStruct,
  ClockSync,
  HeaderStruct,
  InputDelayController,
  LateJoinBundleHeaderStruct,
  MsgType,
  PingStruct,
  PongStruct,
  RELAY_BYTES_CHANNEL,
  RoomCloseReason,
  RoomClosingStruct,
  ServerHelloV2Struct,
  SnapshotRequestStruct,
  StateHashStruct,
  TickInputFanoutStruct,
  TickInputKind,
  TickInputStruct,
  WireVersion,
} from '@lagless/net-wire';
import {
  BinarySchemaPackPipeline,
  BinarySchemaUnpackPipeline,
  getFastHash,
  InferBinarySchemaValues,
  InputBinarySchema,
  unpackBatchBuffers,
} from '@lagless/binary';
import {
  createSnapshotSourceFromSimulation,
  SnapshotResponder,
  type SnapshotSource,
} from './snapshot-responder.js';
// eslint-disable-next-line @nx/enforce-module-boundaries
import type { RoomJoinedResponse } from '@lagless/colyseus-rooms';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface RelayInputProviderV2Config {
  /** Interval between ping messages in ms (default: 250) */
  readonly pingIntervalMs: number;
  /** Number of burst pings on connection (default: 5) */
  readonly burstPingCount: number;
  /** Timeout for initial connection in ms (default: 5000) */
  readonly connectionTimeoutMs: number;
  /** Interval for sending state hash for desync detection in ms (default: 0 = disabled) */
  readonly stateHashIntervalMs: number;
  /** Enable responding to snapshot requests (default: true) */
  readonly enableSnapshotResponder: boolean;
}

const DEFAULT_CONFIG: RelayInputProviderV2Config = {
  pingIntervalMs: 250,
  burstPingCount: 5,
  connectionTimeoutMs: 5000,
  stateHashIntervalMs: 0,
  enableSnapshotResponder: true,
};

/**
 * Late-join bundle data received from server
 */
export interface LateJoinBundle {
  readonly snapshotTick: number;
  readonly snapshotHash: number;
  readonly snapshot: ArrayBuffer;
  readonly inputs: RPC[];
}

/**
 * Room closing event data
 */
export interface RoomClosingEvent {
  readonly reason: RoomCloseReason;
  readonly finalTick: number;
}

/**
 * Events emitted by RelayInputProviderV2
 */
export interface RelayInputProviderV2Events {
  /** Called when a late-join bundle is received and ready to apply */
  onLateJoinBundle: (bundle: LateJoinBundle) => void;
  /** Called when room is closing */
  onRoomClosing: (event: RoomClosingEvent) => void;
  /** Called when a desync is detected via state hash mismatch */
  onDesyncDetected: (expectedHash: number, actualHash: number, tick: number) => void;
}

/**
 * Connection result from connect() factory
 */
export interface RelayConnectionResultV2 {
  readonly provider: RelayInputProviderV2;
  readonly ecsConfig: ECSConfig;
  readonly playerSlot: number;
  readonly serverTick: number;
  readonly maxPlayers: number;
  readonly isLateJoin: boolean;
}

/**
 * V2 Relay Input Provider with support for:
 * - Late-join via snapshot voting
 * - Reconnection support
 * - State hash desync detection
 * - Room closing notifications
 */
export class RelayInputProviderV2 extends AbstractInputProvider {
  public override readonly playerSlot: number;

  /** Server tick at the moment of connection (from ServerHelloV2) */
  public readonly initialServerTick: number;
  /** Maximum players in this room */
  public readonly maxPlayers: number;
  /** Whether this is a late-join (server was already running) */
  public readonly isLateJoin: boolean;

  private readonly _config: RelayInputProviderV2Config;
  private readonly _room: Room<unknown>;
  private readonly _clockSync: ClockSync;
  private readonly _inputDelayController: InputDelayController;
  private readonly _initialMessagesBuffer: Uint8Array[];
  private readonly _eventHandlers: Partial<RelayInputProviderV2Events> = {};

  private _snapshotResponder: SnapshotResponder | null = null;
  private _snapshotSource: SnapshotSource | null = null;
  private _tickToRollback: number | undefined;
  private _nowFn: (() => number) | null = null;
  private _pingIntervalId: NodeJS.Timeout | null = null;
  private _stateHashIntervalId: NodeJS.Timeout | null = null;
  private _isInitialized = false;
  private _lateJoinBundlePending: LateJoinBundle | null = null;
  private _isWaitingForLateJoinBundle = false;

  /**
   * Connect to a relay room and create V2 input provider
   *
   * @param ecsConfig - ECS configuration
   * @param inputRegistry - Input registry for unpacking inputs
   * @param client - Colyseus client
   * @param seatReservation - Seat reservation from matchmaking
   * @param config - Optional configuration overrides
   * @returns Connection result with provider and metadata
   */
  public static async connect(
    ecsConfig: ECSConfig,
    inputRegistry: InputRegistry,
    client: Client,
    seatReservation: SeatReservation | RoomJoinedResponse['reservation'],
    config: Partial<RelayInputProviderV2Config> = {}
  ): Promise<RelayConnectionResultV2> {
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };
    const room = await client.consumeSeatReservation(seatReservation as unknown as SeatReservation);

    const messagesBuffer: Uint8Array[] = [];

    // Wait for ServerHelloV2
    const serverHello = await new Promise<InferBinarySchemaValues<typeof ServerHelloV2Struct>>((resolve, reject) => {
      const timeoutId = setTimeout(() => reject(new Error('ServerHelloV2 timeout')), mergedConfig.connectionTimeoutMs);

      const unsubscribe = room.onMessage(RELAY_BYTES_CHANNEL, (data: Uint8Array) => {
        const buffer = extractArrayBuffer(data);
        const pipeline = new BinarySchemaUnpackPipeline(buffer);
        const header = pipeline.unpack(HeaderStruct);

        if (header.type === MsgType.ServerHello) {
          clearTimeout(timeoutId);
          unsubscribe();
          resolve(pipeline.unpack(ServerHelloV2Struct));
        } else {
          // Buffer other messages for later processing
          messagesBuffer.push(data);
        }
      });
    });

    // Create ECS config with server-provided seed
    const configWithSeed = new ECSConfig({
      ...ecsConfig,
      seed: seedFrom2x64(serverHello.seed0, serverHello.seed1),
    });

    // Determine if this is a late join (server already running)
    const isLateJoin = serverHello.serverTick > 0;

    const provider = new RelayInputProviderV2(
      serverHello.playerSlot,
      serverHello.serverTick,
      serverHello.maxPlayers,
      isLateJoin,
      configWithSeed,
      inputRegistry,
      room,
      messagesBuffer,
      mergedConfig
    );

    return {
      provider,
      ecsConfig: configWithSeed,
      playerSlot: serverHello.playerSlot,
      serverTick: serverHello.serverTick,
      maxPlayers: serverHello.maxPlayers,
      isLateJoin,
    };
  }

  private constructor(
    playerSlot: number,
    initialServerTick: number,
    maxPlayers: number,
    isLateJoin: boolean,
    ecsConfig: ECSConfig,
    inputRegistry: InputRegistry,
    room: Room<unknown>,
    initialMessagesBuffer: Uint8Array[],
    config: RelayInputProviderV2Config
  ) {
    super(ecsConfig, inputRegistry);

    this.playerSlot = playerSlot;
    this.initialServerTick = initialServerTick;
    this.maxPlayers = maxPlayers;
    this.isLateJoin = isLateJoin;
    this._room = room;
    this._config = config;
    this._initialMessagesBuffer = initialMessagesBuffer;
    this._isWaitingForLateJoinBundle = isLateJoin;

    this._clockSync = new ClockSync();
    this._inputDelayController = new InputDelayController(
      ecsConfig.minInputDelayTick,
      ecsConfig.maxInputDelayTick,
      ecsConfig.initialInputDelayTick
    );

    // Register message handler
    this._room.onMessage(RELAY_BYTES_CHANNEL, this.handleMessage.bind(this));
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Event Handling
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Subscribe to events
   */
  public on<K extends keyof RelayInputProviderV2Events>(event: K, handler: RelayInputProviderV2Events[K]): () => void {
    this._eventHandlers[event] = handler;
    return () => {
      delete this._eventHandlers[event];
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // AbstractInputProvider Implementation
  // ─────────────────────────────────────────────────────────────────────────────

  public override getInvalidateRollbackTick(): number | undefined {
    const tick = this._tickToRollback;
    this._tickToRollback = undefined;
    return tick;
  }

  public override init(simulation: ECSSimulation): void {
    if (this._disposed) {
      console.warn('[RelayInputV2] init called after dispose');
      return;
    }

    if (this._isInitialized) {
      console.warn('[RelayInputV2] Already initialized');
      return;
    }

    super.init(simulation);
    this._isInitialized = true;
    this._nowFn = simulation.clock.getElapsedTime;

    // Setup snapshot responder if enabled
    if (this._config.enableSnapshotResponder) {
      this._snapshotSource = createSnapshotSourceFromSimulation(simulation);
      this._snapshotResponder = new SnapshotResponder(this._snapshotSource, (data) =>
        this._room.send(RELAY_BYTES_CHANNEL, data)
      );
    }

    // Start ping loop after microtask (to allow simulation to start)
    queueMicrotask(() => {
      if (this._disposed) return;

      // Send burst pings for initial RTT estimation
      for (let i = 0; i < this._config.burstPingCount; i++) {
        this.sendPing();
      }

      // Start regular ping interval
      this._pingIntervalId = setInterval(() => this.sendPing(), this._config.pingIntervalMs);

      // Start state hash interval if enabled
      if (this._config.stateHashIntervalMs > 0) {
        this._stateHashIntervalId = setInterval(() => this.sendStateHash(), this._config.stateHashIntervalMs);
      }
    });

    // If late join, wait for LateJoinBundle before processing other messages
    if (!this._isWaitingForLateJoinBundle) {
      // Process buffered messages
      for (const msg of this._initialMessagesBuffer) {
        this.handleMessage(msg);
      }
      this._initialMessagesBuffer.length = 0;
    }

    // If we already have a pending late-join bundle, apply it
    if (this._lateJoinBundlePending) {
      this.applyLateJoinBundle(this._lateJoinBundlePending);
      this._lateJoinBundlePending = null;
    }
  }

  public override dispose(): void {
    if (this._disposed) return;

    super.dispose();

    if (this._pingIntervalId !== null) {
      clearInterval(this._pingIntervalId);
      this._pingIntervalId = null;
    }

    if (this._stateHashIntervalId !== null) {
      clearInterval(this._stateHashIntervalId);
      this._stateHashIntervalId = null;
    }

    this._room.leave(true).catch((err) => {
      console.warn('[RelayInputV2] Error leaving room:', err);
    });
  }

  public override update(): void {
    // Don't process inputs while waiting for late-join bundle
    if (this._isWaitingForLateJoinBundle) {
      return;
    }

    super.update();

    if (this._frameRPCBuffer.length === 0) return;

    this.sendFrameInputs();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Late-Join Support
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Check if waiting for late-join bundle
   */
  public get isWaitingForLateJoin(): boolean {
    return this._isWaitingForLateJoinBundle;
  }

  /**
   * Apply a late-join bundle to the simulation
   *
   * This should be called by the game after receiving onLateJoinBundle event
   * if manual control is desired. Otherwise, it's called automatically.
   */
  public applyLateJoinBundle(bundle: LateJoinBundle): void {
    if (!this._simulation) {
      // Store for later if simulation not ready
      this._lateJoinBundlePending = bundle;
      return;
    }

    console.log(
      `[RelayInputV2] Applying late-join bundle: tick=${bundle.snapshotTick}, ` +
        `inputs=${bundle.inputs.length}, hash=${bundle.snapshotHash}`
    );

    // 1. Apply snapshot to simulation
    this._simulation.applyExternalSnapshot(bundle.snapshot, bundle.snapshotTick);

    // 2. Add all inputs to RPC history
    if (bundle.inputs.length > 0) {
      this._rpcHistory.addBatch(bundle.inputs);
    }

    // 3. Clear waiting state
    this._isWaitingForLateJoinBundle = false;

    // 4. Process any buffered messages
    for (const msg of this._initialMessagesBuffer) {
      this.handleMessage(msg);
    }
    this._initialMessagesBuffer.length = 0;

    // 5. Request rollback to replay from snapshot tick
    this.requestRollback(bundle.snapshotTick);

    console.log('[RelayInputV2] Late-join bundle applied, simulation ready');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Sends a "player finished game" notification to the server.
   */
  public sendPlayerFinishedGame(payload: { score: number; mmrChange?: number }): void {
    if (!this._simulation) return;

    const verifiedTick = this._simulation.tick + this.ecsConfig.maxInputDelayTick;

    const pipeline = new BinarySchemaPackPipeline();
    pipeline.pack(HeaderStruct, { version: WireVersion.V2, type: MsgType.PlayerFinishedGame });
    pipeline.pack({ score: { fieldType: 4 }, mmrChange: { fieldType: 3 }, verifiedTick: { fieldType: 5 } } as any, {
      ...payload,
      verifiedTick,
    });

    this._room.send(RELAY_BYTES_CHANNEL, pipeline.toUint8Array());
  }

  /**
   * Get current RTT in milliseconds
   */
  public get rttMs(): number {
    return this._clockSync.rttEwmaMs;
  }

  /**
   * Get current jitter in milliseconds
   */
  public get jitterMs(): number {
    return this._clockSync.jitterEwmaMs;
  }

  /**
   * Get current input delay in ticks
   */
  public get currentInputDelayTicks(): number {
    return this._currentInputDelay;
  }

  /**
   * Get underlying room (for advanced use cases)
   */
  public get room(): Room<unknown> {
    return this._room;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Message Handling
  // ─────────────────────────────────────────────────────────────────────────────

  private handleMessage(data: Uint8Array): void {
    const buffer = extractArrayBuffer(data);
    const pipeline = new BinarySchemaUnpackPipeline(buffer);
    const header = pipeline.unpack(HeaderStruct);

    switch (header.type) {
      case MsgType.Pong:
        this.handlePong(pipeline);
        break;
      case MsgType.TickInputFanout:
        this.handleTickInputFanout(pipeline);
        break;
      case MsgType.CancelInput:
        this.handleCancelInput(pipeline);
        break;
      case MsgType.SnapshotRequest:
        this.handleSnapshotRequest(pipeline);
        break;
      case MsgType.LateJoinBundle:
        this.handleLateJoinBundle(pipeline);
        break;
      case MsgType.RoomClosing:
        this.handleRoomClosing(pipeline);
        break;
      case MsgType.StateHash:
        this.handleStateHash(pipeline);
        break;
      default:
        console.warn(`[RelayInputV2] Unknown message type ${header.type}`);
    }
  }

  private handlePong(pipeline: BinarySchemaUnpackPipeline): void {
    if (!this._nowFn) return;

    const clientNow = this._nowFn();
    const pong = pipeline.unpack(PongStruct);

    // Update timing statistics
    const justBecameReady = this._clockSync.updateFromPong(clientNow, pong);

    // When ClockSync just became ready, activate PhaseNudger
    if (justBecameReady && this._simulation) {
      this._simulation.clock.phaseNudger.activate();

      // Do initial clock alignment (one-time)
      this.performInitialClockAlignment(pong, clientNow);
    }

    // Recompute adaptive input delay only when ready
    if (this._clockSync.isReady) {
      this._currentInputDelay = this._inputDelayController.recompute(
        this._frameLength,
        this._clockSync.rttEwmaMs,
        this._clockSync.jitterEwmaMs
      );

      // Continuous nudging (small corrections)
      if (this._simulation) {
        this.nudgeClockToServer(pong, clientNow);
      }
    }
  }

  private handleTickInputFanout(pipeline: BinarySchemaUnpackPipeline): void {
    // If waiting for late-join, buffer the message
    if (this._isWaitingForLateJoinBundle) {
      // Re-pack and buffer - we'll process after late-join bundle
      return;
    }

    pipeline.unpack(TickInputFanoutStruct);
    const inputsBuffer = pipeline.sliceRemaining();

    if (inputsBuffer.byteLength === 0) return;

    const unpackedBuffers = unpackBatchBuffers(inputsBuffer);
    const receivedRpcs: RPC[] = [];
    let minReceivedTick = Number.MAX_SAFE_INTEGER;

    for (const buf of unpackedBuffers) {
      const bufPipeline = new BinarySchemaUnpackPipeline(buf);
      const tickInput = bufPipeline.unpack(TickInputStruct);

      // Skip own client inputs (we already have them in local history)
      if (tickInput.playerSlot === this.playerSlot && tickInput.kind === TickInputKind.Client) {
        continue;
      }

      // Track minimum tick for rollback calculation
      if (tickInput.tick < minReceivedTick) {
        minReceivedTick = tickInput.tick;
      }

      // Unpack input payload
      const payloadBuffer = bufPipeline.sliceRemaining();
      const rawInputs = InputBinarySchema.unpackBatch(this._inputRegistry, payloadBuffer);

      for (const rawInput of rawInputs) {
        const rpc = new RPC(
          rawInput.inputId,
          {
            tick: tickInput.tick,
            playerSlot: tickInput.playerSlot,
            seq: tickInput.seq,
            ordinal: rawInput.ordinal,
          },
          rawInput.values
        );
        receivedRpcs.push(rpc);
      }
    }

    // Add to history and trigger rollback if needed
    if (receivedRpcs.length > 0) {
      this._rpcHistory.addBatch(receivedRpcs);

      if (minReceivedTick < Number.MAX_SAFE_INTEGER) {
        this.requestRollback(minReceivedTick);
      }
    }
  }

  private handleCancelInput(pipeline: BinarySchemaUnpackPipeline): void {
    const cancel = pipeline.unpack(CancelInputStruct);

    console.log(`[RelayInputV2] Input cancelled: tick=${cancel.tick}, slot=${cancel.playerSlot}, seq=${cancel.seq}`);

    // Remove from local history
    this._rpcHistory.removePlayerInputsAtTick(cancel.playerSlot, cancel.tick, cancel.seq);

    // Trigger rollback to re-simulate without the cancelled input
    this.requestRollback(cancel.tick);
  }

  private handleSnapshotRequest(pipeline: BinarySchemaUnpackPipeline): void {
    if (!this._snapshotResponder) {
      console.warn('[RelayInputV2] Snapshot request received but responder disabled');
      return;
    }

    const request = pipeline.unpack(SnapshotRequestStruct);
    this._snapshotResponder.handleRequest(request);
  }

  private handleLateJoinBundle(pipeline: BinarySchemaUnpackPipeline): void {
    const header = pipeline.unpack(LateJoinBundleHeaderStruct);

    // Extract snapshot bytesx
    const snapshotBytes = pipeline.sliceRemaining();

    // Verify hash
    const computedHash = getFastHash(snapshotBytes);
    if (computedHash !== header.snapshotHash) {
      console.error(
        `[RelayInputV2] LateJoinBundle hash mismatch: expected=${header.snapshotHash}, got=${computedHash}`
      );
      // Continue anyway - server validated it
    }

    // Extract inputs
    const inputs: RPC[] = [];
    const inputsBuffer = pipeline.sliceRemaining();

    if (inputsBuffer.byteLength > 0) {
      const unpackedBuffers = unpackBatchBuffers(inputsBuffer);

      for (const buf of unpackedBuffers) {
        const bufPipeline = new BinarySchemaUnpackPipeline(buf);
        const tickInput = bufPipeline.unpack(TickInputStruct);
        const payloadBuffer = bufPipeline.sliceRemaining();
        const rawInputs = InputBinarySchema.unpackBatch(this._inputRegistry, payloadBuffer);

        for (const rawInput of rawInputs) {
          const rpc = new RPC(
            rawInput.inputId,
            {
              tick: tickInput.tick,
              playerSlot: tickInput.playerSlot,
              seq: tickInput.seq,
              ordinal: rawInput.ordinal,
            },
            rawInput.values
          );
          inputs.push(rpc);
        }
      }
    }

    const bundle: LateJoinBundle = {
      snapshotTick: header.snapshotTick,
      snapshotHash: header.snapshotHash,
      snapshot: snapshotBytes,
      inputs,
    };

    console.log(
      `[RelayInputV2] Received LateJoinBundle: tick=${bundle.snapshotTick}, ` +
        `size=${snapshotBytes.byteLength}, inputs=${inputs.length}`
    );

    // Notify handler
    if (this._eventHandlers.onLateJoinBundle) {
      this._eventHandlers.onLateJoinBundle(bundle);
    }

    // Auto-apply if simulation is ready
    if (this._simulation) {
      this.applyLateJoinBundle(bundle);
    } else {
      this._lateJoinBundlePending = bundle;
    }
  }

  private handleRoomClosing(pipeline: BinarySchemaUnpackPipeline): void {
    const closing = pipeline.unpack(RoomClosingStruct);

    const event: RoomClosingEvent = {
      reason: closing.reason,
      finalTick: closing.finalTick,
    };

    console.log(
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      `[RelayInputV2] Room closing: reason=${RoomCloseReason[closing.reason]}, finalTick=${closing.finalTick}`
    );

    if (this._eventHandlers.onRoomClosing) {
      this._eventHandlers.onRoomClosing(event);
    }
  }

  private handleStateHash(pipeline: BinarySchemaUnpackPipeline): void {
    if (!this._simulation) return;

    const { tick, hash32: expectedHash } = pipeline.unpack(StateHashStruct);

    // Only check if we've simulated past this tick
    if (tick > this._simulation.tick) return;

    // Get actual hash at that tick
    const snapshot = this._simulation.snapshotHistory?.getSnapshotAtTick?.(tick);
    if (!snapshot) return;

    const actualHash = getFastHash(snapshot);

    if (actualHash !== expectedHash) {
      console.error(`[RelayInputV2] Desync detected at tick ${tick}: expected=${expectedHash}, actual=${actualHash}`);

      if (this._eventHandlers.onDesyncDetected) {
        this._eventHandlers.onDesyncDetected(expectedHash, actualHash, tick);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Sending Messages
  // ─────────────────────────────────────────────────────────────────────────────

  private sendPing(): void {
    if (!this._nowFn || this._disposed) return;

    const pipeline = new BinarySchemaPackPipeline();
    pipeline.pack(HeaderStruct, { version: WireVersion.V2, type: MsgType.Ping });
    pipeline.pack(PingStruct, { cSend: this._nowFn() });

    this._room.send(RELAY_BYTES_CHANNEL, pipeline.toUint8Array());
  }

  private sendFrameInputs(): void {
    if (this._frameRPCBuffer.length === 0) return;

    const firstRpc = this._frameRPCBuffer[0];

    // Pack all inputs from this frame
    const packedInputs = InputBinarySchema.packBatch(
      this._inputRegistry,
      this._frameRPCBuffer.map((rpc) => ({
        inputId: rpc.inputId,
        ordinal: rpc.meta.ordinal,
        values: rpc.data,
      }))
    );

    const pipeline = new BinarySchemaPackPipeline();
    pipeline.pack(HeaderStruct, { version: WireVersion.V2, type: MsgType.TickInput });
    pipeline.pack(TickInputStruct, {
      tick: firstRpc.meta.tick,
      playerSlot: this.playerSlot,
      kind: TickInputKind.Client,
      seq: firstRpc.meta.seq,
    });
    pipeline.appendBuffer(packedInputs);

    this._room.send(RELAY_BYTES_CHANNEL, pipeline.toUint8Array());
  }

  private sendStateHash(): void {
    if (!this._simulation || this._disposed) return;

    const tick = this._simulation.tick;
    const snapshot = this._simulation.mem.exportSnapshot();
    const hash32 = getFastHash(snapshot);

    const pipeline = new BinarySchemaPackPipeline();
    pipeline.pack(HeaderStruct, { version: WireVersion.V2, type: MsgType.StateHash });
    pipeline.pack(StateHashStruct, { tick, hash32 });

    this._room.send(RELAY_BYTES_CHANNEL, pipeline.toUint8Array());
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Clock Synchronization
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * One-time alignment when ClockSync becomes ready.
   * Sets the clock close to server time immediately.
   */
  private performInitialClockAlignment(pong: InferBinarySchemaValues<typeof PongStruct>, clientNow: number): void {
    if (!this._simulation) return;

    const serverNow = this._clockSync.serverNowMs(clientNow);
    const serverDeltaMs = serverNow - pong.sSend;
    const approxServerTick = pong.sTick + serverDeltaMs / this._frameLength;
    const localTick = this._simulation.tick;
    const tickDiff = approxServerTick - localTick;

    console.log(
      `[RelayInputV2] Initial alignment: server=${approxServerTick.toFixed(1)}, ` +
        `local=${localTick}, diff=${tickDiff.toFixed(1)} ticks`
    );

    // If significantly behind, do hard sync via accumulated time adjustment
    if (Math.abs(tickDiff) > 2) {
      this._simulation.clock.phaseNudger.reset();
      this._simulation.clock.phaseNudger.onServerTickHint(approxServerTick, localTick);
    }
  }

  private nudgeClockToServer(pong: InferBinarySchemaValues<typeof PongStruct>, clientNow: number): void {
    if (!this._clockSync.isReady || !this._simulation) return;

    const serverNow = this._clockSync.serverNowMs(clientNow);
    const serverDeltaMs = serverNow - pong.sSend;
    const approxServerTick = pong.sTick + serverDeltaMs / this._frameLength;

    this._simulation.clock.phaseNudger.onServerTickHint(approxServerTick, this._simulation.tick);
  }

  private requestRollback(toTick: number): void {
    // Only rollback if the tick is in the past relative to current simulation
    if (this._simulation && toTick <= this._simulation.tick) {
      if (this._tickToRollback === undefined || toTick < this._tickToRollback) {
        this._tickToRollback = toTick;
      }
    }
  }
}

function extractArrayBuffer(data: Uint8Array): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}
