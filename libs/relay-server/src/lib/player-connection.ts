import type { PlayerId, PlayerSlot, PlayerInfo, IWebSocket } from './types.js';
import { ConnectionState } from './types.js';

/**
 * Represents a player's connection to a relay room.
 * Manages connection state, WebSocket reference, and reconnect timing.
 */
export class PlayerConnection {
  private _state: ConnectionState;
  private _disconnectedAt: number | null = null;
  private _ws: IWebSocket | null;
  private _hasConnectedBefore = false;
  private _isReady = false;

  constructor(
    private readonly _info: PlayerInfo,
    ws: IWebSocket | null,
  ) {
    this._ws = ws;
    this._state = _info.isBot ? ConnectionState.Gone : ConnectionState.Disconnected;
  }

  public get info(): PlayerInfo { return this._info; }
  public get playerId(): PlayerId { return this._info.playerId; }
  public get slot(): PlayerSlot { return this._info.slot; }
  public get isBot(): boolean { return this._info.isBot; }
  public get state(): ConnectionState { return this._state; }

  public get isConnected(): boolean {
    return this._state === ConnectionState.Connected;
  }

  public get isDisconnected(): boolean {
    return this._state === ConnectionState.Disconnected;
  }

  public get isGone(): boolean {
    return this._state === ConnectionState.Gone;
  }

  public get isReady(): boolean {
    return this._isReady;
  }

  public markReady(): void {
    this._isReady = true;
  }

  public send(data: Uint8Array): void {
    if (this._state !== ConnectionState.Connected || !this._ws) return;
    this._ws.sendBinary(data);
  }

  public get hasConnectedBefore(): boolean {
    return this._hasConnectedBefore;
  }

  public connect(ws: IWebSocket): void {
    this._state = ConnectionState.Connected;
    this._disconnectedAt = null;
    this._ws = ws;
    this._hasConnectedBefore = true;
  }

  public markDisconnected(): void {
    this._state = ConnectionState.Disconnected;
    this._disconnectedAt = performance.now();
    this._ws = null;
    this._isReady = false;
  }

  public markGone(): void {
    this._state = ConnectionState.Gone;
    this._disconnectedAt = null;
    this._ws = null;
    this._isReady = false;
  }

  public isReconnectExpired(timeoutMs: number): boolean {
    if (this._state !== ConnectionState.Disconnected) return false;
    if (this._disconnectedAt === null) return false;
    return performance.now() - this._disconnectedAt > timeoutMs;
  }
}
