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
  ClientReadyStruct,
  ClientRole,
  ClockSync,
  HeaderStruct,
  InputDelayController,
  LateJoinBundleStruct,
  MsgType,
  PingStruct,
  PlayerFinishedGameStruct,
  PongStruct,
  RELAY_BYTES_CHANNEL,
  RoomClosingStruct,
  ServerHelloStruct,
  ServerHelloV2Struct,
  SnapshotRequestStruct,
  SnapshotResponseStruct,
  TickInputFanoutStruct,
  TickInputKind,
  TickInputStruct,
  WireVersion,
  splitSnapshotBytes,
} from '@lagless/net-wire';
import {
  BinarySchemaPackPipeline,
  BinarySchemaUnpackPipeline,
  getFastHash,
  InferBinarySchemaValues,
  InputBinarySchema,
  unpackBatchBuffers,
} from '@lagless/binary';

export interface RelayInputProviderV2Config {
  readonly pingIntervalMs: number;
  readonly burstPingCount: number;
  readonly connectionTimeoutMs: number;
  readonly clientVersionHash?: number;
  readonly schemaHash?: number;
  readonly role?: ClientRole;
}

const DEFAULT_CONFIG: RelayInputProviderV2Config = {
  pingIntervalMs: 250,
  burstPingCount: 5,
  connectionTimeoutMs: 5000,
};

interface ServerHelloV2Data {
  readonly seed0: number;
  readonly seed1: number;
  readonly playerSlot: number;
  readonly serverTick: number;
  readonly frameLengthMs: number;
  readonly maxPlayers: number;
  readonly allowLateJoin: boolean;
}

interface LateJoinBundleData {
  readonly snapshotTick: number;
  readonly snapshotHash: number;
  readonly snapshotBytes: ArrayBuffer;
  readonly serverTick: number;
  readonly inputBuffers: ArrayBuffer[];
}

interface SnapshotEntry {
  readonly tick: number;
  readonly bytes: ArrayBuffer;
}

export class RelayInputProviderV2 extends AbstractInputProvider {
  public override readonly playerSlot: number;

  private readonly _config: RelayInputProviderV2Config;
  private readonly _room: Room<unknown>;
  private readonly _clockSync: ClockSync;
  private readonly _inputDelayController: InputDelayController;
  private readonly _initialMessagesBuffer: Uint8Array[];
  private readonly _bufferedMessages: Uint8Array[] = [];
  private readonly _remoteInputListeners = new Set<(rpcs: RPC[]) => void>();
  private readonly _snapshotHistory: SnapshotEntry[] = [];

  private _tickToRollback: number | undefined;
  private _nowFn: (() => number) | null = null;
  private _pingIntervalId: NodeJS.Timeout | null = null;
  private _isInitialized = false;
  private _isReady = false;
  private _awaitingLateJoin = false;
  private _lateJoinBundle: LateJoinBundleData | null = null;
  private _readyPromise: Promise<void>;
  private _resolveReady!: () => void;
  private _snapshotHistoryMax = 0;
  private _unsubscribeSnapshots: (() => void) | null = null;

  public static async connect(
    ecsConfig: ECSConfig,
    inputRegistry: InputRegistry,
    client: Client,
    seatReservation: SeatReservation,
    config: Partial<RelayInputProviderV2Config> = {}
  ): Promise<RelayInputProviderV2> {
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };
    const room = await client.consumeSeatReservation(seatReservation);
    const messagesBuffer: Uint8Array[] = [];

    const serverHello = await new Promise<ServerHelloV2Data>((resolve, reject) => {
      let fallbackHello: ServerHelloV2Data | null = null;
      let fallbackTimeoutId: NodeJS.Timeout | null = null;
      const timeoutId = setTimeout(
        () => {
          if (fallbackHello) {
            resolve(fallbackHello);
          } else {
            reject(new Error('ServerHello timeout'));
          }
        },
        mergedConfig.connectionTimeoutMs
      );

      const unsubscribe = room.onMessage(RELAY_BYTES_CHANNEL, (data: Uint8Array) => {
        const buffer = extractArrayBuffer(data);
        const pipeline = new BinarySchemaUnpackPipeline(buffer);
        const header = pipeline.unpack(HeaderStruct);

        if (header.type === MsgType.ServerHelloV2) {
          clearTimeout(timeoutId);
          if (fallbackTimeoutId) clearTimeout(fallbackTimeoutId);
          unsubscribe();
          const hello = pipeline.unpack(ServerHelloV2Struct);
          resolve({
            seed0: hello.seed0,
            seed1: hello.seed1,
            playerSlot: hello.playerSlot,
            serverTick: hello.serverTick,
            frameLengthMs: hello.frameLengthMs,
            maxPlayers: hello.maxPlayers,
            allowLateJoin: hello.allowLateJoin === 1,
          });
          return;
        }

        if (header.type === MsgType.ServerHello) {
          const hello = pipeline.unpack(ServerHelloStruct);
          fallbackHello = {
            seed0: hello.seed0,
            seed1: hello.seed1,
            playerSlot: hello.playerSlot,
            serverTick: 0,
            frameLengthMs: ecsConfig.frameLength,
            maxPlayers: ecsConfig.maxPlayers,
            allowLateJoin: false,
          };
          if (!fallbackTimeoutId) {
            fallbackTimeoutId = setTimeout(() => {
              clearTimeout(timeoutId);
              unsubscribe();
              resolve(fallbackHello as ServerHelloV2Data);
            }, 150);
          }
          return;
        }

        messagesBuffer.push(data);
      });
    });

    const fps = Math.round(1000 / serverHello.frameLengthMs) || ecsConfig.fps;
    const configWithSeed = new ECSConfig({
      ...ecsConfig,
      fps,
      maxPlayers: serverHello.maxPlayers,
      seed: seedFrom2x64(serverHello.seed0, serverHello.seed1),
    });

    return new RelayInputProviderV2(
      serverHello.playerSlot,
      configWithSeed,
      inputRegistry,
      room,
      messagesBuffer,
      mergedConfig,
      serverHello
    );
  }

  private constructor(
    playerSlot: number,
    ecsConfig: ECSConfig,
    inputRegistry: InputRegistry,
    room: Room<unknown>,
    initialMessagesBuffer: Uint8Array[],
    config: RelayInputProviderV2Config,
    serverHello: ServerHelloV2Data
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

    this._awaitingLateJoin = serverHello.allowLateJoin && serverHello.serverTick > 0;
    this._readyPromise = new Promise((resolve) => {
      this._resolveReady = resolve;
    });

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
    this._snapshotHistoryMax = this.ecsConfig.snapshotHistorySize;

    this._unsubscribeSnapshots = simulation.addTickHandler((tick) => {
      if (tick % this.ecsConfig.snapshotRate !== 0) return;
      this.storeSnapshot(tick);
    });

    // Start ping loop after microtask (to allow simulation to start)
    queueMicrotask(() => {
      if (this._disposed) return;

      for (let i = 0; i < this._config.burstPingCount; i++) {
        this.sendPing();
      }

      this._pingIntervalId = setInterval(
        () => this.sendPing(),
        this._config.pingIntervalMs
      );
    });

    this.sendClientReady();

    // Process buffered messages
    for (const msg of this._initialMessagesBuffer) {
      this.handleMessage(msg);
    }
    this._initialMessagesBuffer.length = 0;

    if (this._lateJoinBundle) {
      this.applyLateJoinBundle(this._lateJoinBundle);
    } else if (!this._awaitingLateJoin) {
      this.markReady();
    }

    this._room.onLeave(() => {
      this._unsubscribeSnapshots?.();
      this._unsubscribeSnapshots = null;
    });
  }

  public override dispose(): void {
    if (this._disposed) return;

    super.dispose();

    if (this._pingIntervalId !== null) {
      clearInterval(this._pingIntervalId);
      this._pingIntervalId = null;
    }

    this._unsubscribeSnapshots?.();
    this._unsubscribeSnapshots = null;

    this._room.leave(true).catch(err => {
      console.warn('[RelayInputV2] Error leaving room:', err);
    });
  }

  public override update(): void {
    if (!this._isReady) return;

    super.update();

    if (this._frameRPCBuffer.length === 0) return;

    this.sendFrameInputs();
  }

  public waitForReady(): Promise<void> {
    if (this._isReady) return Promise.resolve();
    return this._readyPromise;
  }

  public onRemoteInputs(handler: (rpcs: RPC[]) => void): () => void {
    this._remoteInputListeners.add(handler);
    return () => {
      this._remoteInputListeners.delete(handler);
    };
  }

  public sendPlayerFinishedGame(
    payload: Omit<InferBinarySchemaValues<typeof PlayerFinishedGameStruct>, 'verifiedTick'>
  ): void {
    const verifiedTick = this._simulation.tick + this.ecsConfig.maxInputDelayTick;

    const pipeline = new BinarySchemaPackPipeline();
    pipeline.pack(HeaderStruct, { version: WireVersion.V2, type: MsgType.PlayerFinishedGame });
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

  public get isReady(): boolean {
    return this._isReady;
  }

  private handleMessage(data: Uint8Array): void {
    const buffer = extractArrayBuffer(data);
    const pipeline = new BinarySchemaUnpackPipeline(buffer);
    const header = pipeline.unpack(HeaderStruct);

    switch (header.type) {
      case MsgType.ServerHello:
      case MsgType.ServerHelloV2:
        break;
      case MsgType.Pong:
        this.handlePong(pipeline);
        break;
      case MsgType.TickInputFanout:
        if (!this._isReady) {
          this._bufferedMessages.push(data);
          break;
        }
        this.handleTickInputFanout(pipeline);
        break;
      case MsgType.CancelInput:
        if (!this._isReady) {
          this._bufferedMessages.push(data);
          break;
        }
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
      default:
        console.warn(`[RelayInputV2] Unknown message type ${header.type}`);
    }
  }

  private handlePong(pipeline: BinarySchemaUnpackPipeline): void {
    if (!this._nowFn) return;

    const clientNow = this._nowFn();
    const pong = pipeline.unpack(PongStruct);

    const justBecameReady = this._clockSync.updateFromPong(clientNow, pong);

    if (justBecameReady) {
      this._simulation.clock.phaseNudger.activate();
      this.performInitialClockAlignment(pong, clientNow);
    }

    if (this._clockSync.isReady) {
      this._currentInputDelay = this._inputDelayController.recompute(
        this._frameLength,
        this._clockSync.rttEwmaMs,
        this._clockSync.jitterEwmaMs
      );

      this.nudgeClockToServer(pong, clientNow);
    }
  }

  private handleTickInputFanout(pipeline: BinarySchemaUnpackPipeline): void {
    pipeline.unpack(TickInputFanoutStruct);
    const inputsBuffer = pipeline.sliceRemaining();

    if (inputsBuffer.byteLength === 0) return;

    const unpackedBuffers = unpackBatchBuffers(inputsBuffer);
    const { rpcs, minTick } = this.unpackBuffersToRpcs(unpackedBuffers);

    if (rpcs.length > 0) {
      this._rpcHistory.addBatch(rpcs);
      this.notifyRemoteInputs(rpcs);

      if (minTick !== undefined) {
        this.requestRollback(minTick);
      }
    }
  }

  private handleCancelInput(pipeline: BinarySchemaUnpackPipeline): void {
    const cancel = pipeline.unpack(CancelInputStruct);

    console.log(
      `[RelayInputV2] Input cancelled: tick=${cancel.tick}, slot=${cancel.playerSlot}, seq=${cancel.seq}`
    );

    this._rpcHistory.removePlayerInputsAtTick(
      cancel.playerSlot,
      cancel.tick,
      cancel.seq
    );

    this.requestRollback(cancel.tick);
  }

  private handleSnapshotRequest(pipeline: BinarySchemaUnpackPipeline): void {
    if (!this._simulation) return;

    const request = pipeline.unpack(SnapshotRequestStruct);
    const entry = this.pickSnapshot(request.minTick, request.maxTick, request.maxBytes);
    if (!entry) return;

    const snapshotBytes = new Uint8Array(entry.bytes);
    const hash32 = getFastHash(entry.bytes);
    const chunks = splitSnapshotBytes(snapshotBytes, request.preferredChunkSize);

    for (const chunk of chunks) {
      const responsePipeline = new BinarySchemaPackPipeline();
      responsePipeline.pack(HeaderStruct, { version: WireVersion.V2, type: MsgType.SnapshotResponse });
      responsePipeline.pack(SnapshotResponseStruct, {
        requestId: request.requestId,
        snapshotTick: entry.tick,
        hash32,
        chunkIndex: chunk.chunkIndex,
        chunkCount: chunk.chunkCount,
        totalBytes: chunk.totalBytes,
      });
      responsePipeline.appendBuffer(
        chunk.bytes.buffer.slice(
          chunk.bytes.byteOffset,
          chunk.bytes.byteOffset + chunk.bytes.byteLength
        )
      );
      this._room.send(RELAY_BYTES_CHANNEL, responsePipeline.toUint8Array());
    }
  }

  private handleLateJoinBundle(pipeline: BinarySchemaUnpackPipeline): void {
    const bundle = pipeline.unpack(LateJoinBundleStruct);
    const remaining = pipeline.sliceRemaining();

    if (bundle.snapshotByteLength > remaining.byteLength) {
      console.warn('[RelayInputV2] Snapshot bundle length mismatch.');
      return;
    }

    const snapshotBytes = remaining.slice(0, bundle.snapshotByteLength);
    const inputsBuffer = remaining.slice(bundle.snapshotByteLength);
    const inputBuffers = inputsBuffer.byteLength > 0 ? unpackBatchBuffers(inputsBuffer) : [];

    const computedHash = getFastHash(snapshotBytes);
    if (computedHash !== bundle.snapshotHash) {
      console.warn('[RelayInputV2] Snapshot hash mismatch.');
      return;
    }

    const bundleData: LateJoinBundleData = {
      snapshotTick: bundle.snapshotTick,
      snapshotHash: bundle.snapshotHash,
      snapshotBytes,
      serverTick: bundle.serverTick,
      inputBuffers,
    };

    if (!this._simulation) {
      this._lateJoinBundle = bundleData;
      return;
    }

    this.applyLateJoinBundle(bundleData);
  }

  private applyLateJoinBundle(bundle: LateJoinBundleData): void {
    this._lateJoinBundle = null;
    this._awaitingLateJoin = false;

    this._simulation.mem.applySnapshot(bundle.snapshotBytes);
    this._simulation.clock.syncToTick(bundle.snapshotTick);

    const { rpcs } = this.unpackBuffersToRpcs(bundle.inputBuffers);
    if (rpcs.length > 0) {
      this._rpcHistory.addBatch(rpcs);
      this.notifyRemoteInputs(rpcs);
    }

    const ticksToSimulate = bundle.serverTick - bundle.snapshotTick;
    if (ticksToSimulate > 0) {
      this._simulation.update(ticksToSimulate * this._frameLength);
    }

    this.markReady();
  }

  private handleRoomClosing(pipeline: BinarySchemaUnpackPipeline): void {
    const closing = pipeline.unpack(RoomClosingStruct);
    console.warn(`[RelayInputV2] Room closing (reason=${closing.reason}, tick=${closing.finalTick})`);
    this.dispose();
  }

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

    const packedInputs = InputBinarySchema.packBatch(
      this._inputRegistry,
      this._frameRPCBuffer.map(rpc => ({
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

  private sendClientReady(): void {
    if (
      this._config.clientVersionHash === undefined &&
      this._config.schemaHash === undefined &&
      this._config.role === undefined
    ) {
      return;
    }

    const pipeline = new BinarySchemaPackPipeline();
    pipeline.pack(HeaderStruct, { version: WireVersion.V2, type: MsgType.ClientReady });
    pipeline.pack(ClientReadyStruct, {
      clientVersionHash: this._config.clientVersionHash ?? 0,
      schemaHash: this._config.schemaHash ?? 0,
      role: this._config.role ?? ClientRole.Player,
    });

    this._room.send(RELAY_BYTES_CHANNEL, pipeline.toUint8Array());
  }

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
      `[RelayInputV2] Initial alignment: server≈${approxServerTick.toFixed(1)}, ` +
      `local=${localTick}, diff=${tickDiff.toFixed(1)} ticks`
    );

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
    if (this._simulation && toTick <= this._simulation.tick) {
      if (this._tickToRollback === undefined || toTick < this._tickToRollback) {
        this._tickToRollback = toTick;
      }
    }
  }

  private unpackBuffersToRpcs(buffers: ArrayBuffer[]): { rpcs: RPC[]; minTick?: number } {
    const receivedRpcs: RPC[] = [];
    let minReceivedTick: number | undefined;

    for (const buf of buffers) {
      const bufPipeline = new BinarySchemaUnpackPipeline(buf);
      const tickInput = bufPipeline.unpack(TickInputStruct);

      if (tickInput.playerSlot === this.playerSlot && tickInput.kind === TickInputKind.Client) {
        continue;
      }

      if (minReceivedTick === undefined || tickInput.tick < minReceivedTick) {
        minReceivedTick = tickInput.tick;
      }

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

    return { rpcs: receivedRpcs, minTick: minReceivedTick };
  }

  private notifyRemoteInputs(rpcs: RPC[]): void {
    if (rpcs.length === 0) return;
    for (const handler of this._remoteInputListeners) {
      handler(rpcs);
    }
  }

  private storeSnapshot(tick: number): void {
    const bytes = this._simulation.mem.exportSnapshot();
    this._snapshotHistory.push({ tick, bytes });

    if (this._snapshotHistory.length > this._snapshotHistoryMax) {
      this._snapshotHistory.shift();
    }
  }

  private pickSnapshot(minTick: number, maxTick: number, maxBytes: number): SnapshotEntry | null {
    for (let i = this._snapshotHistory.length - 1; i >= 0; i -= 1) {
      const entry = this._snapshotHistory[i];
      if (entry.tick < minTick || entry.tick > maxTick) continue;
      if (entry.bytes.byteLength > maxBytes) continue;
      return entry;
    }
    return null;
  }

  private markReady(): void {
    if (this._isReady) return;
    this._isReady = true;
    this._resolveReady();

    if (this._bufferedMessages.length > 0) {
      const queued = [...this._bufferedMessages];
      this._bufferedMessages.length = 0;
      for (const msg of queued) {
        this.handleMessage(msg);
      }
    }
  }
}

function extractArrayBuffer(data: Uint8Array): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}
