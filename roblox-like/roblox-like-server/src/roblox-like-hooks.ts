import type { RoomHooks, RoomContext, PlayerInfo } from '@lagless/relay-server';
import { LeaveReason } from '@lagless/relay-server';
import { createLogger, UUID } from '@lagless/misc';
import { PlayerJoined, PlayerLeft } from '@lagless/roblox-like-simulation';

const log = createLogger('RobloxLikeHooks');

export interface RobloxLikeResult {
  readonly score: number;
}

export const robloxLikeHooks: RoomHooks<RobloxLikeResult> = {
  onRoomCreated(ctx: RoomContext) {
    log.info(`[${ctx.matchId}] Room created, ${ctx.getPlayers().length} players`);
  },

  onPlayerJoin(ctx: RoomContext, player: PlayerInfo) {
    log.info(`[${ctx.matchId}] Player joined: slot=${player.slot} bot=${player.isBot} id=${player.playerId.slice(0, 8)}`);

    ctx.emitServerEvent(PlayerJoined.id, {
      playerId: player.isBot
        ? UUID.generateMasked().asUint8()
        : UUID.fromString(player.playerId).asUint8(),
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

  shouldAcceptLateJoin() {
    return true;
  },

  shouldAcceptReconnect() {
    return true;
  },

  onRoomDisposed(ctx: RoomContext) {
    log.info(`[${ctx.matchId}] Room disposed`);
  },
};
