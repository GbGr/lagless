import { createLogger } from '@lagless/misc';
import {
  TickInputKind, CancelReason,
  HeaderSchema, TickInputSchema,
  packTickInputFanout, packCancelInput,
} from '@lagless/net-wire';
import { LE } from '@lagless/binary';
import type { ServerClock } from './server-clock.js';
import type { PlayerConnection } from './player-connection.js';
import type { RoomTypeConfig, PlayerSlot } from './types.js';

const log = createLogger('InputHandler');

const TICK_INPUT_HEADER_SIZE = 12; // tick(4) + slot(1) + seq(4) + kind(1) + payloadLength(2)

// ─── Types ──────────────────────────────────────────────────

export interface ValidatedInput {
  readonly tick: number;
  readonly playerSlot: PlayerSlot;
  readonly seq: number;
  readonly kind: TickInputKind;
  readonly payload: Uint8Array;
}

export type ValidationResult =
  | { readonly accepted: true; readonly input: ValidatedInput }
  | { readonly accepted: false; readonly reason: CancelReason; readonly tick: number; readonly seq: number };

// ─── InputHandler ───────────────────────────────────────────

export class InputHandler {
  constructor(
    private readonly _clock: ServerClock,
    private readonly _config: RoomTypeConfig,
  ) {}

  /**
   * Parse and validate incoming TickInput message from a client.
   */
  public validateClientInput(
    senderSlot: PlayerSlot,
    raw: ArrayBuffer,
  ): ValidationResult {
    const view = new DataView(raw);
    const offset = HeaderSchema.byteLength;

    if (offset + TICK_INPUT_HEADER_SIZE > raw.byteLength) {
      log.warn(`validateClientInput: message too short (${raw.byteLength} bytes)`);
      return { accepted: false, reason: CancelReason.InvalidSlot, tick: 0, seq: 0 };
    }

    const tick = view.getUint32(offset, LE);
    const claimedSlot = view.getUint8(offset + 4);
    const seq = view.getUint32(offset + 5, LE);
    const kind = view.getUint8(offset + 9);
    const payloadLength = view.getUint16(offset + 10, LE);

    // Reject if claimed slot doesn't match sender
    if (claimedSlot !== senderSlot) {
      log.warn(`Slot mismatch: sender=${senderSlot}, claimed=${claimedSlot}`);
      return { accepted: false, reason: CancelReason.InvalidSlot, tick, seq };
    }

    // Reject server-kind from client
    if (kind === TickInputKind.Server) {
      log.warn(`Client sent Server-kind input, slot=${senderSlot}`);
      return { accepted: false, reason: CancelReason.InvalidSlot, tick, seq };
    }

    const serverTick = this._clock.tick;

    // Too old
    if (tick < serverTick) {
      log.warn(`REJECT TooOld: slot=${senderSlot} inputTick=${tick} serverTick=${serverTick} delta=${tick - serverTick} seq=${seq}`);
      return { accepted: false, reason: CancelReason.TooOld, tick, seq };
    }

    // Too far in future
    if (tick > serverTick + this._config.maxFutureTicks) {
      log.warn(`REJECT TooFarFuture: slot=${senderSlot} inputTick=${tick} serverTick=${serverTick} delta=${tick - serverTick} maxFuture=${this._config.maxFutureTicks} seq=${seq}`);
      return { accepted: false, reason: CancelReason.TooFarFuture, tick, seq };
    }

    const payloadStart = HeaderSchema.byteLength + TickInputSchema.byteLength;
    const payload = new Uint8Array(raw, payloadStart, payloadLength);

    log.debug(`ACCEPT: slot=${senderSlot} inputTick=${tick} serverTick=${serverTick} delta=${tick - serverTick} seq=${seq} payloadLen=${payloadLength}`);

    return {
      accepted: true,
      input: {
        tick,
        playerSlot: senderSlot,
        seq,
        kind: TickInputKind.Client,
        payload,
      },
    };
  }

  /**
   * Parse and validate a TickInputBatch message from a client.
   * Returns one ValidationResult per input in the batch.
   */
  public validateClientInputBatch(
    senderSlot: PlayerSlot,
    raw: ArrayBuffer,
  ): ValidationResult[] {
    const view = new DataView(raw);
    let offset = HeaderSchema.byteLength; // skip header

    if (offset + 1 > raw.byteLength) {
      log.warn(`validateClientInputBatch: message too short for batch header (${raw.byteLength} bytes)`);
      return [];
    }

    const inputCount = view.getUint8(offset); offset += 1;
    const results: ValidationResult[] = [];

    for (let i = 0; i < inputCount; i++) {
      if (offset + TICK_INPUT_HEADER_SIZE > raw.byteLength) {
        log.warn(`validateClientInputBatch: truncated at input ${i}/${inputCount} (offset=${offset}, byteLength=${raw.byteLength})`);
        break;
      }

      const tick = view.getUint32(offset, LE); offset += 4;
      const claimedSlot = view.getUint8(offset); offset += 1;
      const seq = view.getUint32(offset, LE); offset += 4;
      const kind = view.getUint8(offset); offset += 1;
      const payloadLength = view.getUint16(offset, LE); offset += 2;

      if (offset + payloadLength > raw.byteLength) {
        log.warn(`validateClientInputBatch: truncated payload at input ${i}/${inputCount} (need=${payloadLength}, remaining=${raw.byteLength - offset})`);
        break;
      }

      if (claimedSlot !== senderSlot) {
        log.warn(`Batch slot mismatch: sender=${senderSlot}, claimed=${claimedSlot}`);
        results.push({ accepted: false, reason: CancelReason.InvalidSlot, tick, seq });
        offset += payloadLength;
        continue;
      }

      if (kind === TickInputKind.Server) {
        log.warn(`Client sent Server-kind input in batch, slot=${senderSlot}`);
        results.push({ accepted: false, reason: CancelReason.InvalidSlot, tick, seq });
        offset += payloadLength;
        continue;
      }

      const serverTick = this._clock.tick;

      if (tick < serverTick) {
        log.warn(`REJECT TooOld: slot=${senderSlot} inputTick=${tick} serverTick=${serverTick} delta=${tick - serverTick} seq=${seq}`);
        results.push({ accepted: false, reason: CancelReason.TooOld, tick, seq });
        offset += payloadLength;
        continue;
      }

      if (tick > serverTick + this._config.maxFutureTicks) {
        log.warn(`REJECT TooFarFuture: slot=${senderSlot} inputTick=${tick} serverTick=${serverTick} delta=${tick - serverTick} maxFuture=${this._config.maxFutureTicks} seq=${seq}`);
        results.push({ accepted: false, reason: CancelReason.TooFarFuture, tick, seq });
        offset += payloadLength;
        continue;
      }

      const payload = new Uint8Array(raw, offset, payloadLength);
      offset += payloadLength;

      log.debug(`ACCEPT: slot=${senderSlot} inputTick=${tick} serverTick=${serverTick} delta=${tick - serverTick} seq=${seq} payloadLen=${payloadLength}`);

      results.push({
        accepted: true,
        input: {
          tick,
          playerSlot: senderSlot,
          seq,
          kind: TickInputKind.Client,
          payload,
        },
      });
    }

    return results;
  }

  /**
   * Broadcast a validated input to all connected players as TickInputFanout.
   */
  public broadcastInput(
    input: ValidatedInput,
    connections: ReadonlyMap<PlayerSlot, PlayerConnection>,
  ): void {
    const fanout = packTickInputFanout({
      serverTick: this._clock.tick,
      inputs: [input],
    });

    let sentCount = 0;
    for (const conn of connections.values()) {
      if (conn.isConnected) sentCount++;
      conn.send(fanout);
    }
    log.debug(`BROADCAST: tick=${input.tick} slot=${input.playerSlot} kind=${input.kind} → ${sentCount} connected clients`);
  }

  /**
   * Broadcast multiple inputs in a single fanout message.
   */
  public broadcastInputBatch(
    inputs: ValidatedInput[],
    connections: ReadonlyMap<PlayerSlot, PlayerConnection>,
  ): void {
    if (inputs.length === 0) return;

    const fanout = packTickInputFanout({
      serverTick: this._clock.tick,
      inputs,
    });

    for (const conn of connections.values()) {
      conn.send(fanout);
    }
  }

  /**
   * Send a batch of inputs to a single player as TickInputFanout.
   * Used for replaying server event journal on connect.
   */
  public sendInputBatchToPlayer(
    inputs: ValidatedInput[],
    connection: PlayerConnection,
  ): void {
    if (inputs.length === 0) return;

    const fanout = packTickInputFanout({
      serverTick: this._clock.tick,
      inputs,
    });

    connection.send(fanout);
  }

  /**
   * Send CancelInput to a specific player.
   */
  public sendCancel(
    connection: PlayerConnection,
    tick: number,
    seq: number,
    reason: CancelReason,
  ): void {
    const msg = packCancelInput({
      tick,
      playerSlot: connection.slot,
      seq,
      reason,
    });
    connection.send(msg);
  }
}
