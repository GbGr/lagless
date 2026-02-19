import { createLogger } from '@lagless/misc';
import {
  MsgType,
  unpackHeader,
  unpackServerHello,
  unpackTickInputFanoutManual,
  unpackCancelInput,
  unpackPong,
  unpackStateRequest,
  packTickInput,
  packPing,
  packStateResponse,
  packPlayerFinished,
  type ServerHelloData,
  type FanoutData,
  type CancelInputData,
  type PongData,
  type TickInputData,
  type StateResponseData,
  type PlayerFinishedData,
} from '@lagless/net-wire';
import {
  type RelayConnectionConfig,
  PING_WARMUP_INTERVAL_MS,
  PING_WARMUP_COUNT,
  PING_STEADY_INTERVAL_MS,
} from './types.js';

const log = createLogger('RelayConnection');

// ─── Event Handlers ─────────────────────────────────────────

export interface RelayConnectionEvents {
  onServerHello(data: ServerHelloData): void;
  onTickInputFanout(data: FanoutData): void;
  onCancelInput(data: CancelInputData): void;
  onPong(data: PongData): void;
  onStateRequest(requestId: number): void;
  onConnected(): void;
  onDisconnected(): void;
}

// ─── RelayConnection ────────────────────────────────────────

/**
 * Thin WebSocket wrapper for relay server communication.
 * Handles binary protocol parsing and ping interval management.
 */
export class RelayConnection {
  private _ws: WebSocket | null = null;
  private _pingInterval: ReturnType<typeof setInterval> | null = null;
  private _pingCount = 0;
  private _connected = false;

  constructor(
    private readonly _config: RelayConnectionConfig,
    private readonly _events: RelayConnectionEvents,
  ) {}

  public get isConnected(): boolean {
    return this._connected;
  }

  public connect(): void {
    if (this._ws) {
      log.warn('Already connected, ignoring connect()');
      return;
    }

    const url = `${this._config.serverUrl}/match/${this._config.matchId}?token=${encodeURIComponent(this._config.token)}`;
    log.info(`Connecting to ${url}`);

    this._ws = new WebSocket(url);
    this._ws.binaryType = 'arraybuffer';

    this._ws.onopen = () => {
      this._connected = true;
      log.info('Connected');
      this.startPingInterval();
      this._events.onConnected();
    };

    this._ws.onmessage = (event: MessageEvent) => {
      if (event.data instanceof ArrayBuffer) {
        this.handleBinaryMessage(event.data);
      }
    };

    this._ws.onclose = () => {
      this._connected = false;
      this.stopPingInterval();
      log.info('Disconnected');
      this._events.onDisconnected();
    };

    this._ws.onerror = () => {
      log.error('WebSocket error');
    };
  }

  public disconnect(): void {
    this.stopPingInterval();
    if (this._ws) {
      this._ws.onclose = null;
      this._ws.onmessage = null;
      this._ws.onerror = null;
      this._ws.close();
      this._ws = null;
    }
    this._connected = false;
  }

  // ─── Sending ──────────────────────────────────────────

  public sendTickInput(data: TickInputData): void {
    this.sendBinary(packTickInput(data));
  }

  public sendStateResponse(data: StateResponseData): void {
    this.sendBinary(packStateResponse(data));
  }

  public sendPlayerFinished(data: PlayerFinishedData): void {
    this.sendBinary(packPlayerFinished(data));
  }

  public sendPing(): void {
    this.sendBinary(packPing(performance.now()));
  }

  // ─── Private ──────────────────────────────────────────

  private sendBinary(data: Uint8Array): void {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) return;
    this._ws.send(data);
  }

  private handleBinaryMessage(data: ArrayBuffer): void {
    if (data.byteLength < 2) return;

    const header = unpackHeader(data);

    switch (header.type) {
      case MsgType.ServerHello:
        this._events.onServerHello(unpackServerHello(data));
        break;
      case MsgType.TickInputFanout:
        this._events.onTickInputFanout(unpackTickInputFanoutManual(data));
        break;
      case MsgType.CancelInput:
        this._events.onCancelInput(unpackCancelInput(data));
        break;
      case MsgType.Pong:
        this._events.onPong(unpackPong(data));
        break;
      case MsgType.StateRequest:
        this._events.onStateRequest(unpackStateRequest(data));
        break;
      default:
        log.warn(`Unknown message type: ${header.type}`);
    }
  }

  private startPingInterval(): void {
    this._pingCount = 0;
    this.sendPing();

    this._pingInterval = setInterval(() => {
      this.sendPing();
      this._pingCount++;

      if (this._pingCount === PING_WARMUP_COUNT) {
        this.stopPingInterval();
        this._pingInterval = setInterval(() => this.sendPing(), PING_STEADY_INTERVAL_MS);
      }
    }, PING_WARMUP_INTERVAL_MS);
  }

  private stopPingInterval(): void {
    if (this._pingInterval !== null) {
      clearInterval(this._pingInterval);
      this._pingInterval = null;
    }
  }
}
