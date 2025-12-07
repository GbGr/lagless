// libs/relay-input-provider/src/lib/relay-input-provider.ts

import { AbstractInputProvider, ECSConfig, ECSSimulation, InputRegistry, RPC, seedFrom2x64 } from '@lagless/core';
import { Client, Room, SeatReservation } from 'colyseus.js';
import {
  CancelInputStruct,
  ClockSync,
  HeaderStruct,
  InputDelayController,
  MsgType,
  PingStruct,
  PlayerFinishedGameStruct,
  PongStruct,
  RELAY_BYTES_CHANNEL,
  ServerHelloStruct,
  TickInputFanoutStruct,
  TickInputKind,
  TickInputStruct,
  WireVersion,
} from '@lagless/net-wire';
import {
  BinarySchemaPackPipeline,
  BinarySchemaUnpackPipeline,
  InferBinarySchemaValues,
  InputBinarySchema,
  unpackBatchBuffers,
} from '@lagless/binary';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface RelayInputProviderConfig {
  readonly pingIntervalMs: number;
  readonly burstPingCount: number;
  readonly connectionTimeoutMs: number;
}

const DEFAULT_CONFIG: RelayInputProviderConfig = {
  pingIntervalMs: 250,
  burstPingCount: 5,
  connectionTimeoutMs: 5000,
};

export class RelayInputProvider extends AbstractInputProvider {
  public override readonly playerSlot: number;

  private readonly _config: RelayInputProviderConfig;
  private readonly _room: Room<unknown>;
  private readonly _clockSync: ClockSync;
  private readonly _inputDelayController: InputDelayController;
  private readonly _initialMessagesBuffer: Uint8Array[];

  private _tickToRollback: number | undefined;
  private _nowFn: (() => number) | null = null;
  private _pingIntervalId: NodeJS.Timeout | null = null;
  private _isInitialized = false;

  public static async connect(
    ecsConfig: ECSConfig,
    inputRegistry: InputRegistry,
    client: Client,
    seatReservation: SeatReservation,
    config: Partial<RelayInputProviderConfig> = {}
  ): Promise<RelayInputProvider> {
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };
    const room = await client.consumeSeatReservation(seatReservation);

    const messagesBuffer: Uint8Array[] = [];

    const serverHello = await new Promise<InferBinarySchemaValues<typeof ServerHelloStruct>>(
      (resolve, reject) => {
        const timeoutId = setTimeout(
          () => reject(new Error('ServerHello timeout')),
          mergedConfig.connectionTimeoutMs
        );

        const unsubscribe = room.onMessage(RELAY_BYTES_CHANNEL, (data: Uint8Array) => {
          const buffer = extractArrayBuffer(data);
          const pipeline = new BinarySchemaUnpackPipeline(buffer);
          const header = pipeline.unpack(HeaderStruct);

          if (header.type === MsgType.ServerHello) {
            clearTimeout(timeoutId);
            unsubscribe();
            resolve(pipeline.unpack(ServerHelloStruct));
          } else {
            // Buffer other messages for later processing
            messagesBuffer.push(data);
          }
        });
      }
    );

    const configWithSeed = new ECSConfig({
      ...ecsConfig,
      seed: seedFrom2x64(serverHello.seed0, serverHello.seed1),
    });

    return new RelayInputProvider(
      serverHello.playerSlot,
      configWithSeed,
      inputRegistry,
      room,
      messagesBuffer,
      mergedConfig
    );
  }

  private constructor(
    playerSlot: number,
    ecsConfig: ECSConfig,
    inputRegistry: InputRegistry,
    room: Room<unknown>,
    initialMessagesBuffer: Uint8Array[],
    config: RelayInputProviderConfig
  ) {
    super(ecsConfig, inputRegistry);

    this.playerSlot = playerSlot;
    this._room = room;
    this._config = config;
    this._initialMessagesBuffer = initialMessagesBuffer;

    this._clockSync = new ClockSync();
    this._inputDelayController = new InputDelayController(
      ecsConfig.minInputDelayTick,
      ecsConfig.maxInputDelayTick,
      ecsConfig.initialInputDelayTick
    );

    // Register message handler
    this._room.onMessage(RELAY_BYTES_CHANNEL, this.handleMessage.bind(this));
  }

  public override getInvalidateRollbackTick(): number | undefined {
    const tick = this._tickToRollback;
    this._tickToRollback = undefined;
    return tick;
  }

  public override init(simulation: ECSSimulation): void {
    if (this._disposed) {
      console.warn('[RelayInput] init called after dispose');
      return;
    }

    if (this._isInitialized) {
      console.warn('[RelayInput] Already initialized');
      return;
    }

    super.init(simulation);
    this._isInitialized = true;
    this._nowFn = simulation.clock.getElapsedTime;

    // Start ping loop after microtask (to allow simulation to start)
    queueMicrotask(() => {
      if (this._disposed) return;

      // Send burst pings for initial RTT estimation
      for (let i = 0; i < this._config.burstPingCount; i++) {
        this.sendPing();
      }

      // Start regular ping interval
      this._pingIntervalId = setInterval(
        () => this.sendPing(),
        this._config.pingIntervalMs
      );
    });

    // Process buffered messages
    for (const msg of this._initialMessagesBuffer) {
      this.handleMessage(msg);
    }
    this._initialMessagesBuffer.length = 0;
  }

  public override dispose(): void {
    if (this._disposed) return;

    super.dispose();

    if (this._pingIntervalId !== null) {
      clearInterval(this._pingIntervalId);
      this._pingIntervalId = null;
    }

    this._room.leave(true).catch(err => {
      console.warn('[RelayInput] Error leaving room:', err);
    });
  }

  public override update(): void {
    super.update();

    if (this._frameRPCBuffer.length === 0) return;

    this.sendFrameInputs();
  }

  /**
   * Sends a "player finished game" notification to the server.
   */
  public sendPlayerFinishedGame(
    payload: Omit<InferBinarySchemaValues<typeof PlayerFinishedGameStruct>, 'verifiedTick'>
  ): void {
    const verifiedTick = this._simulation.tick + this.ecsConfig.maxInputDelayTick;

    const pipeline = new BinarySchemaPackPipeline();
    pipeline.pack(HeaderStruct, { version: WireVersion.V1, type: MsgType.PlayerFinishedGame });
    pipeline.pack(PlayerFinishedGameStruct, { ...payload, verifiedTick });

    this._room.send(RELAY_BYTES_CHANNEL, pipeline.toUint8Array());
  }

  public get rttMs(): number {
    return this._clockSync.rttEwmaMs;
  }

  public get jitterMs(): number {
    return this._clockSync.jitterEwmaMs;
  }

  public get currentInputDelayTicks(): number {
    return this._currentInputDelay;
  }

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
      default:
        console.warn(`[RelayInput] Unknown message type ${header.type}`);
    }
  }

  private handlePong(pipeline: BinarySchemaUnpackPipeline): void {
    if (!this._nowFn) return;

    const clientNow = this._nowFn();
    const pong = pipeline.unpack(PongStruct);

    // Update timing statistics
    const justBecameReady = this._clockSync.updateFromPong(clientNow, pong);

    // When ClockSync just became ready, activate PhaseNudger
    if (justBecameReady) {
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
      this.nudgeClockToServer(pong, clientNow);
    }
  }

  private handleTickInputFanout(pipeline: BinarySchemaUnpackPipeline): void {
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

    console.log(
      `[RelayInput] Input cancelled: tick=${cancel.tick}, slot=${cancel.playerSlot}, seq=${cancel.seq}`
    );

    // Remove from local history
    this._rpcHistory.removePlayerInputsAtTick(
      cancel.playerSlot,
      cancel.tick,
      cancel.seq
    );

    // Trigger rollback to re-simulate without the cancelled input
    this.requestRollback(cancel.tick);
  }

  private sendPing(): void {
    if (!this._nowFn || this._disposed) return;

    const pipeline = new BinarySchemaPackPipeline();
    pipeline.pack(HeaderStruct, { version: WireVersion.V1, type: MsgType.Ping });
    pipeline.pack(PingStruct, { cSend: this._nowFn() });

    this._room.send(RELAY_BYTES_CHANNEL, pipeline.toUint8Array());
  }

  private sendFrameInputs(): void {
    if (this._frameRPCBuffer.length === 0) return;

    const firstRpc = this._frameRPCBuffer[0];

    // Pack all inputs from this frame
    const packedInputs = InputBinarySchema.packBatch(
      this._inputRegistry,
      this._frameRPCBuffer.map(rpc => ({
        inputId: rpc.inputId,
        ordinal: rpc.meta.ordinal,
        values: rpc.data,
      }))
    );

    const pipeline = new BinarySchemaPackPipeline();
    pipeline.pack(HeaderStruct, { version: WireVersion.V1, type: MsgType.TickInput });
    pipeline.pack(TickInputStruct, {
      tick: firstRpc.meta.tick,
      playerSlot: this.playerSlot,
      kind: TickInputKind.Client,
      seq: firstRpc.meta.seq,
    });
    pipeline.appendBuffer(packedInputs);

    this._room.send(RELAY_BYTES_CHANNEL, pipeline.toUint8Array());
  }

  /**
   * One-time alignment when ClockSync becomes ready.
   * Sets the clock close to server time immediately.
   */
  private performInitialClockAlignment(
    pong: InferBinarySchemaValues<typeof PongStruct>,
    clientNow: number
  ): void {
    const serverNow = this._clockSync.serverNowMs(clientNow);
    const serverDeltaMs = serverNow - pong.sSend;
    const approxServerTick = pong.sTick + (serverDeltaMs / this._frameLength);
    const localTick = this._simulation.tick;
    const tickDiff = approxServerTick - localTick;

    console.log(
      `[RelayInput] Initial alignment: server≈${approxServerTick.toFixed(1)}, ` +
      `local=${localTick}, diff=${tickDiff.toFixed(1)} ticks`
    );

    // If significantly behind, do hard sync via accumulated time adjustment
    if (Math.abs(tickDiff) > 2) {
      this._simulation.clock.phaseNudger.reset();
      this._simulation.clock.phaseNudger.onServerTickHint(approxServerTick, localTick);
    }
  }

  private nudgeClockToServer(
    pong: InferBinarySchemaValues<typeof PongStruct>,
    clientNow: number
  ): void {
    if (!this._clockSync.isReady) return;

    const serverNow = this._clockSync.serverNowMs(clientNow);
    const serverDeltaMs = serverNow - pong.sSend;
    const approxServerTick = pong.sTick + (serverDeltaMs / this._frameLength);

    this._simulation.clock.phaseNudger.onServerTickHint(
      approxServerTick,
      this._simulation.tick
    );
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
