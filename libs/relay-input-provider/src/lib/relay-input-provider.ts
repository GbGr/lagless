import { AbstractInputProvider, ECSConfig, ECSSimulation, InputRegistry, RPC, seedFrom2x64 } from '@lagless/core';
import { Client, Room, SeatReservation } from 'colyseus.js';
import {
  ClockSync,
  HeaderStruct,
  InputDelayController,
  MsgType,
  PingStruct,
  PongStruct,
  RELAY_BYTES_CHANNEL,
  ServerHelloStruct,
  TickInputFanoutStruct,
  TickInputStruct,
  CancelInputStruct,
  WireVersion,
  TickInputKind,
} from '@lagless/net-wire';
import {
  BinarySchemaPackPipeline,
  BinarySchemaUnpackPipeline,
  InferBinarySchemaValues,
  InputBinarySchema,
  unpackBatchBuffers,
} from '@lagless/binary';
import { RelayTelemetry, RelayTelemetrySnapshot } from './relay-telemetry.js';

export class RelayInputProvider extends AbstractInputProvider {
  private readonly PING_INTERVAL_MS = 1000 / 4;
  private readonly BURST_PING_COUNT = 5;

  public override playerSlot: number;
  private _tickToRollback: number | undefined;
  private _nowFn!: () => number;
  private _pingIntervalId!: NodeJS.Timeout;

  private readonly _clockSync = new ClockSync();
  private readonly _inputDelayController = new InputDelayController();

  private _lastServerTickHint = 0;

  private readonly _telemetry = new RelayTelemetry();

  public override getInvalidateRollbackTick(): void | number {
    const tick = this._tickToRollback;
    this._tickToRollback = undefined;
    if (tick !== undefined) this._telemetry.onRollback();
    return tick;
  }

  public getTelemetrySnapshot(): Readonly<RelayTelemetrySnapshot> {
    return this._telemetry.snapshot();
  }

  public static async connect(
    ecsConfig: ECSConfig,
    inputRegistry: InputRegistry,
    client: Client,
    seatReservation: SeatReservation,
  ): Promise<RelayInputProvider> {
    const room = await client.consumeSeatReservation(seatReservation);

    const roomMessagesBuffer: Array<Uint8Array> = [];

    const serverHello = await new Promise<InferBinarySchemaValues<typeof ServerHelloStruct>>((resolve, reject) => {
      const timeoutId = setTimeout(() => reject(new Error('ServerHelloTimeout')), 2_000);
      const onMessageSubscribe = room.onMessage(RELAY_BYTES_CHANNEL, (uint8: Uint8Array) => {
        const buffer = uint8.buffer.slice(uint8.byteOffset, uint8.byteOffset + uint8.byteLength) as ArrayBuffer;
        const pipeline = new BinarySchemaUnpackPipeline(buffer);
        const header = pipeline.unpack(HeaderStruct);
        if (header.type === MsgType.ServerHello) {
          const serverHello = pipeline.unpack(ServerHelloStruct);
          clearTimeout(timeoutId);
          onMessageSubscribe();
          resolve(serverHello);
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

  public constructor(
    playerSlot: number,
    _ecsConfig: ECSConfig,
    _inputRegistry: InputRegistry,
    private readonly _room: Room<unknown>,
    private readonly _initialMessagesBuffer: Array<Uint8Array>
  ) {
    super(_ecsConfig, _inputRegistry);
    this.playerSlot = playerSlot;
  }

  public override init(simulation: ECSSimulation): void {
    if (this._disposed) {
      console.warn('RelayInputProvider: init called after dispose');
      return;
    }
    super.init(simulation);
    this._nowFn = simulation.clock.getElapsedTime;
    Promise.resolve().then(() => {
      for (let i = 0; i < this.BURST_PING_COUNT; i++) this.sendPing();
    });
    this._pingIntervalId = setInterval(() => this.sendPing(), this.PING_INTERVAL_MS);
    this._room.onMessage(RELAY_BYTES_CHANNEL, this._internalOnBytesMessage);
    this._initialMessagesBuffer.forEach(this._internalOnBytesMessage);
  }

  public override dispose(): void {
    super.dispose();
    if (this._pingIntervalId) clearInterval(this._pingIntervalId);
  }

  public override update(): void {
    super.update();

    this._telemetry.onState(this._simulation.tick, this._lastServerTickHint || null, this._simulation.tick + this._currentInputDelay);

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

    const firstRPC = this._frameRPCBuffer[0];

    const packPipeline = new BinarySchemaPackPipeline();
    packPipeline.pack(HeaderStruct, { version: WireVersion.V1, type: MsgType.TickInput });
    packPipeline.pack(TickInputStruct, {
      tick: firstRPC.meta.tick,
      playerSlot: this.playerSlot,
      kind: TickInputKind.Client,
      seq: firstRPC.meta.seq,
    });
    packPipeline.appendBuffer(packedInputs);
    this._room.send(RELAY_BYTES_CHANNEL, packPipeline.toUint8Array());

    this._telemetry.onSend('input');
  }

  private sendPing(): void {
    const packPipeline = new BinarySchemaPackPipeline();
    packPipeline.pack(HeaderStruct, { version: WireVersion.V1, type: MsgType.Ping });
    packPipeline.pack(PingStruct, { cSend: this._nowFn() });
    this._room.send(RELAY_BYTES_CHANNEL, packPipeline.toUint8Array());
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
    const pong = pipeline.unpack(PongStruct);

    this._clockSync.updateFromPong(nowMs, pong);
    this._inputDelayController.recompute(
      this._frameLength,
      this._clockSync.rttEwmaMs,
      this._clockSync.jitterEwmaMs,
    );
    this._currentInputDelay = this._inputDelayController.deltaTicks;

    // const serverNow = this._clockSync.serverNowMs(nowMs);
    // const advTicksTheta = Math.max(0, Math.floor((serverNow - pong.sSend) / this._frameLength));
    // const hintTheta = pong.sTick + advTicksTheta;
    //
    // const halfRttTicks = Math.max(0, Math.floor((this._clockSync.rttEwmaMs * 0.5) / this._frameLength));
    // const hintHalfRtt = pong.sTick + halfRttTicks;
    //
    // const wanted = Math.max(hintTheta, hintHalfRtt);
    // const prev = this._lastServerTickHint | 0;
    // const hinted = Math.max(prev, wanted); // monotonic non-decreasing
    //
    // this._simulation.clock.phaseNudger.onServerTickHint(hinted, this._simulation.tick);
    // this._lastServerTickHint = hinted;

    this._simulation.clock.phaseNudger.onServerTickHint(pong.sTick + this._clockSync.rttEwmaMs * 0.5 / this._frameLength, this._simulation.tick);
    this._lastServerTickHint = pong.sTick + this._clockSync.rttEwmaMs * 0.5 / this._frameLength;

    this._telemetry.onPong(this._clockSync.rttEwmaMs, this._clockSync.jitterEwmaMs);
    this._telemetry.onDelta(this._currentInputDelay);
  }

  private onTickInputFanoutMessage(pipeline: BinarySchemaUnpackPipeline): void {
    pipeline.unpack(TickInputFanoutStruct);

    const inputsBuffer = pipeline.sliceRemaining();
    const unpackedBuffers = unpackBatchBuffers(inputsBuffer);

    this._telemetry.onFanout(unpackedBuffers.length);

    const allRpcs: RPC[] = [];
    let minTick = Number.MAX_SAFE_INTEGER;

    for (const buf of unpackedBuffers) {
      const p2 = new BinarySchemaUnpackPipeline(buf);
      const ti = p2.unpack(TickInputStruct);
      if (ti.playerSlot === this.playerSlot && ti.kind === TickInputKind.Client) continue;
      if (ti.tick < minTick) minTick = ti.tick;

      const payload = p2.sliceRemaining();
      const rawRPCs = InputBinarySchema.unpackBatch(this._inputRegistry, payload);
      for (const r of rawRPCs) {
        const rpc = new RPC(r.inputId, { tick: ti.tick, playerSlot: ti.playerSlot, seq: ti.seq, ordinal: 0 }, r.values);
        allRpcs.push(rpc);
        console.log(`Received RPC ${rpc.inputId} at tick ${rpc.meta.tick}[${this._simulation.tick}], playerSlot ${rpc.meta.playerSlot}`);
      }
    }

    this._rpcHistory.addBatch(allRpcs);
    if (minTick < Number.MAX_SAFE_INTEGER) {
      this.updateTickToRollback(minTick);
      this._telemetry.onRollback();
    }
  }

  private onCancelInputMessage(pipeline: BinarySchemaUnpackPipeline): void {
    const cancelInput = pipeline.unpack(CancelInputStruct);
    console.log(`Received CancelInput for tick ${cancelInput.tick}, playerSlot ${cancelInput.playerSlot}, seq ${cancelInput.seq}`);
    this._rpcHistory.removePlayerInputsAtTick(cancelInput.playerSlot, cancelInput.tick, cancelInput.seq);
    this.updateTickToRollback(cancelInput.tick);
    this._telemetry.onCancel();
  }

  private updateTickToRollback(tick: number): void {
    if (this._tickToRollback === undefined || tick < this._tickToRollback) {
      this._tickToRollback = tick;
      this._telemetry.onRollback();
    }
  }
}
