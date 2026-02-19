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
      return { accepted: false, reason: CancelReason.TooOld, tick, seq };
    }

    // Too far in future
    if (tick > serverTick + this._config.maxFutureTicks) {
      return { accepted: false, reason: CancelReason.TooFarFuture, tick, seq };
    }

    const payloadStart = HeaderSchema.byteLength + TickInputSchema.byteLength;
    const payload = new Uint8Array(raw, payloadStart, payloadLength);

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

    for (const conn of connections.values()) {
      conn.send(fanout);
    }
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
