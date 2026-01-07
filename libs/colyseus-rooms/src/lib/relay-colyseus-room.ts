// libs/colyseus-rooms/src/lib/relay-colyseus-room.ts

import {
  CancelInputStruct,
  ClientReadyStruct,
  HeaderStruct,
  LateJoinBundleStruct,
  MsgType,
  PingStruct,
  PlayerFinishedGameStruct,
  PongStruct,
  RELAY_BYTES_CHANNEL,
  ServerHelloStruct,
  ServerHelloV2Struct,
  SnapshotRequestStruct,
  SnapshotResponseStruct,
  TickInputFanoutStruct,
  TickInputKind,
  TickInputStruct,
  WireVersion,
  TickInputBuffer,
  RoomClosingStruct,
} from '@lagless/net-wire';
import { Client, Room } from 'colyseus';
import {
  BinarySchemaPackPipeline,
  BinarySchemaUnpackPipeline,
  InferBinarySchemaValues,
  InputBinarySchema,
  getFastHash,
  packBatchBuffers,
} from '@lagless/binary';
import { now, UUID } from '@lagless/misc';
import { InputRegistry, pack128BufferTo2x64, RPC, RPCHistory } from '@lagless/core';
import { LateJoinVote, SnapshotVoteCandidate } from './late-join-vote.js';
import { SnapshotAssembler } from '@lagless/net-wire';

export interface RelayRoomOptions {
  readonly gameId: string;
  readonly maxPlayers: number;
  readonly frameLength: number;
  readonly seatReservationTimeSec?: number;
  readonly inputBufferRetentionTicks?: number;
  readonly allowLateJoin?: boolean;
  readonly lateJoinMinVotes?: number;
  readonly lateJoinRequestTimeoutMs?: number;
  readonly lateJoinMaxSnapshotBytes?: number;
  readonly lateJoinPreferredChunkSize?: number;
}

export interface PlayerInfo {
  readonly playerSlot: number;
  readonly connectedAt: number;
  readonly playerId?: string;
  readonly displayName?: string;
  isConnected: boolean;
  joinedAtTick: number;
  finishedGameData?: PlayerFinishedData;
  lastPingMs?: number;
  clientVersionHash?: number;
  schemaHash?: number;
  role?: number;
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
const DEFAULT_LATE_JOIN_TIMEOUT_MS = 4000;
const DEFAULT_LATE_JOIN_MIN_VOTES = 2;
const DEFAULT_LATE_JOIN_MAX_SNAPSHOT_BYTES = 2_000_000;
const DEFAULT_LATE_JOIN_CHUNK_SIZE = 16_384;

interface LateJoinRequestState {
  readonly requestId: number;
  readonly joiner: Client;
  readonly joinerSlot: number;
  readonly minTick: number;
  readonly maxTick: number;
  readonly maxBytes: number;
  readonly preferredChunkSize: number;
  readonly createdAt: number;
  attempts: number;
  timeoutId: NodeJS.Timeout | null;
  vote: LateJoinVote;
  perSenderState: Map<number, SenderSnapshotState>;
}

interface SenderSnapshotState {
  readonly assembler: SnapshotAssembler;
  readonly snapshotTick: number;
  readonly hash32: number;
}

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
  private _allowLateJoin = false;
  private _lateJoinMinVotes = DEFAULT_LATE_JOIN_MIN_VOTES;
  private _lateJoinTimeoutMs = DEFAULT_LATE_JOIN_TIMEOUT_MS;
  private _lateJoinMaxSnapshotBytes = DEFAULT_LATE_JOIN_MAX_SNAPSHOT_BYTES;
  private _lateJoinPreferredChunkSize = DEFAULT_LATE_JOIN_CHUNK_SIZE;
  private _lateJoinRequestSeq = 1;
  private readonly _lateJoinRequests: Map<number, LateJoinRequestState> = new Map();
  private readonly _lateJoinBySession: Map<string, number> = new Map();
  private readonly _lateJoinSnapshotBlacklist: Set<number> = new Set();

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
    this._allowLateJoin = options.allowLateJoin ?? false;
    this._lateJoinMinVotes = options.lateJoinMinVotes ?? DEFAULT_LATE_JOIN_MIN_VOTES;
    this._lateJoinTimeoutMs = options.lateJoinRequestTimeoutMs ?? DEFAULT_LATE_JOIN_TIMEOUT_MS;
    this._lateJoinMaxSnapshotBytes = options.lateJoinMaxSnapshotBytes ?? DEFAULT_LATE_JOIN_MAX_SNAPSHOT_BYTES;
    this._lateJoinPreferredChunkSize = options.lateJoinPreferredChunkSize ?? DEFAULT_LATE_JOIN_CHUNK_SIZE;

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
    this.sendServerHelloV2(client, playerSlot, currentTick);

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

    const isLateJoiner = this._allowLateJoin && this._isGameStarted && currentTick > 0;
    if (isLateJoiner) {
      this.initiateLateJoin(client, playerInfo);
    } else {
      // Send buffered inputs to late joiner
      this.sendBufferedInputsToClient(client, playerInfo);
    }

    // Notify subclass
    this.onPlayerJoined(this._gameId, playerInfo).catch(err => {
      console.error(`[RelayRoom] onPlayerJoined error:`, err);
    });

    console.log(`[RelayRoom] Player ${playerSlot} joined at tick ${currentTick}`);
  }

  public override async onLeave(client: Client, consented: boolean): Promise<void> {
    const playerInfo = this._players.get(client.sessionId);
    const lateJoinRequestId = this._lateJoinBySession.get(client.sessionId);

    if (playerInfo) {
      playerInfo.isConnected = false;

      await this.onPlayerLeave(this._gameId, playerInfo).catch(err => {
        console.error(`[RelayRoom] onPlayerLeave error:`, err);
      });
    }

    if (lateJoinRequestId !== undefined) {
      this.clearLateJoinRequest(lateJoinRequestId);
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
    this.clearAllLateJoinRequests();

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

    if (header.version !== WireVersion.V1 && header.version !== WireVersion.V2) {
      console.warn(`[RelayRoom] Unsupported wire version ${header.version}`);
      return;
    }

    switch (header.type) {
      case MsgType.Ping:
        this.handlePing(client, pipeline, header.version);
        break;
      case MsgType.TickInput:
        this.handleTickInput(client, pipeline, buffer, header.version);
        break;
      case MsgType.PlayerFinishedGame:
        this.handlePlayerFinished(client, pipeline);
        break;
      case MsgType.SnapshotResponse:
        this.handleSnapshotResponse(client, pipeline);
        break;
      case MsgType.ClientReady:
        this.handleClientReady(client, pipeline);
        break;
      default:
        this.onUnknownMessage(client, header.type, pipeline);
    }
  }

  private handlePing(
    client: Client,
    pipeline: BinarySchemaUnpackPipeline,
    version: WireVersion
  ): void {
    const ping = pipeline.unpack(PingStruct);
    const serverNow = now();

    const pongPipeline = new BinarySchemaPackPipeline();
    pongPipeline.pack(HeaderStruct, { version, type: MsgType.Pong });
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
    fullBuffer: ArrayBuffer,
    version: WireVersion
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
      this.sendCancelInput(client, tickInput, version);
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

  private sendServerHelloV2(client: Client, playerSlot: number, serverTick: number): void {
    const { seed0, seed1 } = this.getGameSeeds();

    const pipeline = new BinarySchemaPackPipeline();
    pipeline.pack(HeaderStruct, { version: WireVersion.V2, type: MsgType.ServerHelloV2 });
    pipeline.pack(ServerHelloV2Struct, {
      seed0,
      seed1,
      playerSlot,
      serverTick,
      frameLengthMs: this._frameLength,
      maxPlayers: this.maxClients,
      allowLateJoin: this._allowLateJoin ? 1 : 0,
      wireVersion: WireVersion.V2,
    });

    client.send(RELAY_BYTES_CHANNEL, pipeline.toUint8Array());
  }

  private sendCancelInput(
    client: Client,
    tickInput: InferBinarySchemaValues<typeof TickInputStruct>,
    version: WireVersion
  ): void {
    const pipeline = new BinarySchemaPackPipeline();
    pipeline.pack(HeaderStruct, { version, type: MsgType.CancelInput });
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
    pipeline.pack(HeaderStruct, { version: WireVersion.V2, type: MsgType.TickInputFanout });
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
    pipeline.pack(HeaderStruct, { version: WireVersion.V2, type: MsgType.TickInputFanout });
    pipeline.pack(TickInputFanoutStruct, { serverTick: this.serverTick });
    pipeline.appendBuffer(packBatchBuffers(inputBuffers));

    this.broadcast(RELAY_BYTES_CHANNEL, pipeline.toUint8Array());
  }

  private initiateLateJoin(client: Client, playerInfo: PlayerInfo): void {
    if (this._lateJoinBySession.has(client.sessionId)) return;

    const connectedSenders = Math.max(this.connectedPlayerCount - 1, 0);
    if (connectedSenders <= 0) {
      console.warn('[RelayRoom] No connected players to provide late-join snapshot.');
      this.failLateJoin(client, 1);
      return;
    }

    const requestId = this.nextLateJoinRequestId();
    const minTick = this._inputBuffer.oldestTick;
    const maxTick = this.serverTick;
    const vote = this.createLateJoinVote(connectedSenders);

    const request: LateJoinRequestState = {
      requestId,
      joiner: client,
      joinerSlot: playerInfo.playerSlot,
      minTick,
      maxTick,
      maxBytes: this._lateJoinMaxSnapshotBytes,
      preferredChunkSize: this._lateJoinPreferredChunkSize,
      createdAt: Date.now(),
      attempts: 0,
      timeoutId: null,
      vote,
      perSenderState: new Map(),
    };

    this._lateJoinRequests.set(requestId, request);
    this._lateJoinBySession.set(client.sessionId, requestId);

    this.sendSnapshotRequest(request);
  }

  private sendSnapshotRequest(request: LateJoinRequestState): void {
    const pipeline = new BinarySchemaPackPipeline();
    pipeline.pack(HeaderStruct, { version: WireVersion.V2, type: MsgType.SnapshotRequest });
    pipeline.pack(SnapshotRequestStruct, {
      requestId: request.requestId,
      minTick: request.minTick,
      maxTick: request.maxTick,
      maxBytes: request.maxBytes,
      preferredChunkSize: request.preferredChunkSize,
    });

    const payload = pipeline.toUint8Array();
    let recipients = 0;

    for (const player of this._players.values()) {
      if (!player.isConnected) continue;
      if (player.playerSlot === request.joinerSlot) continue;
      if (this._lateJoinSnapshotBlacklist.has(player.playerSlot)) continue;

      const target = this._playerSlotToClient.get(player.playerSlot);
      if (!target) continue;
      recipients += 1;
      target.send(RELAY_BYTES_CHANNEL, payload);
    }

    if (recipients === 0) {
      console.warn('[RelayRoom] No eligible snapshot senders for late join.');
      this.failLateJoin(request.joiner, 1);
      return;
    }

    request.attempts += 1;
    if (request.timeoutId !== null) {
      clearTimeout(request.timeoutId);
    }

    request.timeoutId = setTimeout(
      () => this.handleLateJoinTimeout(request.requestId),
      this._lateJoinTimeoutMs
    );
  }

  private handleLateJoinTimeout(requestId: number): void {
    const request = this._lateJoinRequests.get(requestId);
    if (!request) return;

    if (request.attempts >= 2) {
      console.warn('[RelayRoom] Late join snapshot vote timed out.');
      this.failLateJoin(request.joiner, 2);
      return;
    }

    const connectedSenders = Math.max(this.connectedPlayerCount - 1, 0);
    request.vote = this.createLateJoinVote(connectedSenders);
    request.perSenderState.clear();
    this.sendSnapshotRequest(request);
  }

  private handleSnapshotResponse(client: Client, pipeline: BinarySchemaUnpackPipeline): void {
    const response = pipeline.unpack(SnapshotResponseStruct);
    const request = this._lateJoinRequests.get(response.requestId);
    if (!request) {
      return;
    }

    const senderSlot = this._sessionIdToPlayerSlot.get(client.sessionId);
    if (senderSlot === undefined) {
      return;
    }

    if (this._lateJoinSnapshotBlacklist.has(senderSlot)) {
      return;
    }

    if (response.snapshotTick < request.minTick || response.snapshotTick > request.maxTick) {
      this._lateJoinSnapshotBlacklist.add(senderSlot);
      return;
    }

    if (response.totalBytes > request.maxBytes) {
      this._lateJoinSnapshotBlacklist.add(senderSlot);
      return;
    }

    const chunkBytes = pipeline.sliceRemaining();
    if (chunkBytes.byteLength === 0) return;

    let senderState = request.perSenderState.get(senderSlot);
    if (!senderState) {
      const assembler = new SnapshotAssembler(response.chunkCount, response.totalBytes);
      senderState = {
        assembler,
        snapshotTick: response.snapshotTick,
        hash32: response.hash32,
      };
      request.perSenderState.set(senderSlot, senderState);
    } else {
      if (senderState.snapshotTick !== response.snapshotTick || senderState.hash32 !== response.hash32) {
        this._lateJoinSnapshotBlacklist.add(senderSlot);
        request.perSenderState.delete(senderSlot);
        return;
      }
    }

    try {
      const complete = senderState.assembler.addChunk(response.chunkIndex, new Uint8Array(chunkBytes));
      if (!complete) return;
    } catch (err) {
      console.warn('[RelayRoom] Snapshot chunk rejected:', err);
      this._lateJoinSnapshotBlacklist.add(senderSlot);
      request.perSenderState.delete(senderSlot);
      return;
    }

    let snapshotBytes: Uint8Array;
    try {
      snapshotBytes = senderState.assembler.assemble();
    } catch (err) {
      console.warn('[RelayRoom] Snapshot assembly failed:', err);
      this._lateJoinSnapshotBlacklist.add(senderSlot);
      request.perSenderState.delete(senderSlot);
      return;
    }

    const computedHash = getFastHash(snapshotBytes.buffer);
    if (computedHash !== response.hash32) {
      this._lateJoinSnapshotBlacklist.add(senderSlot);
      request.perSenderState.delete(senderSlot);
      return;
    }

    const winner = request.vote.addVote(
      senderSlot,
      response.snapshotTick,
      response.hash32,
      snapshotBytes,
      Date.now()
    );

    if (winner) {
      this.completeLateJoin(request, winner);
    }
  }

  private completeLateJoin(request: LateJoinRequestState, winner: SnapshotVoteCandidate): void {
    const joiner = request.joiner;
    const serverTick = this.serverTick;

    const inputsByTick = this._inputBuffer.getFromTick(winner.tick + 1);
    const inputBuffers: Uint8Array[] = [];
    const ticks = [...inputsByTick.keys()].sort((a, b) => a - b);

    for (const tick of ticks) {
      if (tick > serverTick) continue;
      const bucket = inputsByTick.get(tick);
      if (bucket) inputBuffers.push(...bucket);
    }

    const pipeline = new BinarySchemaPackPipeline();
    pipeline.pack(HeaderStruct, { version: WireVersion.V2, type: MsgType.LateJoinBundle });
    pipeline.pack(LateJoinBundleStruct, {
      snapshotTick: winner.tick,
      snapshotHash: winner.hash32,
      snapshotByteLength: winner.bytes.byteLength,
      serverTick,
    });
    pipeline.appendBuffer(
      winner.bytes.buffer.slice(
        winner.bytes.byteOffset,
        winner.bytes.byteOffset + winner.bytes.byteLength
      )
    );
    pipeline.appendBuffer(packBatchBuffers(inputBuffers));

    joiner.send(RELAY_BYTES_CHANNEL, pipeline.toUint8Array());

    this.clearLateJoinRequest(request.requestId);
  }

  private handleClientReady(client: Client, pipeline: BinarySchemaUnpackPipeline): void {
    const ready = pipeline.unpack(ClientReadyStruct);
    const playerInfo = this._players.get(client.sessionId);
    if (!playerInfo) return;

    playerInfo.clientVersionHash = ready.clientVersionHash;
    playerInfo.schemaHash = ready.schemaHash;
    playerInfo.role = ready.role;
  }

  private failLateJoin(client: Client, reason: number): void {
    const pipeline = new BinarySchemaPackPipeline();
    pipeline.pack(HeaderStruct, { version: WireVersion.V2, type: MsgType.RoomClosing });
    pipeline.pack(RoomClosingStruct, { reason, finalTick: this.serverTick });

    client.send(RELAY_BYTES_CHANNEL, pipeline.toUint8Array());
    client.leave();
  }

  private nextLateJoinRequestId(): number {
    return (this._lateJoinRequestSeq++ & 0xffff_ffff) >>> 0;
  }

  private createLateJoinVote(connectedSenders: number): LateJoinVote {
    const majority = Math.floor(connectedSenders / 2) + 1;
    const minVotes = Math.max(Math.min(this._lateJoinMinVotes, connectedSenders), 1);
    return new LateJoinVote(majority, minVotes);
  }

  private clearLateJoinRequest(requestId: number): void {
    const request = this._lateJoinRequests.get(requestId);
    if (!request) return;

    if (request.timeoutId !== null) {
      clearTimeout(request.timeoutId);
    }

    this._lateJoinRequests.delete(requestId);
    this._lateJoinBySession.delete(request.joiner.sessionId);
  }

  private clearAllLateJoinRequests(): void {
    for (const requestId of this._lateJoinRequests.keys()) {
      this.clearLateJoinRequest(requestId);
    }
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

    this.broadcastRoomClosing(0, this.serverTick);

    await this.onBeforeDispose(this._gameId, false).catch(err => {
      console.error(`[RelayRoom] onBeforeDispose error:`, err);
    });

    await this.disconnect();
  }

  private broadcastRoomClosing(reason: number, finalTick: number): void {
    const pipeline = new BinarySchemaPackPipeline();
    pipeline.pack(HeaderStruct, { version: WireVersion.V2, type: MsgType.RoomClosing });
    pipeline.pack(RoomClosingStruct, { reason, finalTick });

    this.broadcast(RELAY_BYTES_CHANNEL, pipeline.toUint8Array());
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
