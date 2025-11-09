import {
  CancelInputStruct,
  ColyseusRelayRoomOptions,
  HeaderStruct,
  MsgType,
  PingStruct,
  PongStruct,
  RELAY_BYTES_CHANNEL,
  ServerHelloStruct,
  TickInputFanoutStruct,
  TickInputStruct,
  WireVersion,
} from '@lagless/net-wire';
import { Client, Room } from 'colyseus';
import {
  BinarySchemaPackPipeline, BinarySchemaUnpackPipeline, InferBinarySchemaValues, packBatchBuffers
} from '@lagless/binary';
import { now } from '@lagless/misc';
import { generate2x64Seed } from '@lagless/core';

const SIMULATE_LATENCY_MS = 120;
// const DEBUG_CANCEL_RATE = 0.05;

export class RelayColyseusRoom extends Room {
  private _frameLength = 0;
  private _roomStartedAt = 0;
  private _nextPlayerSlot = 0;
  private _intervalId: NodeJS.Timeout | null = null;

  private readonly _batchInputBuffer = new Array<Uint8Array>();

  public override onCreate(options: ColyseusRelayRoomOptions): void {
    console.log(`Creating relay room with options: ${JSON.stringify(options)}`);
    this.maxClients = options.maxPlayers;
    this._frameLength = options.frameLength;
    this._roomStartedAt = now();
    this.onMessage(RELAY_BYTES_CHANNEL, this._onBytesMessage);
    this._intervalId = setInterval(() => this._tick(), this._frameLength);
  }

  public override onJoin(client: Client): void {
    console.log(`Client ${client.sessionId} joined`);
    const pipeline = new BinarySchemaPackPipeline();
    pipeline.pack(HeaderStruct, { version: WireVersion.V1, type: MsgType.ServerHello });
    const [ seed0, seed1 ] = generate2x64Seed();
    pipeline.pack(ServerHelloStruct, {
      seed0,
      seed1,
      playerSlot: this._nextPlayerSlot++,
    });
    client.send(RELAY_BYTES_CHANNEL, pipeline.toUint8Array());
  }

  public override onDispose(): void {
    if (this._intervalId) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
  }

  private _serverTick(nowMs: number): number {
    return Math.ceil((nowMs - this._roomStartedAt) / this._frameLength);
  }

  private _tick = () => {
    if (this._batchInputBuffer.length === 0) return;

    const pipeline = new BinarySchemaPackPipeline();
    pipeline.pack(HeaderStruct, { version: WireVersion.V1, type: MsgType.TickInputFanout });
    pipeline.pack(TickInputFanoutStruct, { serverTick: this._serverTick(now()) });
    pipeline.appendBuffer(packBatchBuffers(this._batchInputBuffer));

    setTimeout(() => {
      this.broadcast(RELAY_BYTES_CHANNEL, pipeline.toUint8Array());
    }, SIMULATE_LATENCY_MS / 2);

    this._batchInputBuffer.length = 0;
  };

  private _onBytesMessage = (client: Client, buffer: Buffer) => {
    setTimeout(() => {
      if (!(buffer.buffer instanceof ArrayBuffer)) throw new Error('Invalid array buffer');
      const unpackPipeline = new BinarySchemaUnpackPipeline(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
      const header = unpackPipeline.unpack(HeaderStruct);

      if (header.version !== WireVersion.V1) {
        console.warn(`RelayColyseusRoom: Unsupported wire version ${header.version} from client ${client.sessionId}`);
        return;
      }

      // console.log(`Received message type ${header.type} from client ${client.sessionId}`);

      switch (header.type) {
        case MsgType.Ping:
          this.onPingMessage(client, unpackPipeline);
          break;
        case MsgType.TickInput:
          this.onTickInputMessage(client, unpackPipeline);
          break;
        default:
          console.warn(`RelayColyseusRoom: Unsupported message type ${header.type}`);
          break;
      }

    }, SIMULATE_LATENCY_MS / 2);
  };

  private onPingMessage(client: Client, pipeline: BinarySchemaUnpackPipeline): void {
    const ping = pipeline.unpack(PingStruct);
    const pongPipeline = new BinarySchemaPackPipeline();
    pongPipeline.pack(HeaderStruct, { version: WireVersion.V1, type: MsgType.Pong });
    pongPipeline.pack(PongStruct, {
      cSend: ping.cSend,
      sRecv: now(),
      sSend: now(),
      sTick: this._serverTick(now()),
    });
    setTimeout(() => {
      client.send(RELAY_BYTES_CHANNEL, pongPipeline.toUint8Array());
    }, SIMULATE_LATENCY_MS / 2);
  }

  private onTickInputMessage(client: Client, pipeline: BinarySchemaUnpackPipeline): void {
    const buffer = pipeline.sliceRemaining();
    const tickInput = pipeline.unpack(TickInputStruct);

    // if (Math.random() < DEBUG_CANCEL_RATE) {
    //   setTimeout(() => this.cancelInput(client, tickInput), SIMULATE_LATENCY_MS);
    //   return;
    // }

    if (tickInput.tick <= this._serverTick(now())) {
      this.cancelInput(client, tickInput);
      return;
    }

    this._batchInputBuffer.push(new Uint8Array(buffer));

    console.log(`Received TickInput for Tick ${tickInput.tick} at ServerTick ${this._serverTick(now())}`);
  }

  private cancelInput(client: Client, tickInput: InferBinarySchemaValues<typeof TickInputStruct>): void {
    console.warn('Cancel', {
      ti: tickInput.tick,
      sNow: this._serverTick(now()),
      diffToNow: tickInput.tick - this._serverTick(now()),
    });
    const pipeline = new BinarySchemaPackPipeline();
    pipeline.pack(HeaderStruct, { version: WireVersion.V1, type: MsgType.CancelInput });
    pipeline.pack(CancelInputStruct, { tick: tickInput.tick, playerSlot: tickInput.playerSlot });

    setTimeout(() => {
      client.send(RELAY_BYTES_CHANNEL, pipeline.toUint8Array());
    }, SIMULATE_LATENCY_MS / 2);
  }
}
