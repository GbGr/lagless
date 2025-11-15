import { PlayerInfo, RelayColyseusRoom } from '@lagless/colyseus-rooms';
import { RPC } from '@lagless/core';
import { now, UUID } from '@lagless/misc';
import { Client } from 'colyseus';
import { CircleRaceSimulationInputRegistry, PlayerJoined, PlayerLeft } from '@lagless/circle-race-simulation';

export class CircleRaceRelayColyseusRoom extends RelayColyseusRoom {
  protected override onBeforeDispose(players: Array<PlayerInfo>): Promise<void> {
    throw new Error('Method not implemented.');
  }
  protected override onPlayerFinishedGame(playerInfo: PlayerInfo): Promise<void> {
    throw new Error('Method not implemented.');
  }

  public override maxClients = 6;

  public override async onJoin(client: Client) {
    super.onJoin(client);
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    const tick = this._serverTick(now() + 20);
    const playerSlot = this._sessionIdToPlayerSlot.get(client.sessionId);
    if (playerSlot === undefined) throw new Error('Invalid player slot');
    const rpc = new RPC<PlayerJoined>(
      PlayerJoined.id,
      { tick, playerSlot, ordinal: 0, seq: 0 },
      {
        playerId: UUID.generate().asUint8(),
      }
    );
    this.sendServerInputFanout(rpc, CircleRaceSimulationInputRegistry);
  }

  public override onLeave(client: Client, consented: boolean) {
    console.log('onLeave', client.sessionId, consented);
    const tick = this._serverTick(now() + 2);
    const playerSlot = this._sessionIdToPlayerSlot.get(client.sessionId);
    if (playerSlot === undefined) throw new Error('Invalid player slot');
    const rpc = new RPC<PlayerLeft>(
      PlayerLeft.id,
      { tick, playerSlot, ordinal: 0, seq: 0 },
      { reason: consented ? 0 : 1 }
    );
    this.sendServerInputFanout(rpc, CircleRaceSimulationInputRegistry);
    super.onLeave?.(client, consented);
  }
}
