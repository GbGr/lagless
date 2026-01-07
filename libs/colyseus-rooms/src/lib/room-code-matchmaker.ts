// libs/colyseus-rooms/src/lib/room-code-matchmaker.ts

import { Client, Room, matchMaker } from 'colyseus';
import type { RelayRoomV2Options } from './relay-room-v2.js';

/**
 * Configuration for room code generation
 */
export interface RoomCodeConfig {
  /** Length of generated codes (default: 6) */
  readonly codeLength: number;
  /** Character set for codes - excludes ambiguous chars (default: A-Z, 2-9 without I,O,0,1) */
  readonly codeCharset: string;
  /** Code expiration time in ms (default: 300000 = 5 min) */
  readonly codeExpireMs: number;
}

/**
 * Default room code configuration
 */
export const DEFAULT_ROOM_CODE_CONFIG: RoomCodeConfig = {
  codeLength: 6,
  codeCharset: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
  codeExpireMs: 300000,
};

/**
 * Message types for room code matchmaking
 */
export interface CreateRoomMessage {
  maxPlayers: number;
  filters?: Record<string, unknown>;
}

export interface JoinByCodeMessage {
  code: string;
}

export interface CancelRoomMessage {
  code: string;
}

/**
 * Response for successful room creation
 */
export interface RoomCreatedResponse {
  code: string;
  reservation: {
    room: { roomId: string; processId: string; sessionId: string };
    sessionId: string;
  };
}

/**
 * Response for successful room join
 */
export interface RoomJoinedResponse {
  reservation: {
    room: { roomId: string; processId: string; sessionId: string };
    sessionId: string;
  };
}

/**
 * Error response
 */
export interface RoomErrorResponse {
  reason: 'invalid_code' | 'room_full' | 'room_expired' | 'create_failed' | 'join_failed';
  message?: string;
}

/**
 * Information about a pending room waiting for players
 */
export interface PendingRoom {
  readonly code: string;
  readonly creatorSessionId: string;
  readonly creatorPlayerId?: string;
  readonly maxPlayers: number;
  readonly createdAt: number;
  readonly expiresAt: number;
  gameRoomId?: string;
  readonly filters?: Record<string, unknown>;
  joinedCount: number;
}

/**
 * Abstract base class for room code matchmaking
 *
 * Provides create room / join by code functionality
 * Subclasses must implement game-specific room creation
 *
 * Client messages:
 * - 'create_room' -> creates a new room with a code
 * - 'join_by_code' -> joins an existing room by code
 * - 'cancel_room' -> cancels a pending room
 *
 * Server responses:
 * - 'room_created' -> room created successfully with code and reservation
 * - 'room_joined' -> joined room successfully with reservation
 * - 'room_error' -> error with reason
 */
export abstract class RoomCodeMatchmakerRoom extends Room {
  protected _pendingRooms = new Map<string, PendingRoom>();
  protected _config!: RoomCodeConfig;
  private _cleanupIntervalId: NodeJS.Timeout | null = null;

  /**
   * Get room code configuration
   * Override to customize code generation
   */
  protected getRoomCodeConfig(): RoomCodeConfig {
    return DEFAULT_ROOM_CODE_CONFIG;
  }

  /**
   * Get the name of the game room to create
   */
  protected abstract getGameRoomName(): string;

  /**
   * Build options for the game room
   */
  protected abstract buildGameRoomOptions(
    maxPlayers: number,
    filters?: Record<string, unknown>
  ): Omit<RelayRoomV2Options, 'gameId'>;

  /**
   * Create a unique game ID for the room
   */
  protected abstract createGameId(): Promise<string>;

  /**
   * Called when a room is successfully created
   * Use for persistence, analytics, etc.
   */
  protected onRoomCreated(pendingRoom: PendingRoom, gameRoomId: string): Promise<void> {
    return Promise.resolve();
  }

  /**
   * Called when a player joins a room by code
   */
  protected onPlayerJoinedByCode(pendingRoom: PendingRoom, playerId?: string): Promise<void> {
    return Promise.resolve();
  }

  /**
   * Called when a room expires without being filled
   */
  protected onRoomExpired(pendingRoom: PendingRoom): Promise<void> {
    return Promise.resolve();
  }

  public override onCreate(): void {
    this._config = this.getRoomCodeConfig();

    // Register message handlers
    this.onMessage('create_room', this.handleCreateRoom.bind(this));
    this.onMessage('join_by_code', this.handleJoinByCode.bind(this));
    this.onMessage('cancel_room', this.handleCancelRoom.bind(this));

    // Start cleanup interval
    this._cleanupIntervalId = setInterval(
      () => this.cleanupExpiredRooms(),
      30000 // Check every 30 seconds
    );

    console.log('[RoomCodeMatchmaker] Created');
  }

  public override onJoin(client: Client): void {
    console.log(`[RoomCodeMatchmaker] Client ${client.sessionId} joined`);
  }

  public override onLeave(client: Client): void {
    // Don't cancel rooms when creator leaves - they can rejoin
    console.log(`[RoomCodeMatchmaker] Client ${client.sessionId} left`);
  }

  public override onDispose(): void {
    if (this._cleanupIntervalId) {
      clearInterval(this._cleanupIntervalId);
      this._cleanupIntervalId = null;
    }
    console.log('[RoomCodeMatchmaker] Disposed');
  }

  /**
   * Handle create room request
   */
  private async handleCreateRoom(client: Client, message: CreateRoomMessage): Promise<void> {
    try {
      // Generate unique code
      const code = this.generateUniqueCode();
      const now = Date.now();

      // Create pending room entry
      const pendingRoom: PendingRoom = {
        code,
        creatorSessionId: client.sessionId,
        creatorPlayerId: client.auth?.playerId,
        maxPlayers: message.maxPlayers,
        createdAt: now,
        expiresAt: now + this._config.codeExpireMs,
        filters: message.filters,
        joinedCount: 0,
      };

      // Create the actual game room
      const gameId = await this.createGameId();
      const roomOptions = this.buildGameRoomOptions(message.maxPlayers, message.filters);

      const room = await matchMaker.createRoom(this.getGameRoomName(), {
        ...roomOptions,
        gameId,
      });

      pendingRoom.gameRoomId = room.roomId;
      this._pendingRooms.set(code, pendingRoom);

      // Reserve seat for creator
      const reservation = await matchMaker.reserveSeatFor(room, {
        playerId: client.auth?.playerId,
        displayName: client.auth?.displayName,
      });

      pendingRoom.joinedCount++;

      // Notify about creation
      await this.onRoomCreated(pendingRoom, room.roomId);

      // Send success response
      const response: RoomCreatedResponse = {
        code,
        reservation: {
          room: {
            roomId: room.roomId,
            processId: room.processId,
            sessionId: reservation.sessionId,
          },
          sessionId: reservation.sessionId,
        },
      };

      client.send('room_created', response);
      console.log(`[RoomCodeMatchmaker] Room created with code ${code}`);

    } catch (error) {
      console.error('[RoomCodeMatchmaker] Create room error:', error);
      const response: RoomErrorResponse = {
        reason: 'create_failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
      client.send('room_error', response);
    }
  }

  /**
   * Handle join by code request
   */
  private async handleJoinByCode(client: Client, message: JoinByCodeMessage): Promise<void> {
    try {
      const code = message.code.toUpperCase().trim();
      const pendingRoom = this._pendingRooms.get(code);

      // Validate code
      if (!pendingRoom) {
        const response: RoomErrorResponse = { reason: 'invalid_code' };
        client.send('room_error', response);
        return;
      }

      // Check expiration
      if (Date.now() > pendingRoom.expiresAt) {
        this._pendingRooms.delete(code);
        await this.onRoomExpired(pendingRoom);
        const response: RoomErrorResponse = { reason: 'room_expired' };
        client.send('room_error', response);
        return;
      }

      // Check capacity
      if (pendingRoom.joinedCount >= pendingRoom.maxPlayers) {
        const response: RoomErrorResponse = { reason: 'room_full' };
        client.send('room_error', response);
        return;
      }

      // Get room and reserve seat
      if (!pendingRoom.gameRoomId) {
        const response: RoomErrorResponse = { reason: 'invalid_code' };
        client.send('room_error', response);
        return;
      }

      const rooms = await matchMaker.query({ roomId: pendingRoom.gameRoomId });
      if (rooms.length === 0) {
        this._pendingRooms.delete(code);
        const response: RoomErrorResponse = { reason: 'room_expired' };
        client.send('room_error', response);
        return;
      }

      const room = rooms[0];
      const reservation = await matchMaker.reserveSeatFor(room, {
        playerId: client.auth?.playerId,
        displayName: client.auth?.displayName,
      });

      pendingRoom.joinedCount++;

      // Notify about join
      await this.onPlayerJoinedByCode(pendingRoom, client.auth?.playerId);

      // Remove pending room if full
      if (pendingRoom.joinedCount >= pendingRoom.maxPlayers) {
        this._pendingRooms.delete(code);
      }

      // Send success response
      const response: RoomJoinedResponse = {
        reservation: {
          room: {
            roomId: room.roomId,
            processId: room.processId,
            sessionId: reservation.sessionId,
          },
          sessionId: reservation.sessionId,
        },
      };

      client.send('room_joined', response);
      console.log(`[RoomCodeMatchmaker] Player joined room ${code}`);

    } catch (error) {
      console.error('[RoomCodeMatchmaker] Join room error:', error);
      const response: RoomErrorResponse = {
        reason: 'join_failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
      client.send('room_error', response);
    }
  }

  /**
   * Handle cancel room request
   */
  private async handleCancelRoom(client: Client, message: CancelRoomMessage): Promise<void> {
    const code = message.code.toUpperCase().trim();
    const pendingRoom = this._pendingRooms.get(code);

    if (!pendingRoom) {
      return;
    }

    // Only creator can cancel
    if (pendingRoom.creatorSessionId !== client.sessionId) {
      return;
    }

    this._pendingRooms.delete(code);
    console.log(`[RoomCodeMatchmaker] Room ${code} cancelled by creator`);
  }

  /**
   * Generate a unique room code
   */
  private generateUniqueCode(): string {
    const { codeLength, codeCharset } = this._config;
    let code: string;
    let attempts = 0;
    const maxAttempts = 100;

    do {
      code = '';
      for (let i = 0; i < codeLength; i++) {
        const randomIndex = Math.floor(Math.random() * codeCharset.length);
        code += codeCharset[randomIndex];
      }
      attempts++;

      if (attempts >= maxAttempts) {
        throw new Error('Failed to generate unique room code');
      }
    } while (this._pendingRooms.has(code));

    return code;
  }

  /**
   * Cleanup expired pending rooms
   */
  private async cleanupExpiredRooms(): Promise<void> {
    const now = Date.now();
    const expiredCodes: string[] = [];

    for (const [code, room] of this._pendingRooms) {
      if (now > room.expiresAt) {
        expiredCodes.push(code);
      }
    }

    for (const code of expiredCodes) {
      const room = this._pendingRooms.get(code);
      if (room) {
        this._pendingRooms.delete(code);
        await this.onRoomExpired(room).catch(err => {
          console.error('[RoomCodeMatchmaker] onRoomExpired error:', err);
        });
        console.log(`[RoomCodeMatchmaker] Room ${code} expired`);
      }
    }
  }

  /**
   * Get a pending room by code (for testing/debugging)
   */
  public getPendingRoom(code: string): PendingRoom | undefined {
    return this._pendingRooms.get(code.toUpperCase());
  }

  /**
   * Get count of pending rooms
   */
  public get pendingRoomCount(): number {
    return this._pendingRooms.size;
  }
}
