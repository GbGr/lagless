// libs/colyseus-rooms/src/lib/relay-colyseus-room.ts

import {
  CancelInputStruct,
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
  PlayerFinishedGameStruct,
  TickInputBuffer,
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
import { InputRegistry, pack128BufferTo2x64, RPC, RPCHistory } from '@lagless/core';

export interface RelayRoomOptions {
  readonly gameId: string;
  readonly maxPlayers: number;
  readonly frameLength: number;
  readonly seatReservationTimeSec?: number;
  readonly inputBufferRetentionTicks?: number;
}

export interface PlayerInfo {
  readonly playerSlot: number;
  readonly connectedAt: number;
  readonly playerId?: string;
  readonly displayName?: string;
  isConnected: boolean;
  joinedAtTick: number;
  finishedGameData?: PlayerFinishedData;
}

export interface PlayerFinishedData {
  readonly timestamp: number;
  readonly verifiedTick: number;
  readonly struct: InferBinarySchemaValues<typeof PlayerFinishedGameStruct>;
  readonly hash: number;
  commited?: boolean;
}

const DEFAULT_SEAT_RESERVATION_SEC = 5;
const DEFAULT_INPUT_BUFFER_RETENTION_TICKS = 600;

export abstract class RelayColyseusRoom extends Room {
  protected _gameId!: string;
  protected _frameLength = 0;
  protected _roomStartedAt = 0;
  protected _nextPlayerSlot = 0;
  protected _isGameStarted = false;

  protected readonly _players: Map<string, PlayerInfo> = new Map();
  protected readonly _sessionIdToPlayerSlot: Map<string, number> = new Map();
  protected readonly _playerSlotToClient: Map<number, Client> = new Map();
  protected readonly _RPCHistory = new RPCHistory();

  private _tickIntervalId: NodeJS.Timeout | null = null;
  private _isDisposed = false;
  private _inputBuffer!: TickInputBuffer;
  private _pendingBroadcastBuffer: Uint8Array[] = [];
  private _seatReservationTimeSec: number = DEFAULT_SEAT_RESERVATION_SEC;

  protected abstract _InputRegistry: InputRegistry;

  /**
   * Called after a player successfully joins the room.
   * Use for game-specific initialization and persistence.
   */
  protected abstract onPlayerJoined(gameId: string, playerInfo: PlayerInfo): Promise<void>;

  /**
   * Called when a player finishes the game (sends finish message).
   */
  protected abstract onPlayerFinishedGame(gameId: string, playerInfo: PlayerInfo): Promise<void>;

  /**
   * Called before the room is disposed.
   * @param gameId - the game UUID
   * @param wasForced - true if room was force-closed, false if all players finished normally
   */
  protected abstract onBeforeDispose(gameId: string, wasForced: boolean): Promise<void>;

  /**
   * Called when a player leaves (disconnect or explicit leave).
   */
  protected abstract onPlayerLeave(gameId: string, playerInfo: PlayerInfo): Promise<void>;

  /**
   * Called before processing each server tick.
   * Override to add custom per-tick logic.
   */
  protected onBeforeTick(serverTick: number): void {
    // Default: no-op
  }

  /**
   * Called after processing each server tick.
   * Override to add custom per-tick logic.
   */
  protected onAfterTick(serverTick: number): void {
    // Default: no-op
  }

  /**
   * Called when room receives an unknown message type.
   * Override to handle custom message types.
   */
  protected onUnknownMessage(client: Client, type: number, pipeline: BinarySchemaUnpackPipeline): void {
    console.warn(`[RelayRoom] Unknown message type ${type} from ${client.sessionId}`);
  }

  /**
   * Called to validate if a tick input should be accepted.
   * Override to add custom validation logic.
   */
  protected validateTickInput(
    client: Client,
    tickInput: InferBinarySchemaValues<typeof TickInputStruct>
  ): boolean {
    const clientSlot = this._sessionIdToPlayerSlot.get(client.sessionId);
    return clientSlot !== undefined && clientSlot === tickInput.playerSlot;
  }

  /**
   * Returns the minimum tick that late joiners should receive buffered inputs from.
   * Override to customize late joiner synchronization behavior.
   */
  protected getMinBufferedTickForLateJoiner(playerInfo: PlayerInfo): number {
    // Default: send all buffered inputs from the start
    return this._inputBuffer.oldestTick;
  }

  public get gameId(): string {
    return this._gameId;
  }

  public get serverTick(): number {
    return this.calculateServerTick(now());
  }

  public get isDisposed(): boolean {
    return this._isDisposed;
  }

  public get connectedPlayerCount(): number {
    let count = 0;
    for (const player of this._players.values()) {
      if (player.isConnected) count++;
    }
    return count;
  }

  public override async onCreate(options: RelayRoomOptions): Promise<void> {
    this._gameId = options.gameId;
    this._frameLength = options.frameLength;
    this._seatReservationTimeSec = options.seatReservationTimeSec ?? DEFAULT_SEAT_RESERVATION_SEC;
    this._roomStartedAt = now();

    this._inputBuffer = new TickInputBuffer(
      options.inputBufferRetentionTicks ?? DEFAULT_INPUT_BUFFER_RETENTION_TICKS
    );

    this.maxClients = options.maxPlayers;
    await this.setPrivate(true);
    this.setSeatReservationTime(this._seatReservationTimeSec);

    this.onMessage(RELAY_BYTES_CHANNEL, this.handleBinaryMessage.bind(this));

    // Start tick loop with drift correction
    this.startTickLoop();

    console.log(`[RelayRoom] Created room ${this._gameId} with ${options.maxPlayers} max players`);
  }

  public override onJoin(client: Client): void {
    const playerSlot = this._nextPlayerSlot++;
    const currentTick = this.serverTick;

    // Send server hello
    this.sendServerHello(client, playerSlot);

    // Register player
    const playerInfo: PlayerInfo = {
      playerSlot,
      playerId: client.auth?.playerId,
      displayName: client.auth?.displayName,
      connectedAt: Date.now(),
      isConnected: true,
      joinedAtTick: currentTick,
    };

    this._sessionIdToPlayerSlot.set(client.sessionId, playerSlot);
    this._players.set(client.sessionId, playerInfo);
    this._playerSlotToClient.set(playerSlot, client);

    // Send buffered inputs to late joiner
    this.sendBufferedInputsToClient(client, playerInfo);

    // Notify subclass
    this.onPlayerJoined(this._gameId, playerInfo).catch(err => {
      console.error(`[RelayRoom] onPlayerJoined error:`, err);
    });

    console.log(`[RelayRoom] Player ${playerSlot} joined at tick ${currentTick}`);
  }

  public override async onLeave(client: Client, consented: boolean): Promise<void> {
    const playerInfo = this._players.get(client.sessionId);

    if (playerInfo) {
      playerInfo.isConnected = false;

      await this.onPlayerLeave(this._gameId, playerInfo).catch(err => {
        console.error(`[RelayRoom] onPlayerLeave error:`, err);
      });
    }

    console.log(`[RelayRoom] Player left (consented: ${consented})`);
  }

  public override async onDispose(): Promise<void> {
    if (!this._isDisposed) {
      this._isDisposed = true;
      await this.onBeforeDispose(this._gameId, true).catch(err => {
        console.error(`[RelayRoom] onBeforeDispose error:`, err);
      });
    }

    this.stopTickLoop();
    this._inputBuffer.clear();

    console.log(`[RelayRoom] Room ${this._gameId} disposed`);
  }

  /**
   * Broadcasts server-generated inputs to all clients.
   * Use for spawning players, game events, etc.
   */
  public sendServerInputFanout(rpcs: ReadonlyArray<RPC>, registry: InputRegistry): void {
    if (rpcs.length === 0) return;

    const inputBuffers: Uint8Array[] = [];

    for (const rpc of rpcs) {
      const buffer = this.packServerInput(rpc, registry);
      inputBuffers.push(buffer);

      // Store in buffer for late joiners
      this._inputBuffer.add(rpc.meta.tick, buffer);
    }

    this.broadcastInputFanout(inputBuffers);
  }

  /**
   * Gets player info by session ID.
   */
  public getPlayerBySessionId(sessionId: string): PlayerInfo | undefined {
    return this._players.get(sessionId);
  }

  /**
   * Gets player info by slot.
   */
  public getPlayerBySlot(slot: number): PlayerInfo | undefined {
    for (const player of this._players.values()) {
      if (player.playerSlot === slot) return player;
    }
    return undefined;
  }

  /**
   * Marks the game as officially started.
   * Call this when all players are ready and the game begins.
   */
  public markGameStarted(): void {
    this._isGameStarted = true;
  }

  private startTickLoop(): void {
    if (this._tickIntervalId !== null) return;

    this._tickIntervalId = setInterval(
      () => this.processTick(),
      this._frameLength
    );
  }

  private stopTickLoop(): void {
    if (this._tickIntervalId !== null) {
      clearInterval(this._tickIntervalId);
      this._tickIntervalId = null;
    }
  }

  private processTick(): void {
    const currentTick = this.serverTick;

    this.onBeforeTick(currentTick);

    // Broadcast pending inputs
    if (this._pendingBroadcastBuffer.length > 0) {
      this.broadcastInputFanout(this._pendingBroadcastBuffer);
      this._pendingBroadcastBuffer = [];
    }

    // Process finished game state
    this.processFinishedGameStates(currentTick);

    // Prune old input buffer entries
    this._inputBuffer.prune(currentTick);

    this.onAfterTick(currentTick);
  }

  private handleBinaryMessage(client: Client, rawBuffer: Buffer): void {
    const buffer = this.extractArrayBuffer(rawBuffer);
    const pipeline = new BinarySchemaUnpackPipeline(buffer);
    const header = pipeline.unpack(HeaderStruct);

    // if (header.version !== WireVersion.V1) {
    //   console.warn(`[RelayRoom] Unsupported wire version ${header.version}`);
    //   return;
    // }

    switch (header.type) {
      case MsgType.Ping:
        this.handlePing(client, pipeline);
        break;
      case MsgType.TickInput:
        this.handleTickInput(client, pipeline, buffer);
        break;
      case MsgType.PlayerFinishedGame:
        this.handlePlayerFinished(client, pipeline);
        break;
      default:
        this.onUnknownMessage(client, header.type, pipeline);
    }
  }

  private handlePing(client: Client, pipeline: BinarySchemaUnpackPipeline): void {
    const ping = pipeline.unpack(PingStruct);
    const serverNow = now();

    const pongPipeline = new BinarySchemaPackPipeline();
    pongPipeline.pack(HeaderStruct, { version: WireVersion.V1, type: MsgType.Pong });
    pongPipeline.pack(PongStruct, {
      cSend: ping.cSend,
      sRecv: serverNow,
      sSend: serverNow,
      sTick: this.calculateServerTick(serverNow),
    });

    client.send(RELAY_BYTES_CHANNEL, pongPipeline.toUint8Array());
  }

  private handleTickInput(
    client: Client,
    pipeline: BinarySchemaUnpackPipeline,
    fullBuffer: ArrayBuffer
  ): void {
    const tickInput = pipeline.unpack(TickInputStruct);
    const currentTick = this.serverTick;

    // Validate sender
    if (!this.validateTickInput(client, tickInput)) {
      console.warn(`[RelayRoom] Invalid tick input from ${client.sessionId}`);
      return;
    }

    // Check if input arrived too late
    if (tickInput.tick <= currentTick) {
      this.sendCancelInput(client, tickInput);
      console.warn(
        `[RelayRoom] Late input cancelled: tick ${tickInput.tick} <= server ${currentTick}`
      );
      return;
    }

    // Extract raw input buffer (includes TickInputStruct + payload)
    const inputBuffer = new Uint8Array(fullBuffer.slice(HeaderStruct.byteLength));

    // Store for late joiners
    this._inputBuffer.add(tickInput.tick, inputBuffer);

    // Queue for broadcast
    this._pendingBroadcastBuffer.push(inputBuffer);

    const rawInputsBuffer = pipeline.sliceRemaining();
    const rawRPCs = InputBinarySchema.unpackBatch(
      this._InputRegistry,
      rawInputsBuffer,
    );
    const rpcs = rawRPCs.map((raw) => {
      return new RPC(
        raw.inputId,
        { tick: tickInput.tick, playerSlot: tickInput.playerSlot, seq: tickInput.seq, ordinal: raw.ordinal },
        raw.values,
      );
    });

    this._RPCHistory.addBatch(rpcs);
  }

  private handlePlayerFinished(client: Client, pipeline: BinarySchemaUnpackPipeline): void {
    const senderSlot = this._sessionIdToPlayerSlot.get(client.sessionId);
    if (senderSlot === undefined) {
      console.warn(`[RelayRoom] Finish from unknown sender ${client.sessionId}`);
      return;
    }

    const hash = pipeline.getFastHash(PlayerFinishedGameStruct);
    const finishData = pipeline.unpack(PlayerFinishedGameStruct);

    const targetClient = this._playerSlotToClient.get(finishData.playerSlot);
    if (!targetClient) {
      console.warn(`[RelayRoom] Finish for unknown player slot ${finishData.playerSlot}`);
      return;
    }

    const playerInfo = this._players.get(targetClient.sessionId);
    if (!playerInfo) return;

    // Only accept finish data if not already set, or if sender is reporting their own finish
    if (!playerInfo.finishedGameData || (playerInfo.playerSlot === senderSlot && !playerInfo.finishedGameData.commited)) {
      playerInfo.finishedGameData = {
        timestamp: Date.now(),
        verifiedTick: finishData.verifiedTick,
        struct: finishData,
        hash,
      };

      console.log(`[RelayRoom] Player ${finishData.playerSlot} finished at tick ${finishData.tick}`);
    }
  }

  private sendServerHello(client: Client, playerSlot: number): void {
    const { seed0, seed1 } = this.getGameSeeds();

    const pipeline = new BinarySchemaPackPipeline();
    pipeline.pack(HeaderStruct, { version: WireVersion.V1, type: MsgType.ServerHello });
    pipeline.pack(ServerHelloStruct, { seed0, seed1, playerSlot });

    client.send(RELAY_BYTES_CHANNEL, pipeline.toUint8Array());
  }

  private sendCancelInput(
    client: Client,
    tickInput: InferBinarySchemaValues<typeof TickInputStruct>
  ): void {
    const pipeline = new BinarySchemaPackPipeline();
    pipeline.pack(HeaderStruct, { version: WireVersion.V1, type: MsgType.CancelInput });
    pipeline.pack(CancelInputStruct, {
      tick: tickInput.tick,
      playerSlot: tickInput.playerSlot,
      seq: tickInput.seq,
    });

    client.send(RELAY_BYTES_CHANNEL, pipeline.toUint8Array());
  }

  private sendBufferedInputsToClient(client: Client, playerInfo: PlayerInfo): void {
    const minTick = this.getMinBufferedTickForLateJoiner(playerInfo);
    const bufferedInputs = this._inputBuffer.getFlattenedFromTick(minTick);

    if (bufferedInputs.length === 0) return;

    const pipeline = new BinarySchemaPackPipeline();
    pipeline.pack(HeaderStruct, { version: WireVersion.V1, type: MsgType.TickInputFanout });
    pipeline.pack(TickInputFanoutStruct, { serverTick: this.serverTick });
    pipeline.appendBuffer(packBatchBuffers(bufferedInputs));

    client.send(RELAY_BYTES_CHANNEL, pipeline.toUint8Array());

    console.log(
      `[RelayRoom] Sent ${bufferedInputs.length} buffered inputs to late joiner (slot ${playerInfo.playerSlot})`
    );
  }

  private broadcastInputFanout(inputBuffers: Uint8Array[]): void {
    if (inputBuffers.length === 0) return;

    const pipeline = new BinarySchemaPackPipeline();
    pipeline.pack(HeaderStruct, { version: WireVersion.V1, type: MsgType.TickInputFanout });
    pipeline.pack(TickInputFanoutStruct, { serverTick: this.serverTick });
    pipeline.appendBuffer(packBatchBuffers(inputBuffers));

    this.broadcast(RELAY_BYTES_CHANNEL, pipeline.toUint8Array());
  }

  private processFinishedGameStates(currentTick: number): void {
    // Notify about newly verified finishes
    for (const playerInfo of this._players.values()) {
      const finishData = playerInfo.finishedGameData;
      if (finishData && !finishData.commited && finishData.verifiedTick < currentTick) {
        this.onPlayerFinishedGame(this._gameId, playerInfo).then(
          () => {
            if (playerInfo.finishedGameData) playerInfo.finishedGameData.commited = true;
          },
          (err) => console.error(`[RelayRoom] onPlayerFinishedGame error:`, err)
        );
      }
    }

    // Check if all connected players have finished
    if (this.shouldDisposeRoom(currentTick)) {
      this.initiateGracefulDispose().catch((err) => {
        console.error(`[RelayRoom] initiateGracefulDispose error:`, err);
      });
    }
  }

  private shouldDisposeRoom(currentTick: number): boolean {
    if (!this._isGameStarted) return false;

    for (const playerInfo of this._players.values()) {
      if (playerInfo.finishedGameData && playerInfo.finishedGameData.verifiedTick >= currentTick) return false;

      if (!playerInfo.isConnected) continue;

      // Player hasn't finished yet
      if (!playerInfo.finishedGameData) return false;

    }

    return true;
  }

  private async initiateGracefulDispose(): Promise<void> {
    if (this._isDisposed) return;

    this._isDisposed = true;
    console.log(`[RelayRoom] All players finished. Initiating graceful dispose.`);

    await this.onBeforeDispose(this._gameId, false).catch(err => {
      console.error(`[RelayRoom] onBeforeDispose error:`, err);
    });

    await this.disconnect();
  }

  protected calculateServerTick(nowMs: number): number {
    return Math.floor((nowMs - this._roomStartedAt) / this._frameLength);
  }

  private extractArrayBuffer(buffer: Buffer): ArrayBuffer {
    return buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    ) as ArrayBuffer;
  }

  private packServerInput(rpc: RPC, registry: InputRegistry): Uint8Array {
    if (rpc.meta.playerSlot === undefined) {
      throw new Error('[RelayRoom] Server RPC must have playerSlot');
    }

    const packedInputs = InputBinarySchema.packBatch(registry, [{
      inputId: rpc.inputId,
      ordinal: rpc.meta.ordinal,
      values: rpc.data,
    }]);

    const pipeline = new BinarySchemaPackPipeline();
    pipeline.pack(TickInputStruct, {
      seq: rpc.meta.seq,
      tick: rpc.meta.tick,
      kind: TickInputKind.Server,
      playerSlot: rpc.meta.playerSlot,
    });
    pipeline.appendBuffer(packedInputs);

    return pipeline.toUint8Array();
  }

  protected getGameSeeds(): { seed0: number; seed1: number } {
    return pack128BufferTo2x64(UUID.fromString(this.gameId).asUint8());
  }
}
