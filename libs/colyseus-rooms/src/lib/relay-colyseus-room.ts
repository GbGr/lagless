import {
  CancelInputStruct,
  ColyseusRelayRoomOptions,
  PlayerFinishedGameStruct,
  HeaderStruct,
  MsgType,
  PingStruct,
  PongStruct,
  RELAY_BYTES_CHANNEL,
  ServerHelloStruct,
  TickInputFanoutStruct,
  TickInputKind,
  TickInputStruct,
  WireVersion,
} from '@lagless/net-wire';
import { Client, Room } from 'colyseus';
import {
  BinarySchemaPackPipeline,
  BinarySchemaUnpackPipeline,
  InferBinarySchemaValues,
  InputBinarySchema,
  packBatchBuffers,
} from '@lagless/binary';
import { now, UUID } from '@lagless/misc';
import { InputRegistry, pack128BufferTo2x64, RPC } from '@lagless/core';
import * as console from 'node:console';

const SIMULATE_LATENCY_MS = 120;
const SEAT_RESERVATION_TIME_MS = 5_000;

export interface PlayerInfo {
  playerSlot: number;
  connectedAt: number;
  isConnected: boolean;
  playerId?: string;
  displayName?: string;
  finishedGameData?: {
    ts: number;
    verifiedTick: number;
    struct: InferBinarySchemaValues<typeof PlayerFinishedGameStruct>;
    hash: number;
  };
}

export abstract class RelayColyseusRoom extends Room {
  private _gameId!: string;
  private _frameLength = 0;
  private _roomStartedAt = 0;
  private _nextPlayerSlot = 0;
  private _intervalId: NodeJS.Timeout | null = null;
  private _isDisposed = false;

  protected readonly _players = new Map<string, PlayerInfo>();
  protected readonly _sessionIdToPlayerSlot = new Map<string, number>();
  protected readonly _playerSlotToClient = new Map<number, Client>();

  private readonly _batchInputBuffer = new Array<Uint8Array>();

  protected abstract onPlayerJoined(gameId: string, playerInfo: PlayerInfo): Promise<void>;

  protected abstract onPlayerFinishedGame(gameId: string, playerInfo: PlayerInfo): Promise<void>;

  protected abstract onBeforeDispose(gameId: string, isDisposed: boolean): Promise<void>;

  protected abstract onPlayerLeave(gameId: string, playerInfo: PlayerInfo): Promise<void>;

  public override async onCreate(options: ColyseusRelayRoomOptions) {
    this._gameId = options.gameId;
    this.maxClients = options.maxPlayers;
    await this.setPrivate(true);
    this.setSeatReservationTime(SEAT_RESERVATION_TIME_MS / 1_000);
    console.log(`Creating relay room with options: ${JSON.stringify(options)}`);
    this._frameLength = options.frameLength;
    this._roomStartedAt = now();
    this.onMessage(RELAY_BYTES_CHANNEL, this._onBytesMessage);
    this._intervalId = setInterval(() => this._tick(), this._frameLength);
  }

  public sendServerInputFanout(rpc: RPC, registry: InputRegistry): void {
    const inputBuffers = [this.prepareServerInput(rpc, registry)];
    const pipeline = new BinarySchemaPackPipeline();
    pipeline.pack(HeaderStruct, { version: WireVersion.V1, type: MsgType.TickInputFanout });
    pipeline.pack(TickInputFanoutStruct, { serverTick: this._serverTick(now()) });
    pipeline.appendBuffer(packBatchBuffers(inputBuffers));
    this.broadcast(RELAY_BYTES_CHANNEL, pipeline.toUint8Array());
  }

  public override onJoin(client: Client): void {
    const pipeline = new BinarySchemaPackPipeline();
    pipeline.pack(HeaderStruct, { version: WireVersion.V1, type: MsgType.ServerHello });
    const playerSlot = this._nextPlayerSlot++;
    const { seed0, seed1 } = pack128BufferTo2x64(UUID.fromString(this._gameId).asUint8());
    pipeline.pack(ServerHelloStruct, {
      seed0,
      seed1,
      playerSlot,
    });
    client.send(RELAY_BYTES_CHANNEL, pipeline.toUint8Array());
    this._sessionIdToPlayerSlot.set(client.sessionId, playerSlot);
    const playerInfo: PlayerInfo = {
      playerSlot,
      playerId: client.auth.playerId,
      displayName: client.auth.displayName,
      connectedAt: Date.now(),
      isConnected: true,
    };
    this._players.set(client.sessionId, playerInfo);
    this._playerSlotToClient.set(playerSlot, client);
    this.onPlayerJoined(this._gameId, playerInfo).catch(console.error);
  }

  public override async onLeave(client: Client, consented: boolean) {
    console.log(`Client ${client.sessionId} left (consented: ${consented})`);
    const playerInfo = this._players.get(client.sessionId);
    if (playerInfo) {
      playerInfo.isConnected = false;
      if (this._gameId) {
        await this.onPlayerLeave(this._gameId, playerInfo);
      }
    }
  }

  public override async onDispose() {
    if (this._gameId) {
      if (!this._isDisposed) {
        this._isDisposed = true;
        await this.onBeforeDispose(this._gameId, true);
      }
    }

    if (this._intervalId) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
  }

  protected _serverTick(nowMs: number): number {
    return Math.ceil((nowMs - this._roomStartedAt) / this._frameLength);
  }

  private _tick = () => {
    this.processPlayersFinishedGame().catch(console.error);
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
      const unpackPipeline = new BinarySchemaUnpackPipeline(
        buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
      );
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
        case MsgType.PlayerFinishedGame:
          this.onFinishGameMessage(client, unpackPipeline).catch(console.error);
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

    const clientPlayerSlot = this._sessionIdToPlayerSlot.get(client.sessionId);
    if (clientPlayerSlot === undefined || clientPlayerSlot !== tickInput.playerSlot) {
      console.warn(
        `Player slot mismatch for client ${client.sessionId}: expected ${clientPlayerSlot}, got ${tickInput.playerSlot}`
      );
      return;
    }

    if (tickInput.tick <= this._serverTick(now())) {
      this.cancelInput(client, tickInput);
      return;
    }

    this._batchInputBuffer.push(new Uint8Array(buffer));

    console.log(
      `Received TickInput Δ = ${this._serverTick(now()) - tickInput.tick} for Tick ${
        tickInput.tick
      } at ServerTick ${this._serverTick(now())}`
    );
  }

  private cancelInput(client: Client, tickInput: InferBinarySchemaValues<typeof TickInputStruct>): void {
    console.warn('Cancel', {
      ti: tickInput.tick,
      sNow: this._serverTick(now()),
      diffToNow: tickInput.tick - this._serverTick(now()),
    });
    const packPipeline = new BinarySchemaPackPipeline();
    packPipeline.pack(HeaderStruct, { version: WireVersion.V1, type: MsgType.CancelInput });
    packPipeline.pack(CancelInputStruct, {
      tick: tickInput.tick,
      playerSlot: tickInput.playerSlot,
      seq: tickInput.seq,
    });

    setTimeout(() => {
      client.send(RELAY_BYTES_CHANNEL, packPipeline.toUint8Array());
    }, SIMULATE_LATENCY_MS / 2);
  }

  private async onFinishGameMessage(client: Client, pipeline: BinarySchemaUnpackPipeline) {
    const roomLifetimeMs = now() - this._roomStartedAt;
    if (roomLifetimeMs < SEAT_RESERVATION_TIME_MS) throw new Error('FinishGame received before room started');

    const senderPlayerSlot = this._sessionIdToPlayerSlot.get(client.sessionId);
    if (senderPlayerSlot === undefined) throw new Error('FinishGame received from unknown playerSlot');

    const finishGameHash = pipeline.getFastHash(PlayerFinishedGameStruct);
    const finishGame = pipeline.unpack(PlayerFinishedGameStruct);

    const finishedGamePlayerClient = this._playerSlotToClient.get(finishGame.playerSlot);
    if (!finishedGamePlayerClient) throw new Error('FinishGame received for unknown client');
    const finishedGamePlayerInfo = this._players.get(finishedGamePlayerClient.sessionId);
    if (!finishedGamePlayerInfo) throw new Error('FinishGame received for unknown playerInfo');

    if (shouldSetFinishGame(finishedGamePlayerInfo, senderPlayerSlot)) {
      console.log(`Player slot ${finishGame.playerSlot} finished game at tick ${finishGame.tick}`);
      finishedGamePlayerInfo.finishedGameData = {
        ts: Date.now(),
        verifiedTick: finishGame.verifiedTick,
        struct: finishGame,
        hash: finishGameHash,
      };
    }
  }

  protected prepareServerInput(rpc: RPC, registry: InputRegistry): Uint8Array {
    if (rpc.meta.playerSlot === undefined) throw new Error('Invalid player slot');
    const packedInputs = InputBinarySchema.packBatch(registry, [
      {
        inputId: rpc.inputId,
        ordinal: rpc.meta.ordinal,
        values: rpc.data,
      },
    ]);
    const tickInputPipeline = new BinarySchemaPackPipeline();
    tickInputPipeline.pack(TickInputStruct, {
      seq: 0,
      tick: rpc.meta.tick,
      kind: TickInputKind.Server,
      playerSlot: rpc.meta.playerSlot,
    });
    tickInputPipeline.appendBuffer(packedInputs);

    return tickInputPipeline.toUint8Array();
  }

  private async processPlayersFinishedGame() {
    const tickNowShifted = this._serverTick(now()) - 1;
    if (tickNowShifted <= 0) return;

    for (const [, playerInfo] of this._players) {
      console.log(`${playerInfo.finishedGameData?.verifiedTick} === ${tickNowShifted}`);
      if (playerInfo.finishedGameData && playerInfo.finishedGameData.verifiedTick === tickNowShifted) {
        this.onPlayerFinishedGame(this._gameId, playerInfo).catch(console.error);
      }
    }

    // check that all players who can finish a current game (connected) have finished
    // and server tick is greater than their finish tick
    let allPlayersFinished = true;

    for (const [, pInfo] of this._players) {
      if (pInfo.isConnected && !pInfo.finishedGameData) {
        allPlayersFinished = false;
        break;
      }
      if (pInfo.finishedGameData && pInfo.finishedGameData.struct.tick > tickNowShifted) {
        allPlayersFinished = false;
        break;
      }
    }

    if (allPlayersFinished) {
      if (this._isDisposed) return;
      this._isDisposed = true;
      console.log('All players finished the game. Disposing room.');
      await this.onBeforeDispose(this._gameId, false);
      await this.disconnect();
    }
  }
}

function shouldSetFinishGame(
  playerInfo: PlayerInfo,
  senderPlayerSlot: number
): boolean {
  return (
    !playerInfo.finishedGameData ||
    playerInfo.playerSlot === senderPlayerSlot
  );

}
