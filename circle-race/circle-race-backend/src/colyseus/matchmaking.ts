import {
  BaseMatchmakerRoom,
  MatchGroup,
  MatchmakingConfig,
  MatchTicket,
  RoomAuthResult,
} from '@lagless/colyseus-rooms';
import { NestDI } from '../nest-di';
import { ConfigService } from '@nestjs/config';
import { Client } from 'colyseus';
import { GameService } from '@lagless/game';
import { PlayerService } from '@lagless/player';

export class CircleRaceMatchmakingRoom extends BaseMatchmakerRoom {
  protected override async onCancelMatchmakingSession(ticket: MatchTicket<Client>): Promise<void> {
    if (ticket.matchmakingSessionId) {
      await NestDI.resolve(GameService).internalCancelMatchmakingSession(ticket.matchmakingSessionId);
    }
  }

  protected override async onBeforeMatchmaking(auth: RoomAuthResult): Promise<string | undefined> {
    const matchmakingSession = await NestDI.resolve(GameService).internalStartMatchmakingSession(auth.id, new Date());

    return matchmakingSession.id;
  }

  protected override async createGameId(group: MatchGroup<Client>): Promise<string> {
    const sessions = group.tickets.map(({ playerId, matchmakingSessionId }) => ({
      playerId,
      matchmakingSessionId,
    }));
    const game = await NestDI.resolve(GameService).internalCreateGame(sessions);

    return game.id;
  }

  protected override async getPlayerDataFromAuth(auth: RoomAuthResult): Promise<{ username: string; mmr: number }> {
    return await NestDI.resolve(PlayerService).getById(auth.id);
  }

  protected override _getAuthSecret(): string {
    return NestDI.resolve(ConfigService).getOrThrow('JWT_SECRET');
  }

  protected override getFrameLength(): number {
    return 1000 / 60;
  }

  protected override getMatchmakingConfig(): MatchmakingConfig {
    return {
      virtualCapacity: 4,
      maxHumans: 4,

      softMinHumans: 2,
      hardMinHumans: 1,

      startDelayByHumans: {
        1: 5000,
        2: 3000,
        3: 2000,
        4: 1000,
        default: 2000,
      },

      baseMmrWindow: 100,
      maxMmrWindow: 600,

      baseMaxPing: 50,
      maxMaxPing: 200,

      loadTargetQueueSize: 10,
    };
  }

  protected override getGameRoomName(): string {
    return 'relay';
  }
}
