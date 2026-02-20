import { createLogger } from '@lagless/misc';
import {
  TickInputKind, HeaderSchema,
  packServerHello, packPong, packStateResponse,
} from '@lagless/net-wire';
import { InputBinarySchema, LE } from '@lagless/binary';
import { ServerClock } from './server-clock.js';
import { InputHandler, type ValidatedInput } from './input-handler.js';
import { StateTransfer, type StateTransferResult } from './state-transfer.js';
import { PlayerConnection } from './player-connection.js';
import { LatencySimulator } from './latency-simulator.js';
import {
  type MatchId, type PlayerId, type PlayerSlot, type PlayerInfo,
  type RoomTypeConfig, type RoomHooks, type RoomContext, type IWebSocket,
  type InputRegistry, LeaveReason, SERVER_SLOT,
} from './types.js';

const log = createLogger('RelayRoom');

// ─────────────────────────────────────────────────────────────
// RelayRoom
// ─────────────────────────────────────────────────────────────

/**
 * Manages one match room. Sealed by design — use RoomHooks for game-specific behavior.
 */
export class RelayRoom {
  private readonly _clock: ServerClock;
  private readonly _inputHandler: InputHandler;
  private readonly _stateTransfer: StateTransfer;
  private readonly _connections = new Map<PlayerSlot, PlayerConnection>();
  private readonly _playersByPlayerId = new Map<PlayerId, PlayerConnection>();
  private readonly _results = new Map<PlayerSlot, unknown>();
  private readonly _serverEventJournal: ValidatedInput[] = [];
  private readonly _context: RoomContextImpl;
  private readonly _createdAt: number;
  private readonly _seed0: number;
  private readonly _seed1: number;
  private readonly _scopeJson: string;
  private readonly _inputRegistry: InputRegistry;

  private _disposed = false;
  private _reconnectTimer: ReturnType<typeof setInterval> | null = null;
  private _serverSeq = 1;
  private _latencySimulator: LatencySimulator | null = null;

  constructor(
    public readonly matchId: MatchId,
    private readonly _config: RoomTypeConfig,
    private readonly _hooks: RoomHooks<unknown>,
    inputRegistry: InputRegistry,
    players: ReadonlyArray<{
      playerId: PlayerId;
      isBot: boolean;
      metadata: Record<string, unknown>;
    }>,
    seed0: number,
    seed1: number,
    scopeJson = '{}',
  ) {
    this._createdAt = performance.now();
    this._seed0 = seed0;
    this._seed1 = seed1;
    this._scopeJson = scopeJson;
    this._inputRegistry = inputRegistry;
    this._clock = new ServerClock(_config.tickRateHz);
    this._inputHandler = new InputHandler(this._clock, _config);
    this._stateTransfer = new StateTransfer(_config.stateTransferTimeoutMs);
    this._context = new RoomContextImpl(this);

    // Initialize player slots
    let slot = 0;
    for (const p of players) {
      const info: PlayerInfo = {
        playerId: p.playerId,
        slot,
        isBot: p.isBot,
        metadata: Object.freeze({ ...p.metadata }),
      };
      const conn = new PlayerConnection(info, null);
      this._connections.set(slot, conn);
      this._playersByPlayerId.set(p.playerId, conn);
      slot++;
    }

    // Start reconnect expiry checker
    if (_config.reconnectTimeoutMs > 0) {
      this._reconnectTimer = setInterval(
        () => this.checkReconnectTimeouts(),
        1000,
      );
    }

    log.info(`Room ${matchId} created with ${players.length} players`);
    this._hooks.onRoomCreated?.(this._context);

    // Emit join events for bots — they never connect via WebSocket
    // but the simulation needs PlayerJoined server events for them
    for (const conn of this._connections.values()) {
      if (conn.isBot) {
        this._hooks.onPlayerJoin?.(this._context, conn.info);
      }
    }
  }

  // ─── Public getters ────────────────────────────────────

  public get isDisposed(): boolean { return this._disposed; }
  public get tick(): number { return this._clock.tick; }
  public get config(): Readonly<RoomTypeConfig> { return this._config; }
  public get context(): RoomContext { return this._context; }
  public get createdAt(): number { return this._createdAt; }

  public get latencySimulator(): LatencySimulator | null { return this._latencySimulator; }
  public set latencySimulator(sim: LatencySimulator | null) { this._latencySimulator = sim; }

  public getConnectedHumanCount(): number {
    let count = 0;
    for (const c of this._connections.values()) {
      if (c.isConnected && !c.isBot) count++;
    }
    return count;
  }

  public getTotalHumanCount(): number {
    let count = 0;
    for (const c of this._connections.values()) {
      if (!c.isBot) count++;
    }
    return count;
  }

  // ─── Internal API (used by RoomContextImpl) ───────────

  /** @internal */
  public getPlayerInfos(): ReadonlyArray<PlayerInfo> {
    const result: PlayerInfo[] = [];
    for (const conn of this._connections.values()) {
      result.push(conn.info);
    }
    return result;
  }

  /** @internal */
  public isSlotConnected(slot: PlayerSlot): boolean {
    return this._connections.get(slot)?.isConnected ?? false;
  }

  /** @internal */
  public sendToSlot(slot: PlayerSlot, message: Uint8Array): void {
    this._connections.get(slot)?.send(message);
  }

  /** @internal */
  public broadcastToAll(message: Uint8Array): void {
    for (const conn of this._connections.values()) {
      conn.send(message);
    }
  }

  /** @internal */
  public requestEndMatch(): void {
    this.endMatch();
  }

  // ─── Connection Handling ───────────────────────────────

  public async handlePlayerConnect(
    playerId: PlayerId,
    ws: IWebSocket,
  ): Promise<boolean> {
    if (this._disposed) return false;

    const conn = this._playersByPlayerId.get(playerId);
    if (!conn) {
      log.warn(`Unknown player ${playerId} tried to connect to room ${this.matchId}`);
      return false;
    }

    if (conn.isConnected) {
      log.warn(`Player ${playerId} already connected to room ${this.matchId}`);
      return false;
    }

    // TODO: make sure all fine here if OK - then fix log on first join which logs "reconnect" instead of "join"
    // const isReconnect = conn.isDisconnected;
    const isReconnect = false;

    if (isReconnect) {
      const canReconnect = this._hooks.shouldAcceptReconnect?.(this._context, playerId) ?? true;
      if (!canReconnect) {
        log.info(`Reconnect denied for player ${playerId}`);
        return false;
      }
    }

    conn.connect(ws);

    // Send ServerHello
    const helloMessage = this.buildServerHello(conn.slot);
    conn.send(helloMessage);
    log.info(`ServerHello sent to slot=${conn.slot} serverTick=${this._clock.tick}`);

    // Replay server event journal so the new player receives all
    // prior server events (e.g. PlayerJoined for earlier players)
    log.info(`Journal replay: ${this._serverEventJournal.length} events to slot=${conn.slot}`);
    this._inputHandler.sendInputBatchToPlayer(this._serverEventJournal, conn);

    // Late-join: transfer state from other clients
    if (isReconnect && this._config.lateJoinEnabled) {
      const stateResult = await this._stateTransfer.requestState(
        this._connections,
        conn.slot,
      );
      if (stateResult) {
        this.sendStateToPlayer(conn, stateResult);
      }
    }

    log.info(`Player ${playerId} ${isReconnect ? 'reconnected to' : 'joined'} room ${this.matchId} (slot=${conn.slot})`);
    this._hooks.onPlayerJoin?.(this._context, conn.info);

    return true;
  }

  public handlePlayerDisconnect(playerId: PlayerId): void {
    const conn = this._playersByPlayerId.get(playerId);
    if (!conn || !conn.isConnected) return;

    if (this._config.reconnectTimeoutMs > 0) {
      conn.markDisconnected();
    } else {
      conn.markGone();
    }

    log.info(`Player ${playerId} disconnected from room ${this.matchId}`);
    this._hooks.onPlayerLeave?.(this._context, conn.info, LeaveReason.Disconnected);

    this.checkMatchEnd();
  }

  // ─── Message Handling ─────────────────────────────────

  public handleMessage(playerId: PlayerId, data: ArrayBuffer): void {
    const conn = this._playersByPlayerId.get(playerId);
    if (!conn || !conn.isConnected) {
      log.warn(`handleMessage: player=${playerId} conn=${!!conn} isConnected=${conn?.isConnected}`);
      return;
    }

    if (data.byteLength < HeaderSchema.byteLength) {
      log.warn(`handleMessage: data too short (${data.byteLength} bytes)`);
      return;
    }

    const view = new DataView(data);
    const msgType = view.getUint8(1);

    switch (msgType) {
      case 9: // MsgType.TickInputBatch
        this.handleTickInputBatch(conn, data);
        break;
      case 4: // MsgType.Ping
        this.handlePing(conn, data);
        break;
      case 8: // MsgType.PlayerFinished
        this.handlePlayerFinished(conn, data);
        break;
      case 7: // MsgType.StateResponse
        this.handleStateResponse(conn, data);
        break;
      default:
        log.warn(`Unknown message type ${msgType} from player ${playerId} (dataLen=${data.byteLength})`);
    }
  }

  // ─── Disposal ─────────────────────────────────────────

  public async dispose(): Promise<void> {
    if (this._disposed) return;
    this._disposed = true;

    if (this._reconnectTimer) {
      clearInterval(this._reconnectTimer);
      this._reconnectTimer = null;
    }

    this._stateTransfer.dispose();

    log.info(`Room ${this.matchId} disposing`);
    await this._hooks.onRoomDisposed?.(this._context);

    for (const conn of this._connections.values()) {
      conn.markGone();
    }

    this._connections.clear();
    this._playersByPlayerId.clear();
  }

  // ─── Server Events (called via RoomContext) ────────────

  /** @internal - called by RoomContextImpl */
  public _emitServerEvent(
    inputId: number,
    data: Record<string, number | ArrayLike<number>>,
    tick: number,
  ): void {
    // For server events, we pack: inputId (u8) + data fields
    // The payload format matches InputBinarySchema convention
    // but we keep it simple: just the raw bytes the caller provides

    const payloadArrayBuffer = InputBinarySchema.packBatch(this._inputRegistry, [
      {
        inputId,
        ordinal: 0,
        values: data,
      },
    ]);

    // TODO: proper InputBinarySchema packing when game provides registry
    const payload = new Uint8Array(payloadArrayBuffer); // placeholder

    const input: ValidatedInput = {
      tick,
      playerSlot: SERVER_SLOT,
      seq: this._serverSeq++,
      kind: TickInputKind.Server,
      payload,
    };

    this._serverEventJournal.push(input);
    this._inputHandler.broadcastInput(input, this._connections);
  }

  // ─── Private: Message Handlers ────────────────────────

  private handleTickInputBatch(conn: PlayerConnection, raw: ArrayBuffer): void {
    const results = this._inputHandler.validateClientInputBatch(conn.slot, raw);

    const accepted: ValidatedInput[] = [];
    for (const result of results) {
      if (result.accepted) {
        accepted.push(result.input);
      } else {
        this._inputHandler.sendCancel(conn, result.tick, result.seq, result.reason);
      }
    }

    if (accepted.length > 0) {
      const broadcast = () => this._inputHandler.broadcastInputBatch(accepted, this._connections);
      if (this._latencySimulator) {
        this._latencySimulator.apply(broadcast);
      } else {
        broadcast();
      }
    }
  }

  private handlePing(conn: PlayerConnection, raw: ArrayBuffer): void {
    const view = new DataView(raw);
    const cSend = view.getFloat64(HeaderSchema.byteLength, LE);
    const now = performance.now();

    const pong = packPong({
      cSend,
      sRecv: now,
      sSend: now,
      sTick: this._clock.tick,
    });

    const send = () => conn.send(pong);
    if (this._latencySimulator) {
      this._latencySimulator.apply(send);
    } else {
      send();
    }
  }

  private handlePlayerFinished(conn: PlayerConnection, raw: ArrayBuffer): void {
    const view = new DataView(raw);
    const offset = HeaderSchema.byteLength;
    const tick = view.getUint32(offset, LE);
    // offset + 4: playerSlot (u8) — already known from conn.slot
    const payloadLength = view.getUint16(offset + 5, LE);
    const payload = new Uint8Array(raw, offset + 7, payloadLength);

    // Store raw payload as result (game-specific parsing happens in hooks)
    this._results.set(conn.slot, payload.slice());

    log.info(`Player ${conn.playerId} finished at tick ${tick}`);
    this._hooks.onPlayerFinished?.(this._context, conn.info, payload.slice());

    this.checkMatchEnd();
  }

  private handleStateResponse(conn: PlayerConnection, raw: ArrayBuffer): void {
    const view = new DataView(raw);
    const offset = HeaderSchema.byteLength;
    const requestId = view.getUint32(offset, LE);
    const tick = view.getUint32(offset + 4, LE);
    const hash = view.getUint32(offset + 8, LE);
    const stateLength = view.getUint32(offset + 12, LE);
    const state = raw.slice(offset + 16, offset + 16 + stateLength);

    this._stateTransfer.receiveResponse(conn.slot, requestId, tick, hash, state);
  }

  // ─── Private: Lifecycle ────────────────────────────────

  private checkMatchEnd(): void {
    const connectedHumans = this.getConnectedHumanCount();

    if (connectedHumans === 0) {
      this.endMatch();
      return;
    }

    const totalHumans = this.getTotalHumanCount();
    let finishedOrGone = 0;
    for (const conn of this._connections.values()) {
      if (conn.isBot) continue;
      if (this._results.has(conn.slot) || conn.isGone) finishedOrGone++;
    }

    if (finishedOrGone >= totalHumans) {
      this.endMatch();
    }
  }

  private async endMatch(): Promise<void> {
    log.info(`Match ${this.matchId} ending`);
    await this._hooks.onMatchEnd?.(this._context, this._results);
    await this.dispose();
  }

  private checkReconnectTimeouts(): void {
    for (const conn of this._connections.values()) {
      if (conn.isReconnectExpired(this._config.reconnectTimeoutMs)) {
        conn.markGone();
        log.info(`Reconnect timeout for player ${conn.playerId}`);
        this._hooks.onPlayerLeave?.(this._context, conn.info, LeaveReason.Timeout);
        this.checkMatchEnd();
      }
    }
  }

  private buildServerHello(forSlot: PlayerSlot): Uint8Array {
    const players = Array.from(this._connections.values()).map(conn => ({
      playerId: new TextEncoder().encode(conn.playerId.replace(/-/g, '').padEnd(32, '0').slice(0, 32))
        .slice(0, 16), // simplified UUID to 16 bytes
      slot: conn.slot,
      isBot: conn.isBot,
      metadataJson: JSON.stringify(conn.info.metadata),
    }));

    return packServerHello({
      seed0: this._seed0,
      seed1: this._seed1,
      playerSlot: forSlot,
      serverTick: this._clock.tick,
      maxPlayers: this._config.maxPlayers,
      players,
      scopeJson: this._scopeJson,
    });
  }

  private sendStateToPlayer(conn: PlayerConnection, result: StateTransferResult): void {
    const msg = packStateResponse({
      requestId: 0, // not a request from client
      tick: result.tick,
      hash: result.hash,
      state: result.state,
    });
    conn.send(msg);
  }
}

// ─────────────────────────────────────────────────────────────
// RoomContext Implementation
// ─────────────────────────────────────────────────────────────

class RoomContextImpl implements RoomContext {
  constructor(private readonly _room: RelayRoom) {}

  get matchId() { return this._room.matchId; }
  get tick() { return this._room.tick; }
  get config() { return this._room.config; }
  get createdAt() { return this._room.createdAt; }

  emitServerEvent(
    inputId: number,
    data: Record<string, number | ArrayLike<number>>,
  ): void {
    this._room._emitServerEvent(inputId, data, this._room.tick + 1);
  }

  emitServerEventAt(
    inputId: number,
    data: Record<string, number | ArrayLike<number>>,
    tick: number,
  ): void {
    if (tick < this._room.tick) {
      throw new Error(`Cannot emit server event in the past (tick ${tick} < current ${this._room.tick})`);
    }
    this._room._emitServerEvent(inputId, data, tick);
  }

  getPlayers(): ReadonlyArray<PlayerInfo> {
    return this._room.getPlayerInfos();
  }

  getConnectedPlayerCount(): number {
    return this._room.getConnectedHumanCount();
  }

  isPlayerConnected(slot: PlayerSlot): boolean {
    return this._room.isSlotConnected(slot);
  }

  sendTo(slot: PlayerSlot, message: Uint8Array): void {
    this._room.sendToSlot(slot, message);
  }

  broadcast(message: Uint8Array): void {
    this._room.broadcastToAll(message);
  }

  endMatch(): void {
    this._room.requestEndMatch();
  }
}
