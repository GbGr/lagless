// libs/relay-input-provider/src/lib/matchmaking.ts
import { ECSConfig } from '@lagless/core';
import { Client, Room, SeatReservation } from 'colyseus.js';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { type MatchmakerState } from '@lagless/colyseus-rooms';

interface RoomCreateResponse {
  seatReservation: SeatReservation;
  roomCode: string;
}

interface RoomJoinResponse {
  seatReservation: SeatReservation;
}

export class Matchmaking {
  private readonly _cancelHandlers = new Set<() => void>();
  private _isCancelled = false;

  public get isCancelled() {
    return this._isCancelled;
  }

  public cancel() {
    this._isCancelled = true;
    for (const handler of this._cancelHandlers) {
      handler();
    }
  }

  public onCancel(handler: () => void) {
    this._cancelHandlers.add(handler);

    return () => {
      this._cancelHandlers.delete(handler);
    }
  }

  public async quickMatch(
    relayServerUrl: string,
    ecsConfig: ECSConfig,
    authToken: string,
    filters?: Record<string, string | number>
  ) {
    const client = new Client(relayServerUrl);
    const room: Room<MatchmakerState> = await client.joinOrCreate(
      'matchmaking',
      { authToken }
    );

    room.send('quick_match', {
      frameLength: ecsConfig.frameLength,
      maxPlayers: ecsConfig.maxPlayers,
      filters,
    });

    const seatReservation = await new Promise<SeatReservation>((resolve, reject) => {
      const cleanup = () => {
        unsubscribe();
        clearTimeout(timeoutId);
        unsubscribeOnMessage();
        unsubscribeOnError();
      };
      const unsubscribe = this.onCancel(() => {
        reject(new Error('Matchmaking cancelled'));

        cleanup();
      });
      const timeoutId = setTimeout(() => {
        reject(new Error('MatchFoundTimeout'));

        cleanup();
      }, 30_000);
      const unsubscribeOnMessage = room.onMessage('match_found', (seatReservation: SeatReservation) => {
        resolve(seatReservation);
        cleanup();
      });
      const unsubscribeOnError = room.onMessage('match_error', (error: { reason: string }) => {
        reject(new Error(error.reason));
        cleanup();
      });
    });

    await room.leave(true);

    return { client, seatReservation };
  }

  public async connectAndFindMatch(relayServerUrl: string, ecsConfig: ECSConfig, authToken: string) {
    return this.quickMatch(relayServerUrl, ecsConfig, authToken);
  }

  public async createRoom(
    relayServerUrl: string,
    ecsConfig: ECSConfig,
    authToken: string,
    maxPlayers: number,
    roomCodeLength?: number,
    filters?: Record<string, string | number>
  ) {
    const client = new Client(relayServerUrl);
    const room: Room<MatchmakerState> = await client.joinOrCreate(
      'matchmaking',
      { authToken }
    );

    room.send('create_room', {
      frameLength: ecsConfig.frameLength,
      maxPlayers,
      roomCodeLength,
      filters,
    });

    const result = await new Promise<RoomCreateResponse>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('CreateRoomTimeout'));
      }, 30_000);
      const unsubscribe = room.onMessage('room_created', (payload: RoomCreateResponse) => {
        clearTimeout(timeoutId);
        resolve(payload);
      });
      const unsubscribeError = room.onMessage('room_error', (error: { reason: string }) => {
        clearTimeout(timeoutId);
        reject(new Error(error.reason));
      });

      this.onCancel(() => {
        clearTimeout(timeoutId);
        unsubscribe();
        unsubscribeError();
        reject(new Error('Matchmaking cancelled'));
      });
    });

    await room.leave(true);

    return { client, seatReservation: result.seatReservation, roomCode: result.roomCode };
  }

  public async joinByCode(
    relayServerUrl: string,
    ecsConfig: ECSConfig,
    authToken: string,
    code: string
  ) {
    const client = new Client(relayServerUrl);
    const room: Room<MatchmakerState> = await client.joinOrCreate(
      'matchmaking',
      { authToken }
    );

    room.send('join_room', {
      frameLength: ecsConfig.frameLength,
      maxPlayers: ecsConfig.maxPlayers,
      code,
    });

    const result = await new Promise<RoomJoinResponse>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('JoinRoomTimeout'));
      }, 30_000);
      const unsubscribe = room.onMessage('room_joined', (payload: RoomJoinResponse) => {
        clearTimeout(timeoutId);
        resolve(payload);
      });
      const unsubscribeError = room.onMessage('room_error', (error: { reason: string }) => {
        clearTimeout(timeoutId);
        reject(new Error(error.reason));
      });

      this.onCancel(() => {
        clearTimeout(timeoutId);
        unsubscribe();
        unsubscribeError();
        reject(new Error('Matchmaking cancelled'));
      });
    });

    await room.leave(true);

    return { client, seatReservation: result.seatReservation };
  }
}
