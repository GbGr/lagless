import { AbstractInputProvider, ECSConfig, ECSSimulation, InputRegistry, RPC, seedFrom2x64 } from '@lagless/core';
import { Client, Room } from 'colyseus.js';
import {
  ClockSync,
  ColyseusRelayRoomOptions,
  HeaderStruct,
  InputDelayController,
  MsgType,
  PingStruct,
  PongStruct,
  RELAY_BYTES_CHANNEL,
  ServerHelloStruct,
  TickInputFanoutStruct,
  TickInputStruct,
  WireVersion,
} from '@lagless/net-wire';
import {
  BinarySchemaPackPipeline,
  BinarySchemaUnpackPipeline,
  InferBinarySchemaValues,
  InputBinarySchema, unpackBatchBuffers
} from '@lagless/binary';

export class RelayInputProvider extends AbstractInputProvider {
  private readonly PING_INTERVAL_MS = 1000 / 4;
  private readonly BURST_PING_COUNT = 5;

  public override playerSlot: number;
  private _tickToRollback: number | undefined;
  private _nowFn!: () => number;
  private _pingIntervalId!: NodeJS.Timeout;
  private readonly _clockSync = new ClockSync();
  private readonly _inputDelayController = new InputDelayController();
  public _lastServerTickHint = 0;

  public override getInvalidateRollbackTick(): void | number {
    const tick = this._tickToRollback;
    this._tickToRollback = undefined;
    return tick;
  }

  public static async connect(
    ecsConfig: ECSConfig,
    inputRegistry: InputRegistry,
    relayServerUrl: string
  ): Promise<RelayInputProvider> {
    const client = new Client(relayServerUrl);
    const joinOptions: ColyseusRelayRoomOptions = {
      frameLength: ecsConfig.frameLength,
      maxPlayers: ecsConfig.maxPlayers,
    };
    const room = await client.create('relay', joinOptions);
    const roomMessagesBuffer: Array<Uint8Array> = [];

    const serverHello = await new Promise<InferBinarySchemaValues<typeof ServerHelloStruct>>((resolve, reject) => {
      const timeoutId = setTimeout(() => reject(new Error('ServerHelloTimeout')), 2_000);
      const onMessageSubscribe = room.onMessage(RELAY_BYTES_CHANNEL, (uint8: Uint8Array) => {
        const buffer = uint8.buffer.slice(uint8.byteOffset, uint8.byteOffset + uint8.byteLength) as ArrayBuffer;
        const pipeline = new BinarySchemaUnpackPipeline(buffer);
        const header = pipeline.unpack(HeaderStruct);
        // console.log(`Received message type ${header.type}`);

        if (header.type === MsgType.ServerHello) {
          const serverHello = pipeline.unpack(ServerHelloStruct);

          clearTimeout(timeoutId);
          onMessageSubscribe();
          resolve(serverHello);

          // console.log(`Connected to relay server ${relayServerUrl}`, serverHello);
        } else {
          roomMessagesBuffer.push(uint8);
        }
      });
    });

    const config = new ECSConfig({
      ...ecsConfig,
      seed: seedFrom2x64(serverHello.seed0, serverHello.seed1),
    });

    return new RelayInputProvider(serverHello.playerSlot, config, inputRegistry, room, roomMessagesBuffer);
  }

  constructor(
    playerSlot: number,
    _ecsConfig: ECSConfig,
    _inputRegistry: InputRegistry,
    private _room: Room<unknown>,
    initialMessagesBuffer: Array<Uint8Array>,
  ) {
    super(_ecsConfig, _inputRegistry);
    this.playerSlot = playerSlot;
    this._room.onMessage(RELAY_BYTES_CHANNEL, this._internalOnBytesMessage);
    initialMessagesBuffer.forEach(this._internalOnBytesMessage);
  }

  public override init(simulation: ECSSimulation): void {
    super.init(simulation);
    this._nowFn = simulation.clock.getElapsedTime;
    Promise.resolve().then(() => {
      for (let i = 0; i < this.BURST_PING_COUNT; i++) this.sendPing();
    });
    this._pingIntervalId = setInterval(() => this.sendPing(), this.PING_INTERVAL_MS);
  }

  public override dispose(): void {
    super.dispose();
    if (this._pingIntervalId) clearInterval(this._pingIntervalId);
  }

  public override update(): void {
    super.update();

    if (this._frameRPCBuffer.length === 0) {
      return;
    }

    const packedInputs = InputBinarySchema.packBatch(
      this._inputRegistry,
      this._frameRPCBuffer.map((rpc) => ({
        inputId: rpc.inputId,
        ordinal: rpc.meta.ordinal,
        values: rpc.data,
      }))
    );

    const packPipeline = new BinarySchemaPackPipeline();
    packPipeline.pack(HeaderStruct, { version: WireVersion.V1, type: MsgType.TickInput });
    packPipeline.pack(TickInputStruct, { tick: this._simulation.tick + this._currentInputDelay, playerSlot: this.playerSlot });
    packPipeline.appendBuffer(packedInputs);
    const uint8 = packPipeline.toUint8Array();
    this._room.send(RELAY_BYTES_CHANNEL, uint8);
  }

  private sendPing(): void {
    const packPipeline = new BinarySchemaPackPipeline();
    packPipeline.pack(HeaderStruct, { version: WireVersion.V1, type: MsgType.Ping });
    packPipeline.pack(PingStruct, { cSend: this._nowFn() });
    const uint8 = packPipeline.toUint8Array();
    this._room.send(RELAY_BYTES_CHANNEL, uint8);
  }

  private _internalOnBytesMessage = (uint8: Uint8Array) => {
    const dataView = new DataView(uint8.buffer.slice(uint8.byteOffset, uint8.byteOffset + uint8.byteLength));
    if (!(dataView.buffer instanceof ArrayBuffer)) throw new Error('Invalid array buffer');
    const unpackPipeline = new BinarySchemaUnpackPipeline(dataView.buffer);
    const header = unpackPipeline.unpack(HeaderStruct);

    switch (header.type) {
      case MsgType.Pong:
        this.onPongMessage(unpackPipeline);
        break;
      case MsgType.TickInputFanout:
        this.onTickInputFanoutMessage(unpackPipeline);
        break;
      case MsgType.CancelInput:
        this.onCancelInputMessage(unpackPipeline);
        break;
      default:
        console.warn(`RelayInputProvider: Unsupported message type ${header.type}`);
    }
  };

  private onPongMessage(pipeline: BinarySchemaUnpackPipeline): void {
    const nowMs = this._nowFn();
    const pongData = pipeline.unpack(PongStruct);
    this._clockSync.updateFromPong(nowMs, pongData);
    this._inputDelayController.recompute(
      this._frameLength,
      this._clockSync.rttEwmaMs,
      this._clockSync.jitterEwmaMs,
    );
    this._currentInputDelay = this._inputDelayController.deltaTicks;
    const restoredServerTick = Math.floor(pongData.sTick + Math.round(this._clockSync.rttEwmaMs * 0.5 / this._frameLength));
    this._simulation.clock.phaseNudger.onServerTickHint(restoredServerTick, this._simulation.tick);
    // TODO: remove
    this._lastServerTickHint = restoredServerTick;
  }

  private onTickInputFanoutMessage(pipeline: BinarySchemaUnpackPipeline): void {
    const tickInputFanout = pipeline.unpack(TickInputFanoutStruct);
    const inputsBuffer = pipeline.sliceRemaining();
    const unpackedBuffers = unpackBatchBuffers(inputsBuffer);

    console.log(`[recv] TickInputFanout from serverTick ${tickInputFanout.serverTick}, unpackedBuffers count: ${unpackedBuffers.length}`);

    const allRpcs = new Array<RPC>();
    let minTick = Number.MAX_SAFE_INTEGER;

    for (const unpackedBuffer of unpackedBuffers) {
      const pipeline = new BinarySchemaUnpackPipeline(unpackedBuffer);
      const tickInput = pipeline.unpack(TickInputStruct);
      if (tickInput.playerSlot === this.playerSlot) continue;
      if (tickInput.tick < minTick) minTick = tickInput.tick;
      const inputBuffer = pipeline.sliceRemaining();
      // console.log(`TickInput for tick ${tickInput.tick}, playerSlot ${tickInput.playerSlot}`);
      const rawRPCs = InputBinarySchema.unpackBatch(this._inputRegistry, inputBuffer);
      for (const rawRPC of rawRPCs) {
        const rpc = new RPC(rawRPC.inputId, { tick: tickInput.tick, playerSlot: tickInput.playerSlot, ordinal: 0 }, rawRPC.values);
        allRpcs.push(rpc);
      }
    }

    this._rpcHistory.addBatch(allRpcs);
    if (minTick < Number.MAX_SAFE_INTEGER) {
      this._tickToRollback = minTick;
    }
  }

  private onCancelInputMessage(pipeline: BinarySchemaUnpackPipeline): void {
    const cancelInput = pipeline.unpack(TickInputStruct);
    console.log(`Received CancelInput for tick ${cancelInput.tick}, playerSlot ${cancelInput.playerSlot}`);
    this._rpcHistory.removePlayerInputsAtTick(cancelInput.playerSlot, cancelInput.tick);
    this._tickToRollback = cancelInput.tick;
  }
}
