import { ECSConfig } from '@lagless/core';
import { ColyseusRelayRoomOptions } from '@lagless/net-wire';
import { Client, Room, SeatReservation } from 'colyseus.js';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { type MatchmakerState } from '@lagless/colyseus-rooms';

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

  public async connectAndFindMatch(relayServerUrl: string, ecsConfig: ECSConfig, authToken: string) {
    const client = new Client(relayServerUrl);
    const joinOptions: Omit<ColyseusRelayRoomOptions, 'gameId'> = {
      frameLength: ecsConfig.frameLength,
      maxPlayers: ecsConfig.maxPlayers,
    };
    const room: Room<MatchmakerState> = await client.joinOrCreate(
      'matchmaking',
      { ...joinOptions, authToken }
    );

    const seatReservation = await new Promise<SeatReservation>((resolve, reject) => {
      const cleanup = () => {
        unsubscribe();
        clearTimeout(timeoutId);
        unsubscribeOnMessage();
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
    });

    await room.leave(true);

    return { client, seatReservation };
  }
}
