// ─── Identifiers ────────────────────────────────────────────

export type MatchId = string;
export type PlayerId = string;
export type PlayerSlot = number;

export const SERVER_SLOT = 255;

// ─── Room Configuration ────────────────────────────────────

export interface RoomTypeConfig {
  readonly maxPlayers: number;
  readonly tickRateHz: number;
  readonly maxFutureTicks: number;
  readonly lateJoinEnabled: boolean;
  readonly reconnectTimeoutMs: number;
  readonly stateTransferTimeoutMs: number;
  /** When true, all broadcast inputs (client + server) are stored for replay export. Default: false. */
  readonly inputRecordingEnabled?: boolean;
  /** When false, skip tick-based input validation (TooOld, TooFarFuture). Slot and kind checks still apply. Default: true. */
  readonly inputTimingValidationEnabled?: boolean;
}

// ─── Player ─────────────────────────────────────────────────

export interface PlayerInfo {
  readonly playerId: PlayerId;
  readonly slot: PlayerSlot;
  readonly isBot: boolean;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export enum LeaveReason {
  Disconnected,
  Left,
  Kicked,
  Timeout,
}

export enum ConnectionState {
  Connected,
  Disconnected,
  Gone,
}

// ─── Received Input (passed to onInput hook) ────────────────

export interface ReceivedInput {
  readonly tick: number;
  readonly playerSlot: PlayerSlot;
  readonly seq: number;
  readonly payload: Uint8Array;
}

// ─── Room Hooks (implement per game) ───────────────────────

export interface RoomHooks<TMatchResult = unknown> {
  onRoomCreated?(ctx: RoomContext): void | Promise<void>;
  onPlayerJoin?(ctx: RoomContext, player: PlayerInfo): void | Promise<void>;
  onPlayerReconnect?(ctx: RoomContext, player: PlayerInfo): void | Promise<void>;
  onPlayerLeave?(ctx: RoomContext, player: PlayerInfo, reason: LeaveReason): void | Promise<void>;
  onPlayerFinished?(ctx: RoomContext, player: PlayerInfo, result: TMatchResult): void | Promise<void>;
  onMatchEnd?(ctx: RoomContext, results: ReadonlyMap<PlayerSlot, TMatchResult>): void | Promise<void>;
  onRoomDisposed?(ctx: RoomContext): void | Promise<void>;
  shouldAcceptReconnect?(ctx: RoomContext, playerId: PlayerId): boolean;
  shouldAcceptLateJoin?(ctx: RoomContext, playerId: PlayerId, metadata: Readonly<Record<string, unknown>>): boolean;
  /** Called for each validated client input before broadcast. Return false to reject (sends CancelInput). */
  onInput?(ctx: RoomContext, player: PlayerInfo, input: ReceivedInput): boolean | void;
  /** Called when a client input is rejected (validation failure or onInput returned false). reason: 0=TooOld, 1=TooFarFuture, 2=InvalidSlot, 3=Rejected. */
  onInputDeclined?(ctx: RoomContext, player: PlayerInfo, tick: number, seq: number, reason: number): void;
}

// ─── Room Context (safe API for hooks) ─────────────────────

export interface RoomContext {
  readonly matchId: MatchId;
  readonly tick: number;
  readonly config: Readonly<RoomTypeConfig>;
  readonly createdAt: number;

  emitServerEvent(inputId: number, data: Record<string, number | ArrayLike<number>>): void;
  emitServerEventAt(inputId: number, data: Record<string, number | ArrayLike<number>>, tick: number): void;

  getPlayers(): ReadonlyArray<PlayerInfo>;
  getConnectedPlayerCount(): number;
  isPlayerConnected(slot: PlayerSlot): boolean;

  sendTo(slot: PlayerSlot, message: Uint8Array): void;
  broadcast(message: Uint8Array): void;

  endMatch(): void;

  /** Export recorded inputs as RPCHistory binary format. Returns null if recording is disabled. */
  exportRecordedInputs(): ArrayBuffer | null;
  /** Export full replay (seed + maxPlayers + fps + RPCHistory). Returns null if recording is disabled. */
  exportReplay(): ArrayBuffer | null;
}

// ─── Match Creation ────────────────────────────────────────

export interface CreateMatchRequest {
  readonly matchId: MatchId;
  readonly roomType: string;
  readonly players: ReadonlyArray<{
    readonly playerId: PlayerId;
    readonly isBot: boolean;
    readonly metadata: Record<string, unknown>;
  }>;
}

// ─── Input Registry (provided per game) ─────────────────────

/** Minimal interface that InputBinarySchema.packBatch / unpackBatch expect. */
export interface InputRegistry {
  get(id: number): { id: number; fields: ReadonlyArray<{ name: string; type: number; isArray: boolean; arrayLength?: number; byteLength: number }>; byteLength: number };
}

// ─── Registered Room Type ──────────────────────────────────

export interface RoomTypeDefinition<TResult = unknown> {
  readonly config: RoomTypeConfig;
  readonly hooks: RoomHooks<TResult>;
  readonly inputRegistry: InputRegistry;
}

// ─── WebSocket abstraction ─────────────────────────────────

export interface WsConnectionData {
  matchId: MatchId;
  playerId: PlayerId;
  playerSlot: PlayerSlot;
}

/** Abstract WebSocket interface — decoupled from Bun/Node specifics */
export interface IWebSocket {
  sendBinary(data: Uint8Array): void;
  close(): void;
}

// ─── Token Validation ──────────────────────────────────────

export interface TokenPayload {
  playerId: PlayerId;
  matchId: MatchId;
  playerSlot: PlayerSlot;
}

export type TokenValidator = (token: string) => TokenPayload | null;
