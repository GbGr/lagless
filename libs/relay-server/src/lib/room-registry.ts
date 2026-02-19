import { createLogger } from '@lagless/misc';
import { RelayRoom } from './relay-room.js';
import type {
  MatchId, RoomTypeDefinition, CreateMatchRequest,
  RoomHooks, RoomTypeConfig, InputRegistry,
} from './types.js';

const log = createLogger('RoomRegistry');

/**
 * Manages all rooms on this server instance.
 * Handles room type registration, creation, lookup, and disposal.
 */
export class RoomRegistry {
  private readonly _roomTypes = new Map<string, RoomTypeDefinition>();
  private readonly _rooms = new Map<MatchId, RelayRoom>();
  private _disposalTimer: ReturnType<typeof setInterval>;

  constructor() {
    this._disposalTimer = setInterval(() => this.cleanupDisposed(), 10_000);
  }

  public registerRoomType<TResult>(
    typeName: string,
    config: RoomTypeConfig,
    hooks: RoomHooks<TResult>,
    inputRegistry: InputRegistry,
  ): void {
    if (this._roomTypes.has(typeName)) {
      throw new Error(`Room type "${typeName}" already registered`);
    }
    this._roomTypes.set(typeName, { config, hooks, inputRegistry });
    log.info(`Registered room type "${typeName}"`);
  }

  public createRoom(
    request: CreateMatchRequest,
    seed0: number,
    seed1: number,
    scopeJson = '{}',
  ): RelayRoom {
    const roomType = this._roomTypes.get(request.roomType);
    if (!roomType) {
      throw new Error(`Unknown room type "${request.roomType}"`);
    }

    if (this._rooms.has(request.matchId)) {
      throw new Error(`Room "${request.matchId}" already exists`);
    }

    const room = new RelayRoom(
      request.matchId,
      roomType.config,
      roomType.hooks,
      roomType.inputRegistry,
      request.players,
      seed0,
      seed1,
      scopeJson,
    );

    this._rooms.set(request.matchId, room);
    log.info(`Created room "${request.matchId}" type="${request.roomType}" (total: ${this._rooms.size})`);
    return room;
  }

  public getRoom(matchId: MatchId): RelayRoom | undefined {
    return this._rooms.get(matchId);
  }

  public get roomCount(): number {
    return this._rooms.size;
  }

  public getRoomType(typeName: string): RoomTypeDefinition | undefined {
    return this._roomTypes.get(typeName);
  }

  private cleanupDisposed(): void {
    for (const [id, room] of this._rooms) {
      if (room.isDisposed) {
        this._rooms.delete(id);
        log.info(`Cleaned up disposed room "${id}" (remaining: ${this._rooms.size})`);
      }
    }
  }

  /** Iterates all active (non-disposed) rooms. */
  public forEachRoom(fn: (room: RelayRoom) => void): void {
    for (const room of this._rooms.values()) {
      if (!room.isDisposed) fn(room);
    }
  }

  public async dispose(): Promise<void> {
    clearInterval(this._disposalTimer);
    for (const room of this._rooms.values()) {
      await room.dispose();
    }
    this._rooms.clear();
  }
}
