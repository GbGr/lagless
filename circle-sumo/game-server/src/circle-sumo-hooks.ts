import type { RoomHooks, RoomContext, PlayerInfo, PlayerSlot } from '@lagless/relay-server';
import { LeaveReason } from '@lagless/relay-server';
import { createLogger, UUID } from '@lagless/misc';
import { PlayerJoined, PlayerLeft } from '@lagless/circle-sumo-simulation';

const log = createLogger('CircleSumoHooks');

// ─── Input IDs (must match CircleSumo codegen) ─────────────

export const INPUT_ID_PLAYER_LEFT = 2;

// ─── Game Result ────────────────────────────────────────────

export interface CircleSumoResult {
  readonly score: number;
  readonly kills: number;
  readonly assists: number;
  readonly positionInTop: number;
}

// ─── Hooks ──────────────────────────────────────────────────

export const circleSumoHooks: RoomHooks<CircleSumoResult> = {
  onRoomCreated(ctx: RoomContext) {
    log.info(`[${ctx.matchId}] Room created, ${ctx.getPlayers().length} players`);
  },

  onPlayerJoin(ctx: RoomContext, player: PlayerInfo) {
    log.info(`[${ctx.matchId}] Player joined: slot=${player.slot} bot=${player.isBot} id=${player.playerId.slice(0, 8)}`);

    // Emit PlayerJoined server event for this player
    // The simulation's PlayerConnectionSystem will process this
    // Payload: playerId (16 bytes Uint8), skinId (Uint16), mmr (Uint32)
    // For now, emit minimal — the actual payload packing depends on InputBinarySchema
    // which the server doesn't have access to (raw forwarding design).
    // Instead, we emit a raw event that clients will understand.
    ctx.emitServerEvent(PlayerJoined.id, {
      playerId: UUID.fromString(player.playerId).asUint8(),
      skinId: 1,
      mmr: 1000,
      slot: player.slot,
    } satisfies PlayerJoined['schema']);
  },

  onPlayerLeave(ctx: RoomContext, player: PlayerInfo, reason: LeaveReason) {
    log.info(`[${ctx.matchId}] Player left: slot=${player.slot} reason=${LeaveReason[reason]}`);
    ctx.emitServerEvent(PlayerLeft.id, {
      slot: player.slot,
      reason,
    } satisfies PlayerLeft['schema']);
  },

  async onPlayerFinished(ctx: RoomContext, player: PlayerInfo, result: CircleSumoResult) {
    log.info(`[${ctx.matchId}] Player finished: slot=${player.slot} score=${result.score}`);
  },

  async onMatchEnd(ctx: RoomContext, results: ReadonlyMap<PlayerSlot, CircleSumoResult>) {
    log.info(`[${ctx.matchId}] Match ended with ${results.size} results`);
    // TODO: save to DB
  },

  onRoomDisposed(ctx: RoomContext) {
    log.info(`[${ctx.matchId}] Room disposed`);
  },
};
