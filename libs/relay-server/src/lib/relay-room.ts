import { createLogger } from '@lagless/misc';
import {
  TickInputKind, HeaderSchema,
  packServerHello, packPong, packStateResponse, packTickInputFanout,
  packHashMismatch, unpackHashReport,
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

function uuidToBytes(playerId: string): Uint8Array {
  const hex = playerId.replace(/-/g, '');
  // Valid UUID: 32 hex chars → proper hex-to-bytes conversion
  if (hex.length === 32 && /^[0-9a-fA-F]{32}$/.test(hex)) {
    const bytes = new Uint8Array(16);
    for (let i = 0; i < 16; i++) {
      bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  }
  // Fallback: XOR-hash arbitrary string into 16 bytes
  const bytes = new Uint8Array(16);
  for (let i = 0; i < playerId.length; i++) {
    bytes[i % 16] ^= playerId.charCodeAt(i);
  }
  return bytes;
}

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
  private readonly _recentClientInputs: ValidatedInput[] = [];
  private readonly _context: RoomContextImpl;
  private readonly _createdAt: number;
  private readonly _seed: Uint8Array;
  private readonly _scopeJson: string;
  private readonly _inputRegistry: InputRegistry;

  private _disposed = false;
  private _reconnectTimer: ReturnType<typeof setInterval> | null = null;
  private _serverSeq = 1;
  private _latencySimulator: LatencySimulator | null = null;
  private _nextSlot: number;
  private readonly _hashReports = new Map<number, Map<number, number>>(); // tick → slot → hash

  constructor(
    public readonly matchId: MatchId,
    public readonly roomType: string,
    private readonly _config: RoomTypeConfig,
    private readonly _hooks: RoomHooks<unknown>,
    inputRegistry: InputRegistry,
    players: ReadonlyArray<{
      playerId: PlayerId;
      isBot: boolean;
      metadata: Record<string, unknown>;
    }>,
    seed: Uint8Array,
    scopeJson = '{}',
  ) {
    this._createdAt = performance.now();
    this._seed = seed;
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
    this._nextSlot = slot;

    // Start reconnect expiry checker
    if (_config.reconnectTimeoutMs > 0) {
      this._reconnectTimer = setInterval(
        () => this.checkReconnectTimeouts(),
        1000,
      );
    }

    log.info(`Room ${matchId} created with ${players.length} players`);
  }

  public async init(): Promise<void> {
    await this._hooks.onRoomCreated?.(this._context);

    // Emit join events for bots — they never connect via WebSocket
    // but the simulation needs PlayerJoined server events for them
    for (const conn of this._connections.values()) {
      if (conn.isBot) {
        await this._hooks.onPlayerJoin?.(this._context, conn.info);
      }
    }
  }

  // ─── Public getters ────────────────────────────────────

  public get isDisposed(): boolean { return this._disposed; }
  public get tick(): number { return this._clock.tick; }
  public get config(): Readonly<RoomTypeConfig> { return this._config; }
  public get context(): RoomContext { return this._context; }
  public get createdAt(): number { return this._createdAt; }

  public get hasOpenSlots(): boolean {
    return !this._disposed && this._config.lateJoinEnabled && this._nextSlot < this._config.maxPlayers;
  }

  public get latencySimulator(): LatencySimulator | null { return this._latencySimulator; }
  public set latencySimulator(sim: LatencySimulator | null) { this._latencySimulator = sim; }

  private _perPlayerLatency: Map<number, LatencySimulator> | null = null;
  public get perPlayerLatency(): Map<number, LatencySimulator> | null { return this._perPlayerLatency; }
  public set perPlayerLatency(map: Map<number, LatencySimulator> | null) { this._perPlayerLatency = map; }

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

  // ─── Late-Join ───────────────────────────────────────────

  public addPlayer(
    playerId: PlayerId,
    isBot: boolean,
    metadata: Readonly<Record<string, unknown>>,
  ): PlayerInfo | null {
    if (this._disposed) return null;
    if (!this._config.lateJoinEnabled) return null;
    if (this._nextSlot >= this._config.maxPlayers) return null;
    if (this._playersByPlayerId.has(playerId)) return null;

    if (this._hooks.shouldAcceptLateJoin?.(this._context, playerId, metadata) === false) {
      return null;
    }

    const slot = this._nextSlot++;
    const info: PlayerInfo = {
      playerId,
      slot,
      isBot,
      metadata: Object.freeze({ ...metadata }),
    };

    const conn = new PlayerConnection(info, null);
    conn.markDisconnected();

    this._connections.set(slot, conn);
    this._playersByPlayerId.set(playerId, conn);

    log.info(`Late-join: player ${playerId} added to room ${this.matchId} (slot=${slot})`);
    return info;
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
      if (!conn.isReady) continue;
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

    if (conn.isGone) {
      log.warn(`Player ${playerId} reconnect rejected — already gone`);
      return false;
    }

    const isReconnect = conn.hasConnectedBefore;

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

    // State sync: state transfer if tick > 0, otherwise journal replay
    const needsStateTransfer = this._clock.tick > 0 && this._config.lateJoinEnabled;

    if (needsStateTransfer) {
      const stateResult = await this._stateTransfer.requestState(this._connections, conn.slot);
      if (stateResult) {
        this.sendStateToPlayer(conn, stateResult);
        // Send ALL post-state inputs (server events + client inputs) that happened
        // AFTER the state snapshot tick — these are not reflected in the transferred state.
        // Without client inputs, the joining player would simulate those ticks incorrectly.
        const postStateServerEvents = this._serverEventJournal.filter(e => e.tick > stateResult.tick);
        const postStateClientInputs = this._recentClientInputs.filter(i => i.tick > stateResult.tick);
        const allPostStateInputs = [...postStateServerEvents, ...postStateClientInputs]
          .sort((a, b) => a.tick - b.tick || a.playerSlot - b.playerSlot || a.seq - b.seq);
        if (allPostStateInputs.length > 0) {
          log.info(`Post-state replay: ${postStateServerEvents.length} server + ${postStateClientInputs.length} client inputs (tick > ${stateResult.tick}) to slot=${conn.slot}`);
          this._inputHandler.sendInputBatchToPlayer(allPostStateInputs, conn);
        }
      } else {
        log.warn(`State transfer failed for player ${playerId} — falling back to journal replay`);
        this._inputHandler.sendInputBatchToPlayer(this._serverEventJournal, conn);
      }
    } else {
      log.info(`Journal replay: ${this._serverEventJournal.length} events to slot=${conn.slot}`);
      this._inputHandler.sendInputBatchToPlayer(this._serverEventJournal, conn);
    }

    // Mark ready AFTER state transfer + journal replay — this allows broadcasts to reach the player
    conn.markReady();

    log.info(`Player ${playerId} ${isReconnect ? 'reconnected to' : 'joined'} room ${this.matchId} (slot=${conn.slot})`);
    if (isReconnect) {
      await this._hooks.onPlayerReconnect?.(this._context, conn.info);
    } else {
      await this._hooks.onPlayerJoin?.(this._context, conn.info);
    }

    return true;
  }

  public async handlePlayerDisconnect(playerId: PlayerId): Promise<void> {
    const conn = this._playersByPlayerId.get(playerId);
    if (!conn || !conn.isConnected) return;

    if (this._config.reconnectTimeoutMs > 0) {
      conn.markDisconnected();
    } else {
      conn.markGone();
    }

    log.info(`Player ${playerId} disconnected from room ${this.matchId}`);
    await this._hooks.onPlayerLeave?.(this._context, conn.info, LeaveReason.Disconnected);

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
      case 10: // MsgType.HashReport
        this.handleHashReport(conn, data);
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
      // Store for state transfer replay — joining players need inputs they missed
      for (const input of accepted) {
        this._recentClientInputs.push(input);
      }
      this.pruneRecentClientInputs();

      if (this._perPlayerLatency?.size) {
        const fanout = packTickInputFanout({ serverTick: this._clock.tick, inputs: accepted });
        for (const c of this._connections.values()) {
          if (!c.isReady) continue;
          const sim = this._perPlayerLatency.get(c.slot);
          if (sim) sim.apply(() => c.send(fanout));
          else c.send(fanout);
        }
      } else {
        const broadcast = () => this._inputHandler.broadcastInputBatch(accepted, this._connections);
        if (this._latencySimulator) {
          this._latencySimulator.apply(broadcast);
        } else {
          broadcast();
        }
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
    const sim = this._perPlayerLatency?.get(conn.slot) ?? this._latencySimulator;
    if (sim) {
      sim.apply(send);
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

  private handleHashReport(conn: PlayerConnection, raw: ArrayBuffer): void {
    const report = unpackHashReport(raw);
    const tick = report.atTick;

    let tickMap = this._hashReports.get(tick);
    if (!tickMap) {
      tickMap = new Map();
      this._hashReports.set(tick, tickMap);
    }
    tickMap.set(conn.slot, report.hash);

    // Check if all connected non-bot players have reported for this tick
    let allReported = true;
    for (const c of this._connections.values()) {
      if (c.isBot || !c.isConnected) continue;
      if (!tickMap.has(c.slot)) {
        allReported = false;
        break;
      }
    }

    if (allReported && tickMap.size >= 2) {
      // Compare all hashes — find first mismatch
      const entries = Array.from(tickMap.entries());
      for (let i = 0; i < entries.length; i++) {
        for (let j = i + 1; j < entries.length; j++) {
          if (entries[i][1] !== entries[j][1]) {
            const mismatch = packHashMismatch({
              slotA: entries[i][0],
              slotB: entries[j][0],
              hashA: entries[i][1],
              hashB: entries[j][1],
              atTick: tick,
            });
            this.broadcastToAll(mismatch);
            log.warn(`Hash mismatch at tick ${tick}: slot ${entries[i][0]} (0x${entries[i][1].toString(16)}) vs slot ${entries[j][0]} (0x${entries[j][1].toString(16)})`);
            // Only report first mismatch per tick
            break;
          }
        }
      }
    }

    // Prune old hash reports (keep last ~10 seconds)
    const pruneThreshold = this._clock.tick - (this._config.tickRateHz * 10);
    for (const [t] of this._hashReports) {
      if (t < pruneThreshold) this._hashReports.delete(t);
    }
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

  /**
   * Keep only the last ~10 seconds of client inputs for state transfer replay.
   */
  private pruneRecentClientInputs(): void {
    const pruneThreshold = this._clock.tick - (this._config.tickRateHz * 10);
    while (this._recentClientInputs.length > 0 && this._recentClientInputs[0].tick < pruneThreshold) {
      this._recentClientInputs.shift();
    }
  }

  private buildServerHello(forSlot: PlayerSlot): Uint8Array {
    const players = Array.from(this._connections.values()).map(conn => ({
      playerId: uuidToBytes(conn.playerId),
      slot: conn.slot,
      isBot: conn.isBot,
      metadataJson: JSON.stringify(conn.info.metadata),
    }));

    return packServerHello({
      seed: this._seed,
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
