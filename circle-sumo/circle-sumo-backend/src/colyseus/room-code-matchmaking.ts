// circle-sumo/circle-sumo-backend/src/colyseus/room-code-matchmaking.ts

import {
  RoomCodeMatchmakerRoom,
  PendingRoom,
  RelayRoomV2Options,
} from '@lagless/colyseus-rooms';
import { NestDI } from '../nest-di';
import { GameService } from '@lagless/game';

const DEFAULT_FRAME_LENGTH = 1000 / 60; // 60 FPS

/**
 * Circle Sumo room code matchmaker.
 *
 * Handles creating private rooms with room codes
 * that players can share to invite friends.
 *
 * Messages:
 * - 'create_room' { maxPlayers, filters? } -> 'room_created' { code, reservation }
 * - 'join_by_code' { code } -> 'room_joined' { reservation }
 * - 'cancel_room' { code } -> cancels pending room
 *
 * Errors:
 * - 'room_error' { reason: 'invalid_code' | 'room_full' | 'room_expired' | ... }
 */
export class CircleSumoRoomCodeMatchmaker extends RoomCodeMatchmakerRoom {
  private readonly _gameService = NestDI.resolve(GameService);

  /**
   * Get the game room name to create
   */
  protected override getGameRoomName(): string {
    return 'relay';
  }

  /**
   * Build options for the game room
   */
  protected override buildGameRoomOptions(
    maxPlayers: number,
    filters?: Record<string, unknown>
  ): Omit<RelayRoomV2Options, 'gameId'> {
    return {
      frameLength: DEFAULT_FRAME_LENGTH,
      maxPlayers,
      enableSnapshotVoting: true,
      snapshotTimeoutMs: 3000,
      rejoinGracePeriodMs: 30000,
      ...filters,
    };
  }

  /**
   * Create a unique game ID for the room
   */
  protected override async createGameId(): Promise<string> {
    const game = await this._gameService.internalCreateGame();
    return game.id;
  }

  /**
   * Called when a room is successfully created
   */
  protected override async onRoomCreated(pendingRoom: PendingRoom, gameRoomId: string): Promise<void> {
    console.log(
      `[CircleSumoRoomCode] Room created: code=${pendingRoom.code}, ` +
      `gameRoomId=${gameRoomId}, creator=${pendingRoom.creatorPlayerId}`
    );
  }

  /**
   * Called when a player joins a room by code
   */
  protected override async onPlayerJoinedByCode(pendingRoom: PendingRoom, playerId?: string): Promise<void> {
    console.log(
      `[CircleSumoRoomCode] Player joined room ${pendingRoom.code}: ` +
      `playerId=${playerId}, count=${pendingRoom.joinedCount}/${pendingRoom.maxPlayers}`
    );
  }

  /**
   * Called when a room expires without being filled
   */
  protected override async onRoomExpired(pendingRoom: PendingRoom): Promise<void> {
    console.log(
      `[CircleSumoRoomCode] Room expired: code=${pendingRoom.code}, ` +
      `joined=${pendingRoom.joinedCount}/${pendingRoom.maxPlayers}`
    );
  }
}
