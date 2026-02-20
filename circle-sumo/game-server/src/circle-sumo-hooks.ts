import type { RoomHooks, RoomContext, PlayerInfo, PlayerSlot, PlayerId } from '@lagless/relay-server';
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

    ctx.emitServerEvent(PlayerJoined.id, {
      playerId: player.isBot
        ? UUID.generateMasked().asUint8()
        : UUID.fromString(player.playerId).asUint8(),
      skinId: player.isBot ? Math.floor(Math.random() * 27) : 1,
      mmr: 1000,
      slot: player.slot,
    } satisfies PlayerJoined['schema']);
  },

  onPlayerReconnect(ctx: RoomContext, player: PlayerInfo) {
    log.info(`[${ctx.matchId}] Player reconnected: slot=${player.slot} id=${player.playerId.slice(0, 8)}`);
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

  shouldAcceptLateJoin(ctx: RoomContext, _playerId: string, _metadata: Readonly<Record<string, unknown>>): boolean {
    const elapsedMs = performance.now() - ctx.createdAt;
    if (elapsedMs > 60_000) {
      log.info(`[${ctx.matchId}] Late-join rejected: match too old`);
      return false;
    }
    return true;
  },

  onRoomDisposed(ctx: RoomContext) {
    log.info(`[${ctx.matchId}] Room disposed`);
  },
};
